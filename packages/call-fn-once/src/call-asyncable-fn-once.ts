import { type Thenable, type MaybePromise, isThenable } from "maypromise";

import { withReentrancyGuard } from "./_reentrancy-guard.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
 */
export namespace callAsyncableFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type CacheMap = Map<unknown, MaybePromise<any>>;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Options<T> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    cacheMap: CacheMap;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    key: unknown;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    fn: () => T;
  };
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once)
 */
export function callAsyncableFnOnce<T>(
  cacheMap: callAsyncableFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callAsyncableFnOnce.Return<T>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#usage)
 */
export function callAsyncableFnOnce<T>(
  options: callAsyncableFnOnce.Options<T>,
): callAsyncableFnOnce.Return<T>;

export function callAsyncableFnOnce<T>(
  ...args:
    | [options: callAsyncableFnOnce.Options<T>]
    | [cacheMap: callAsyncableFnOnce.CacheMap, key: unknown, fn: () => T]
): callAsyncableFnOnce.Return<T> {
  let cacheMap: callAsyncableFnOnce.CacheMap;
  let key: unknown;
  let fn: () => T;
  if (args.length === 1) {
    ({ cacheMap, key, fn } = args[0]);
  } else {
    [cacheMap, key, fn] = args;
  }

  // `has()` で存在を確認するので、`undefined` のキャッシュも正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key);
  }

  // 同期実行中の再入を禁止するため、ガード内で実行します。
  // 解決待ちの共有はガード解除後のため、許可されます。
  return withReentrancyGuard(cacheMap, key, () => {
    const ret = fn();

    if (!isThenable(ret)) {
      cacheMap.set(key, ret);

      return ret as callAsyncableFnOnce.Return<T>;
    }

    // 解決待ちの間は Promise 自体を共有し、解決後は解決値で置き換えます。
    // 拒否時はキャッシュを破棄するので、次回は再実行します。
    const innerPromise = Promise.resolve(ret).then(
      (val) => {
        cacheMap.set(key, val);

        return val;
      },
      (ex) => {
        cacheMap.delete(key);

        throw ex;
      },
    );
    cacheMap.set(key, innerPromise);

    return innerPromise as callAsyncableFnOnce.Return<T>;
  });
}
