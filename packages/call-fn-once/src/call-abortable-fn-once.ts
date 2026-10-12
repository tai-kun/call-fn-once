import { getAbortReason, throwIfAborted } from "abort-signal-utils";
import { type Thenable, type MaybePromise, isThenable } from "maypromise";

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
 * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#waiters)
 */
type State = {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#waiters)
   */
  readonly ctrl: AbortController;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#waiters)
   */
  readonly sigs: Set<AbortSignal>;
};

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/guides/cache-keys#memory)
 */
const stateMapMap = /*#__PURE__*/ new WeakMap<callAbortableFnOnce.CacheMap, Map<unknown, State>>();

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#without-signal)
 */
const dummySignal = /*#__PURE__*/ new AbortController().signal;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/guides/cache-keys#memory)
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
 * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#waiters)
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
     * [API Reference](https://tai-kun.github.io/call-fn-once/guides/abort-patterns#waiters)
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
