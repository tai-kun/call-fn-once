import { getAbortReason, throwIfAborted } from "abort-signal-utils";
import { type Thenable, type MaybePromise, isThenable } from "maypromise";

/**
 * `callAbortableFnOnce` 関数に関する型定義をまとめた名前空間です。
 */
export namespace callAbortableFnOnce {
  /**
   * キャッシュの状態を表す型定義です。
   *
   * 実行中（busy: true）か完了済み（busy: false）かで、`value` の意味が異なります。
   */
  export type Cache =
    | {
        /**
         * 非同期処理が実行中かどうかを示すフラグです。
         */
        readonly busy: true;

        /**
         * 実行中の非同期処理を表す Promise オブジェクトです。
         */
        readonly value: Promise<any>;
      }
    | {
        /**
         * 処理が完了して結果が確定したことを示すフラグです。
         */
        readonly busy: false;

        /**
         * 確定した実行結果の値です。
         */
        readonly value: any;
      };

  /**
   * 実行結果を保持する Map の型定義です。
   */
  export type CacheMap = Map<unknown, Cache>;

  /**
   * {@link callAbortableFnOnce} が返す値の型を定義します。
   *
   * `T` が `then` メソッドを持つ型（Promise ライク）の場合、解決値を {@link MaybePromise} でラップした型です。
   *
   * @template T コールバック関数の返り値の型です。
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * オブジェクト形式の引数の型定義です。
   */
  export type Options<T> = {
    /**
     * 実行結果を保持する Map オブジェクトです。
     */
    cacheMap: CacheMap;

    /**
     * キャッシュを識別する一意のキーです。
     */
    key: unknown;

    /**
     * 実行するコールバック関数です。内部処理の中断用シグナルを引数に受け取ります。
     */
    fn: (signal: AbortSignal) => T;

    /**
     * 呼び出し元が渡す中断シグナルです。省略可能です。
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * 実行中の非同期処理に紐づく内部状態の型定義です。
 *
 * 待機中の中断シグナルを保持します。すべてが中断されたら元の処理を中断します。
 */
type State = {
  /**
   * コールバック関数に渡す内部処理の中断用 AbortController です。
   */
  readonly ctrl: AbortController;

  /**
   * 完了待ちの外部中断シグナルをすべて保持する集合です。
   */
  readonly sigs: Set<AbortSignal>;
};

/**
 * キャッシュ用 Map ごとに実行状態を管理する WeakMap です。
 *
 * キャッシュ用 Map が破棄されると対応する状態も破棄されるため、メモリリークを防げます。
 */
const stateMapMap = /*#__PURE__*/ new WeakMap<callAbortableFnOnce.CacheMap, Map<unknown, State>>();

/**
 * 中断要求のない呼び出しの代理として登録する、発火しないシグナルです。
 *
 * 待機シグナルが空になって内部処理が中断されるのを防ぎます。
 */
const dummySignal = /*#__PURE__*/ new AbortController().signal;

/**
 * キャッシュ用 Map に対応する内部状態の Map を取得します。
 *
 * 存在しない場合は作成して返します。
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
 * Promise に外部中断シグナルの監視を追加します。
 *
 * 待機中のシグナルがすべて中断されたときだけ、内部処理を中断してキャッシュを破棄します。
 */
function attachAbort(
  promise: Promise<any>,
  state: State,
  cacheMap: callAbortableFnOnce.CacheMap,
  key: unknown,
  signal: AbortSignal | undefined,
): Promise<any> {
  // 中断シグナルがなければ、そのまま返します。
  if (!signal) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    // 登録時点で中断済みなら、即座に拒否します。
    if (signal.aborted) {
      return reject(getAbortReason(signal));
    }

    /**
     * 外部シグナルの中断時に実行されるハンドラーです。
     */
    const handleAbort = (): void => {
      state.sigs.delete(signal);

      // 待機者がいなくなったときだけ、内部処理を中断してキャッシュを破棄します。
      if (state.sigs.size === 0) {
        state.ctrl.abort(getAbortReason(signal));
        cacheMap.delete(key);
      }

      reject(getAbortReason(signal));
      // 以降の確定を無視するため、解決・拒否関数を無効化します。
      resolve = reject = () => {};
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
 * 指定されたキーごとに、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 同期値と非同期値のどちらも受け付けます。非同期の場合は解決待ちの Promise を共有します。解決後はその値を再利用します。
 *
 * すべての呼び出し元が中断したときに限り、実行中のコールバック関数を中断します。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果を保持する Map オブジェクトです。
 * @param key キャッシュを識別する一意のキーです。
 * @param fn 実行するコールバック関数です。内部処理の中断用シグナルを引数に受け取ります。
 * @param signal 呼び出し元が渡す中断シグナルです。省略可能です。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
 */
export function callAbortableFnOnce<T>(
  cacheMap: callAbortableFnOnce.CacheMap,
  key: unknown,
  fn: (signal: AbortSignal) => T,
  signal?: AbortSignal,
): callAbortableFnOnce.Return<T>;

/**
 * 指定されたキーごとに、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * オブジェクト形式で引数を渡す場合のオーバーロードです。
 *
 * @template T コールバック関数が返す値の型です。
 * @param options 実行に必要な引数をまとめたオブジェクトです。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
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
      return cache.value;
    }

    const state = stateMap.get(key);
    if (state) {
      // シグナル未指定時はダミーを登録し、待機シグナルが空になるのを防ぎます。
      state.sigs.add(signal ?? dummySignal);

      return attachAbort(
        cache.value,
        state,
        cacheMap,
        key,
        signal,
      ) as callAbortableFnOnce.Return<T>;
    }
  }

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
        cacheMap.set(key, {
          busy: false,
          value: val,
        });
        stateMap.delete(key);

        return val;
      },
      (ex) => {
        cacheMap.delete(key);
        stateMap.delete(key);

        throw ex;
      },
    );

    cacheMap.set(key, {
      busy: true,
      value: innerPromise,
    });

    return attachAbort(innerPromise, state, cacheMap, key, signal) as callAbortableFnOnce.Return<T>;
  }

  cacheMap.set(key, {
    busy: false,
    value: ret,
  });
  stateMap.delete(key);

  return ret;
}
