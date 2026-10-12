import { withReentrancyGuard } from "./_reentrancy-guard.js";

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
 * 位置引数とオプション形式を同一形状にそろえます。
 */
// 3 関数で同形ですが Options 型が別物のため、あえて共通化せず複製しています。
function normalizeArgs<T>(
  args:
    | [options: callFnOnce.Options<T>]
    | [cacheMap: callFnOnce.CacheMap, key: unknown, fn: () => T],
): callFnOnce.Options<T> {
  if (args.length === 1) {
    return args[0];
  }

  const [cacheMap, key, fn] = args;

  return { fn, key, cacheMap };
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
  const { fn, key, cacheMap } = normalizeArgs(args);

  // `has()` で存在を確認するため、`undefined` の値も正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key);
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  return withReentrancyGuard(cacheMap, key, () => {
    const ret = fn();
    cacheMap.set(key, ret);

    return ret;
  });
}
