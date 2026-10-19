import { getAbortReason, throwIfAborted } from "abort-signal-utils";
import { type Thenable, type MaybePromise, isThenable } from "maypromise";

import { assertCacheMapOwner } from "./_cache-map-owner.js";
import { registerPromisableSignal, unregisterPromisableSignal } from "./_promisable-signal.js";
import { withReentrancyGuard } from "./_reentrancy-guard.js";
import { InconsistentCacheError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
 */
namespace callAbortableFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Cache<V = any> =
    | {
        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly busy: true;

        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly value: Promise<V>;
      }
    | {
        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly busy: false;

        /**
         * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
         */
        readonly value: Awaited<V>;
      };

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export interface CacheMap<K = unknown, V = any> {
    has(key: K): boolean;
    get(key: K): Cache<V> | undefined;
    set(key: K, value: Cache<V>): void;
    delete(key: K): void;
  }

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
   */
  export type Options<K, V> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    cacheMap: CacheMap<K, V>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    key: NoInfer<K>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    fn: (signal: AbortSignal) => NoInfer<V>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * 実行中の処理に対する中断制御と待機者の情報を保持します。
 *
 * 新規実行時に作成し、確定するかすべての待機者が中断するまで保持します。
 */
type State = {
  /**
   * 内部処理を中断するためのコントローラーです。
   *
   * すべての待機者が中断したときにだけ内部処理を中断するために使います。
   */
  readonly ctrl: AbortController;

  /**
   * 完了を待っている待機者のシグナル集合です。
   *
   * シグナルを指定しない待機者も数えるため、ダミーシグナルとして登録します。
   */
  readonly sigs: Set<AbortSignal>;
};

/**
 * キャッシュマップごとに対応する中断状態のマップを保持します。
 *
 * 弱参照で保持するため、キャッシュマップが回収されると自動的に解放されます。
 */
const statesByCacheMap = /*#__PURE__*/ new WeakMap<callAbortableFnOnce.CacheMap, Map<any, State>>();

/**
 * シグナルを指定しない待機者も数えるためのダミーシグナルです。
 *
 * 中断しないダミーとして、待機者を数えるためだけに使います。
 */
const dummySignal = /*#__PURE__*/ new AbortController().signal;

/**
 * 指定されたキャッシュマップに対応する中断状態のマップを取得します。
 *
 * 存在しないときは作成して返します。
 */
function getOrCreateStateMap<K, V>(cacheMap: callAbortableFnOnce.CacheMap<K, V>): Map<K, State> {
  const existing = statesByCacheMap.get(cacheMap);
  if (existing) {
    return existing;
  }

  const created = new Map<K, State>();
  statesByCacheMap.set(cacheMap, created);

  return created;
}

/**
 * 新規実行に対応する中断状態を作成します。
 *
 * 内部シグナルはコールバック関数の実行中だけ `toAbortPromise` で Promise に変換できます。
 */
function createState(): State {
  const ctrl = new AbortController();

  // コールバック関数が `toAbortPromise` で待ち受けられるよう、実行前に登録します。
  registerPromisableSignal(ctrl.signal);

  return {
    ctrl,
    sigs: new Set<AbortSignal>(),
  };
}

/**
 * 呼び出し元を待機者として登録します。
 *
 * シグナルを指定しない待機者はダミーシグナルを登録し、集合が空になるのを防ぎます。
 */
function addWaiter(state: State, signal: AbortSignal | undefined): void {
  state.sigs.add(signal ?? dummySignal);
}

/**
 * 待機者を外すときの指定です。
 */
type RemoveWaiterOptions<K, V> = {
  /**
   * 待機者の集合を持つ世代の状態を指定します。
   */
  state: State;

  /**
   * 世代が変わったかを判定するための状態マップを指定します。
   */
  stateMap: Map<K, State>;

  /**
   * 世代の判定と後処理に使うキャッシュマップを指定します。
   */
  cacheMap: callAbortableFnOnce.CacheMap<K, V>;

  /**
   * 処理対象のキーを指定します。
   */
  key: K;

  /**
   * 集合から外す待機者のシグナルを指定します。
   */
  signal: AbortSignal;

  /**
   * 世代を照合するための共有 Promise を指定します。
   */
  promise: Promise<V>;

  /**
   * 内部処理の中断と待機者の拒否に共用する中断理由を指定します。
   *
   * 取得のたびに別物になる環境でも同一性を保ちます。
   * 呼び出し元で 1 度だけ取得します。
   */
  reason: unknown;
};

/**
 * 待機者を集合から外し、最後の待機者だったときだけ内部処理を中断します。
 *
 * 世代が変わっていたときは古い中断で新しい世代に触れないよう何もしません。
 * 手動で確定済みに上書きしたときは新しい世代とみなします。
 * 値は残し、状態だけ外します。
 */
function removeWaiterAndAbortIfLast<K, V>(options: RemoveWaiterOptions<K, V>): void {
  const { key, state, reason, signal, promise, cacheMap, stateMap } = options;
  state.sigs.delete(signal);

  if (state.sigs.size !== 0) {
    return;
  }
  if (stateMap.get(key) !== state) {
    return;
  }

  state.ctrl.abort(reason);
  // 中断で発火した分を含め、内部シグナルに残った `toAbortPromise` のリスナーを外します。
  // 待機者 (呼び出し元) のシグナルは呼び出し元が所有するため触りません。
  unregisterPromisableSignal(state.ctrl.signal);

  // 手動で確定済みに上書きしたときは、新しい世代の値を消さずに残します。
  if (cacheMap.get(key)?.value === promise) {
    cacheMap.delete(key);
  }

  stateMap.delete(key);
}

/**
 * 共有から外れた Promise の拒否が `unhandledRejection` にならないようにします。
 *
 * ダミーの拒否ハンドラーを付けて `unhandledRejection` の報告を抑えます。
 */
function suppressUnhandledRejection(promise: Promise<any>): void {
  void promise.then(undefined, () => {});
}

/**
 * 待機者の中断の監視を付けるときの指定です。
 */
type AttachAbortOptions<K, V> = {
  /**
   * 待機者が共有する Promise を指定します。
   */
  promise: Promise<V>;

  /**
   * 待機者の集合を持つ世代の状態を指定します。
   */
  state: State;

  /**
   * 世代の判定と後処理に使うキャッシュマップを指定します。
   */
  cacheMap: callAbortableFnOnce.CacheMap<K, V>;

  /**
   * 処理対象のキーを指定します。
   */
  key: K;

  /**
   * 監視する待機者のシグナルを指定します。
   *
   * 指定しないときは監視しません。
   */
  signal: AbortSignal | undefined;

  /**
   * 世代が変わったかを判定するための状態マップを指定します。
   */
  stateMap: Map<K, State>;
};

/**
 * 待機者の中断を監視し、中断時に共有を解除する Promise を返します。
 *
 * シグナルを指定しないときは共有 Promise をそのまま返します。
 * 登録時点で中断済みのときは即座に拒否する Promise を返します。
 * この即時分岐は新規実行で fn の実行中に同期中断したときだけ通ります。
 * 既存の実行に参加するときは開始時の `throwIfAborted` でこの関数はすでに投げます。
 * そのため既存の実行では待機者がここで中断済みになることはありません。
 */
function attachAbort<K, V>(options: AttachAbortOptions<K, V>): Promise<V> {
  const { key, state, signal, promise, cacheMap, stateMap } = options;

  // シグナルがないときはそのまま返します。
  if (!signal) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    // fn の実行中に同期中断したときが該当します。
    // 最後の待機者なら内部処理を中断します。
    if (signal.aborted) {
      const reason = getAbortReason(signal);
      removeWaiterAndAbortIfLast({
        key,
        state,
        reason,
        signal,
        promise,
        cacheMap,
        stateMap,
      });
      suppressUnhandledRejection(promise);

      return reject(reason);
    }

    const handleAbort = (): void => {
      const reason = getAbortReason(signal);
      removeWaiterAndAbortIfLast({
        key,
        state,
        reason,
        signal,
        promise,
        cacheMap,
        stateMap,
      });
      reject(reason);
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
 * 確定内容でキャッシュマップを更新するときの指定です。
 */
type SettleOptions<K, V> = {
  /**
   * 世代が変わったかを判定するための状態マップを指定します。
   */
  stateMap: Map<K, State>;

  /**
   * 世代の判定と更新に使うキャッシュマップを指定します。
   */
  cacheMap: callAbortableFnOnce.CacheMap<K, V>;

  /**
   * 処理対象のキーを指定します。
   */
  key: K;

  /**
   * 確定する世代の状態を指定します。
   */
  state: State;

  /**
   * 世代を照合するための共有 Promise を指定します。
   */
  promise: Promise<V>;
};

/**
 * 古い世代の確定かを判定します。
 *
 * 中断による世代交代や手動で確定済みに上書きしたときは `true` を返します。
 */
function isStaleGeneration<K, V>(options: SettleOptions<K, V>): boolean {
  const { key, state, promise, cacheMap, stateMap } = options;

  return stateMap.get(key) !== state || cacheMap.get(key)?.value !== promise;
}

/**
 * 確定待ちの Promise を共有するときの指定です。
 */
type TrackPendingOptions<K, V> = {
  /**
   * 世代が変わったかを判定するための状態マップを指定します。
   */
  stateMap: Map<K, State>;

  /**
   * 共有 Promise の格納に使うキャッシュマップを指定します。
   */
  cacheMap: callAbortableFnOnce.CacheMap<K, V>;

  /**
   * 処理対象のキーを指定します。
   */
  key: K;

  /**
   * 待機者の集合を持つ世代の状態を指定します。
   */
  state: State;

  /**
   * 共有する実行関数の戻り値を指定します。
   */
  ret: Thenable;
};

/**
 * 確定待ちの Promise を共有し、確定内容でキャッシュマップを更新します。
 *
 * 解決後は解決値で確定し、拒否時は削除して次回再実行できるようにします。
 */
function trackPending<K, V>(options: TrackPendingOptions<K, V>): Promise<any> {
  const { key, ret, state, cacheMap, stateMap } = options;
  const promise = Promise.resolve(ret as PromiseLike<V>).then(
    (value) => {
      // 確定後は `toAbortPromise` の待ち受けが不要になるため外します。
      // 世代交代後も旧世代の内部シグナルに残った分を外します。
      unregisterPromisableSignal(state.ctrl.signal);

      if (isStaleGeneration({ key, state, promise, cacheMap, stateMap })) {
        return value;
      }

      cacheMap.set(key, {
        busy: false,
        value,
      });
      stateMap.delete(key);

      return value;
    },
    (ex) => {
      // 拒否時も解決時と同様に内部シグナルの待ち受けを外します。
      unregisterPromisableSignal(state.ctrl.signal);

      if (isStaleGeneration({ key, state, promise, cacheMap, stateMap })) {
        throw ex;
      }

      cacheMap.delete(key);
      stateMap.delete(key);

      throw ex;
    },
  );
  cacheMap.set(key, {
    busy: true,
    value: promise,
  });

  return promise;
}

/**
 * 実行関数を呼び出すときの指定です。
 */
type InvokeFnOptions<T> = {
  /**
   * 内部シグナルを取り出す世代の状態を指定します。
   */
  state: State;

  /**
   * 同期例外時の後処理に使う状態マップを指定します。
   */
  stateMap: Map<unknown, State>;

  /**
   * 処理対象のキーを指定します。
   */
  key: unknown;

  /**
   * 呼び出す実行関数を指定します。
   */
  fn: (signal: AbortSignal) => T;
};

/**
 * 実行関数を呼び出します。
 *
 * 同期例外時は内部シグナルの待ち受けを外し、状態を残さずに投げ直します。
 */
function invokeFn<T>(options: InvokeFnOptions<T>): T {
  const { fn, key, state, stateMap } = options;

  try {
    return fn(state.ctrl.signal);
  } catch (ex) {
    unregisterPromisableSignal(state.ctrl.signal);
    stateMap.delete(key);

    throw ex;
  }
}

/**
 * 位置引数とオプション形式を同一形状にそろえます。
 */
// 3 関数で同形ですが Options 型が別物のため、あえて共通化せず複製しています。
function normalizeArgs<K, V>(
  args:
    | [options: callAbortableFnOnce.Options<K, V>]
    | [
        cacheMap: callAbortableFnOnce.CacheMap<K, V>,
        key: K,
        fn: (signal: AbortSignal) => V,
        signal?: AbortSignal | undefined,
      ],
): callAbortableFnOnce.Options<K, V> {
  if (args.length === 1) {
    return args[0];
  }

  const [cacheMap, key, fn, signal] = args;

  return { fn, key, signal, cacheMap };
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#usage)
 */
function callAbortableFnOnce<K, V>(
  options: callAbortableFnOnce.Options<K, V>,
): callAbortableFnOnce.Return<V>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#usage)
 */
function callAbortableFnOnce<K, V>(
  cacheMap: callAbortableFnOnce.CacheMap<K, V>,
  key: NoInfer<K>,
  fn: (signal: AbortSignal) => NoInfer<V>,
  signal?: AbortSignal,
): callAbortableFnOnce.Return<V>;

function callAbortableFnOnce<K, V>(
  ...args:
    | [options: callAbortableFnOnce.Options<K, V>]
    | [
        cacheMap: callAbortableFnOnce.CacheMap<K, V>,
        key: NoInfer<K>,
        fn: (signal: AbortSignal) => NoInfer<V>,
        signal?: AbortSignal | undefined,
      ]
): Awaited<V> | Promise<V> {
  const { fn, key, signal, cacheMap } = normalizeArgs(args);

  // 別の関数と CacheMap を共有したときは投げます。
  assertCacheMapOwner(cacheMap, callAbortableFnOnce);

  // 中断済みのときは実行せずに即座に投げます。
  throwIfAborted(signal);

  const stateMap = getOrCreateStateMap(cacheMap);

  // 実行中のエントリーがあるときは、自らも待機者として参加します。
  if (cacheMap.has(key)) {
    const cache = cacheMap.get(key)!;
    if (!cache.busy) {
      // 確定済みの読み取りを優先し、残っている状態は削除します。
      stateMap.delete(key);

      return cache.value;
    }

    const state = stateMap.get(key);
    if (!state) {
      throw new InconsistentCacheError();
    }

    addWaiter(state, signal);

    return attachAbort({
      key,
      state,
      signal,
      promise: cache.value,
      cacheMap,
      stateMap,
    });
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  // 確定待ちの共有はガード解除後に行うため許可します。
  return withReentrancyGuard(cacheMap, key, () => {
    const state = createState();
    stateMap.set(key, state);
    addWaiter(state, signal);

    const ret = invokeFn({
      fn,
      key,
      state,
      stateMap,
    });

    if (isThenable(ret)) {
      const promise = trackPending({
        key,
        ret,
        state,
        cacheMap,
        stateMap,
      });

      return attachAbort({
        key,
        state,
        signal,
        promise,
        cacheMap,
        stateMap,
      });
    }

    // 非 Thenable の ret の型は Awaited<V> と同じになりますが、自動で型を絞り込めないので、手動でやります。
    const value = ret as Awaited<V>;

    // fn の実行中に待機者が同期中断していたときは結果を確定しません。
    // 中断理由を投げます。
    // 型には含めないが、JS 相互運用で null が渡ったときは未指定と同様に扱います。
    if (signal?.aborted) {
      const reason = getAbortReason(signal);
      state.ctrl.abort(reason);
      // 中断で発火した分を含め、同期実行中に追加されたリスナーを外します。
      unregisterPromisableSignal(state.ctrl.signal);
      stateMap.delete(key);

      throw reason;
    }

    // 同期確定後は `toAbortPromise` の待ち受けが不要になるため外します。
    unregisterPromisableSignal(state.ctrl.signal);

    cacheMap.set(key, {
      busy: false,
      value,
    });
    stateMap.delete(key);

    return value;
  });
}

export default callAbortableFnOnce;
