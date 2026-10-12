import { getAbortReason, throwIfAborted } from "abort-signal-utils";
import { type Thenable, type MaybePromise, isThenable } from "maypromise";

import { withReentrancyGuard } from "./_reentrancy-guard.js";
import { InconsistentCacheError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
 */
export namespace callAbortableFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Cache =
    | {
        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly busy: true;

        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly value: Promise<any>;
      }
    | {
        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly busy: false;

        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly value: any;
      };

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type CacheMap = Map<unknown, Cache>;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Options<T> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    cacheMap: CacheMap;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    key: unknown;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    fn: (signal: AbortSignal) => T;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * 実行中の処理に対する中断制御と待機シグナルを保持します。
 * 新規実行時に作成され、解決するか全員が中断するまで維持されます。
 * 世代判定に使うため、確定時は登録との一致を確認します。
 */
type State = {
  /**
   * 内部処理を中断させるためのコントローラーです。
   * すべての待機者が中断したときだけ内部処理を中断させます。
   * 実行関数に渡すシグナルの発行元になります。
   */
  readonly ctrl: AbortController;

  /**
   * 処理の完了を待っている待機者のシグナル集合です。
   * シグナル未指定の待機者も数に含めるため、ダミーシグナルとして登録されます。
   * 空になったときは内部処理を中断し、登録を削除します。
   */
  readonly sigs: Set<AbortSignal>;
};

/**
 * キャッシュマップごとに対応する中断状態のマップを保持します。
 * 実行中のキーの状態を世代管理するために使います。
 * 弱参照で保持するため、破棄後は自動的に解放されます。
 * 確定時と全員の中断時に該当キーを削除します。
 */
const stateMapMap = /*#__PURE__*/ new WeakMap<callAbortableFnOnce.CacheMap, Map<unknown, State>>();

/**
 * シグナル未指定の待機者も数に含めるためのダミーシグナルです。
 * 中断されることがないため、待機数の管理だけに使います。
 * シグナル未指定時も集合が空にならないように登録されます。
 */
const dummySignal = /*#__PURE__*/ new AbortController().signal;

/**
 * 指定されたキャッシュに対応する中断状態のマップを取得または作成します。
 * 初回利用時に作成し、以降は同一のマップを再利用します。
 *
 * @param cacheMap 状態を取り出す対象のキャッシュを指定します。
 * @returns 対象キャッシュに対応する中断状態のマップを返します。
 */
function getOrCreateStateMap(cacheMap: callAbortableFnOnce.CacheMap): Map<unknown, State> {
  let stateMap = stateMapMap.get(cacheMap);
  if (!stateMap) {
    stateMap = new Map();
    stateMapMap.set(cacheMap, stateMap);
  }

  return stateMap;
}

/**
 * 待機者の中断を監視し、中断時に共有を解除する Promise を返します。
 * シグナル未指定時は共有 Promise をそのまま返します。
 * 登録時点で中断済みの場合は即座に拒否する Promise を返します。
 * 最後の待機者が中断したときだけ内部処理を中断し、登録を削除します。
 * 共有 Promise の確定後は中断監視を取り外します。
 *
 * @param promise 共有する実行中の Promise を指定します。
 * @param state 中断制御と待機者集合を保持する状態を指定します。
 * @param cacheMap 削除対象のキャッシュを指定します。
 * @param key 削除対象のキーを指定します。
 * @param signal 監視する待機者の中断シグナルを指定します。
 * @param stateMap 削除対象の中断状態のマップを指定します。
 * @returns 中断監視付きの Promise を返します。
 */
function attachAbort(
  promise: Promise<any>,
  state: State,
  cacheMap: callAbortableFnOnce.CacheMap,
  key: unknown,
  signal: AbortSignal | undefined,
  stateMap: Map<unknown, State>,
): Promise<any> {
  // 中断シグナルがなければ、そのまま返します。
  if (!signal) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    // 登録時点で中断済みなら、待機集合から外して即座に拒否します。
    // fn 実行中に同期中断した場合が該当し、最後の 1 人なら内部処理を中断して登録を削除します。
    if (signal.aborted) {
      state.sigs.delete(signal);

      if (state.sigs.size === 0 && stateMap.get(key) === state) {
        state.ctrl.abort(getAbortReason(signal));
        cacheMap.delete(key);
        stateMap.delete(key);
      }

      // 破棄する共有 Promise の拒否が unhandled にならないよう、ダミーの拒否ハンドラを付けます。
      // 新規実行の即時拒否では内部 Promise が孤児化し、他にハンドラがないまま拒否されうるためです。
      // 待機者が残る場合も余分なハンドラとして無害です。
      void promise.then(
        undefined,
        () => {},
      );

      return reject(getAbortReason(signal));
    }

    /**
     * 待機者の中断時に共有の解除と Promise の拒否を行います。
     * 集合から自身を取り除き、最後の 1 人だった場合だけ内部処理を中断し、登録を削除します。
     * 中断理由で拒否した後は、以降の確定を無視します。
     */
    const handleAbort = (): void => {
      state.sigs.delete(signal);

      // 待機者がいなくなったときだけ、内部処理を中断してキャッシュを破棄します。
      // 確定後などで世代が変わっていたら、古い中断で新世代に触らないようにします。
      if (state.sigs.size === 0 && stateMap.get(key) === state) {
        state.ctrl.abort(getAbortReason(signal));
        cacheMap.delete(key);
        stateMap.delete(key);
      }

      reject(getAbortReason(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        signal.removeEventListener("abort", handleAbort);
      });
  });
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once)
 */
