import { assertCacheMapOwner } from "./_cache-map-owner.js";
import { withReentrancyGuard } from "./_reentrancy-guard.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
 */
namespace callFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export interface CacheMap<K = unknown, V = any> {
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): void;
  }

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export type Return<T> = T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
   */
  export type Options<K, V> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    cacheMap: CacheMap<K, V>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    key: NoInfer<K>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#types)
     */
    fn: () => NoInfer<V>;
  };
}

/**
 * 位置引数とオプション形式を同一形状にそろえます。
 */
// 3 関数で同形ですが Options 型が別物のため、あえて共通化せず複製しています。
function normalizeArgs<K, V>(
  args:
    | [options: callFnOnce.Options<K, V>]
    | [cacheMap: callFnOnce.CacheMap<K, V>, key: K, fn: () => V],
): callFnOnce.Options<K, V> {
  if (args.length === 1) {
    return args[0];
  }

  const [cacheMap, key, fn] = args;

  return { fn, key, cacheMap };
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once)
 */
function callFnOnce<K, V>(
  cacheMap: callFnOnce.CacheMap<K, V>,
  key: NoInfer<K>,
  fn: () => NoInfer<V>,
): callFnOnce.Return<V>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-fn-once#usage)
 */
function callFnOnce<K, V>(options: callFnOnce.Options<K, V>): callFnOnce.Return<V>;

function callFnOnce<K, V>(
  ...args:
    | [options: callFnOnce.Options<K, V>]
    | [cacheMap: callFnOnce.CacheMap<K, V>, key: NoInfer<K>, fn: () => NoInfer<V>]
): callFnOnce.Return<V> {
  const { fn, key, cacheMap } = normalizeArgs(args);

  // 別の関数と CacheMap を共有したときは投げます。
  assertCacheMapOwner(cacheMap, callFnOnce);

  // `has()` で存在を確認するため、`undefined` の値も正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key)!;
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  return withReentrancyGuard(cacheMap, key, () => {
    const ret = fn();
    cacheMap.set(key, ret);

    return ret;
  });
}

export default callFnOnce;
