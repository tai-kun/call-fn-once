import { type Thenable, type MaybePromise, isThenable } from "maypromise";

import { assertCacheMapOwner } from "./_cache-map-owner.js";
import { withReentrancyGuard } from "./_reentrancy-guard.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
 */
namespace callAsyncableFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export interface CacheMap<K = unknown, V = any> {
    has(key: K): boolean;
    get(key: K): MaybePromise<V> | undefined;
    set(key: K, value: MaybePromise<V>): void;
    delete(key: K): void;
  }

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Options<K, V> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    cacheMap: CacheMap<K, V>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    key: NoInfer<K>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
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
    | [options: callAsyncableFnOnce.Options<K, V>]
    | [cacheMap: callAsyncableFnOnce.CacheMap<K, V>, key: K, fn: () => V],
): callAsyncableFnOnce.Options<K, V> {
  if (args.length === 1) {
    return args[0];
  }

  const [cacheMap, key, fn] = args;

  return { fn, key, cacheMap };
}

/**
 * 確定待ちの Promise を共有し、確定内容でキャッシュマップを更新します。
 *
 * 解決後は解決値で確定し、拒否時は削除して次回再実行できるようにします。
 */
function sharePending<K, V>(
  cacheMap: callAsyncableFnOnce.CacheMap<K, V>,
  key: K,
  ret: Thenable,
): Promise<V> {
  const promise = Promise.resolve(ret as PromiseLike<V>).then(
    (val) => {
      cacheMap.set(key, val);

      return val;
    },
    (ex) => {
      cacheMap.delete(key);

      throw ex;
    },
  );
  cacheMap.set(key, promise);

  return promise;
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#usage)
 */
function callAsyncableFnOnce<K, V>(
  options: callAsyncableFnOnce.Options<K, V>,
): callAsyncableFnOnce.Return<V>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#usage)
 */
function callAsyncableFnOnce<K, V>(
  cacheMap: callAsyncableFnOnce.CacheMap<K, V>,
  key: NoInfer<K>,
  fn: () => NoInfer<V>,
): callAsyncableFnOnce.Return<V>;

function callAsyncableFnOnce<K, V>(
  ...args:
    | [options: callAsyncableFnOnce.Options<K, V>]
    | [cacheMap: callAsyncableFnOnce.CacheMap<K, V>, key: NoInfer<K>, fn: () => NoInfer<V>]
): Awaited<V> | Promise<V> {
  const { fn, key, cacheMap } = normalizeArgs(args);

  // 別の関数と CacheMap を共有したときは投げます。
  assertCacheMapOwner(cacheMap, callAsyncableFnOnce);

  // `has()` で存在を確認するため、`undefined` の値も正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key) as Awaited<V> | Promise<V>;
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  // 確定待ちの共有はガード解除後に行うため許可します。
  return withReentrancyGuard(cacheMap, key, () => {
    const ret = fn();

    if (isThenable(ret)) {
      return sharePending(cacheMap, key, ret);
    }

    // 非 Thenable の ret の型は Awaited<V> と同じになりますが、自動で型を絞り込めないので、手動でやります。
    const value = ret as Awaited<V>;

    cacheMap.set(key, value);

    return value;
  });
}

export default callAsyncableFnOnce;