export function callAbortableFnOnce<T>(
  cacheMap: callAbortableFnOnce.CacheMap,
  key: unknown,
  fn: (signal: AbortSignal) => T,
  signal?: AbortSignal,
): callAbortableFnOnce.Return<T>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#usage)
 */
export function callAbortableFnOnce<T>(
  options: callAbortableFnOnce.Options<T>,
): callAbortableFnOnce.Return<T>;

export function callAbortableFnOnce<T>(
  ...args:
    | [options: callAbortableFnOnce.Options<T>]
    | [
        cacheMap: callAbortableFnOnce.CacheMap,
        key: unknown,
        fn: (signal: AbortSignal) => T,
        signal?: AbortSignal | undefined,
      ]
): callAbortableFnOnce.Return<T> {
  let cacheMap: callAbortableFnOnce.CacheMap;
  let key: unknown;
  let fn: (signal: AbortSignal) => T;
  let signal: AbortSignal | undefined;
  if (args.length === 1) {
    ({ cacheMap, key, fn, signal } = args[0]);
  } else {
    [cacheMap, key, fn, signal] = args;
  }

  // 中断済みなら、即座に投げます。
  throwIfAborted(signal);

  const stateMap = getOrCreateStateMap(cacheMap);

  // 実行中のキャッシュがあれば、自らも待機者として参加します。
  if (cacheMap.has(key)) {
    const cache = cacheMap.get(key)!;
    if (!cache.busy) {
      // 確定済みの読み取りを優先しつつ、残存した状態があれば削除します。
      stateMap.delete(key);

      return cache.value;
    }

    const state = stateMap.get(key);
    if (!state) {
      throw new InconsistentCacheError();
    }

    // シグナル未指定時はダミーシグナルを登録し、待機者の集合が空になるのを防ぎます。
    state.sigs.add(signal ?? dummySignal);

    return attachAbort(
      cache.value,
      state,
      cacheMap,
      key,
      signal,
      stateMap,
    ) as callAbortableFnOnce.Return<T>;
  }

  // 同期実行中の再入を禁止するため、ガード内で実行します。
  // 解決待ちの共有はガード解除後のため、許可されます。
  return withReentrancyGuard(cacheMap, key, () => {
    // 新規実行用の状態を作成し、自らを待機者として登録します。
    const state: State = {
      ctrl: new AbortController(),
      sigs: new Set<AbortSignal>(),
    };
    stateMap.set(key, state);
    state.sigs.add(signal ?? dummySignal);

    let ret: any;
    try {
      ret = fn(state.ctrl.signal);
    } catch (ex) {
      stateMap.delete(key);

      throw ex;
    }

    if (isThenable(ret)) {
      const innerPromise = Promise.resolve(ret).then(
        (val) => {
          // 中断などで世代が変わっていたら、古い確定を無視します。
          // 手動による上書きも世代交代とみなします。
          if (stateMap.get(key) !== state || cacheMap.get(key)?.value !== innerPromise) {
            return val;
          }

          cacheMap.set(key, {
            busy: false,
            value: val,
          });
          stateMap.delete(key);

          return val;
        },
        (ex) => {
          // 中断などで世代が変わっていたら、古い確定を無視します。
          // 手動で設定された確定値を消さないため、変更せずに投げます。
          if (stateMap.get(key) !== state || cacheMap.get(key)?.value !== innerPromise) {
            throw ex;
          }

          cacheMap.delete(key);
          stateMap.delete(key);

          throw ex;
        },
      );

      cacheMap.set(key, {
        busy: true,
        value: innerPromise,
      });

      return attachAbort(
        innerPromise,
        state,
        cacheMap,
        key,
        signal,
        stateMap,
      ) as callAbortableFnOnce.Return<T>;
    }

    // fn 実行中に待機者が同期中断していたら、結果を確定せず中断理由を投げます。
    // 非同期経路の即時拒否と整合させるためです。
    if (signal !== undefined && signal.aborted) {
      state.ctrl.abort(getAbortReason(signal));
      stateMap.delete(key);

      throw getAbortReason(signal);
    }

    cacheMap.set(key, {
      busy: false,
      value: ret,
    });
    stateMap.delete(key);

    return ret;
  });
}
