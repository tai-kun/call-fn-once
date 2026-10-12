/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
 */
export namespace callFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export type CacheMap = Map<unknown, any>;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export type Return<T> = T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export type Options<T> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    cacheMap: CacheMap;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    key: unknown;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    fn: () => T;
  };
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once)
 */
export function callFnOnce<T>(
  cacheMap: callFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callFnOnce.Return<T>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#usage)
 */
export function callFnOnce<T>(options: callFnOnce.Options<T>): callFnOnce.Return<T>;

export function callFnOnce<T>(
  ...args:
    | [options: callFnOnce.Options<T>]
    | [cacheMap: callFnOnce.CacheMap, key: unknown, fn: () => T]
): callFnOnce.Return<T> {
  let cacheMap: callFnOnce.CacheMap;
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

  const ret = fn();
  cacheMap.set(key, ret);

  return ret;
}
