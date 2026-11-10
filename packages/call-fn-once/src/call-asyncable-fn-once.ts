import { type MaybePromise, type MaybePromiseLike, isThenable } from "maypromise";

import { assertCacheMapOwner } from "./_cache-map-owner.js";
import { withReentrancyGuard } from "./_reentrancy-guard.js";
import type { $InferMapValue } from "./_type-utilities.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
 */
namespace callAsyncableFnOnce {
  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export interface CacheMap<K = unknown, V = any> {
    has(key: K): boolean;
    get(key: K): MaybePromise<Awaited<V>> | undefined;
    set(key: K, value: MaybePromise<Awaited<V>>): void;
    delete(key: K): void;
  }

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Return<T> = $InferMapValue<CacheMap<unknown, T>>;

  /**
   * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
   */
  export type Options<K, V> = {
    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    readonly cacheMap: CacheMap<K, V>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    readonly key: NoInfer<K>;

    /**
     * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
     */
    readonly fn: () => MaybePromiseLike<NoInfer<V>>;
  };
}

/**
 * 位置引数とオプション形式を同一形状にそろえます。
 */
// 3 関数で同形ですが Options 型が別物のため、あえて共通化せず複製しています。
function normalizeArgs<K, V>(
  args:
    | [options: callAsyncableFnOnce.Options<K, V>]
    | [
        cacheMap: callAsyncableFnOnce.Options<K, V>["cacheMap"],
        key: callAsyncableFnOnce.Options<K, V>["key"],
        fn: callAsyncableFnOnce.Options<K, V>["fn"],
      ],
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
  key: NoInfer<K>,
  value: PromiseLike<NoInfer<V>>,
): Promise<Awaited<V>> {
  const promise = Promise.resolve(value).then(
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
  cacheMap: callAsyncableFnOnce.Options<K, V>["cacheMap"],
  key: callAsyncableFnOnce.Options<K, V>["key"],
  fn: callAsyncableFnOnce.Options<K, V>["fn"],
): callAsyncableFnOnce.Return<V>;

function callAsyncableFnOnce<K, V>(
  ...args:
    | [options: callAsyncableFnOnce.Options<K, V>]
    | [
        cacheMap: callAsyncableFnOnce.Options<K, V>["cacheMap"],
        key: callAsyncableFnOnce.Options<K, V>["key"],
        fn: callAsyncableFnOnce.Options<K, V>["fn"],
      ]
): callAsyncableFnOnce.Return<V> {
  const { fn, key, cacheMap } = normalizeArgs(args);

  // 別の関数と CacheMap を共有したときは投げます。
  assertCacheMapOwner(cacheMap, callAsyncableFnOnce);

  // `has()` で存在を確認するため、`undefined` の値も正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key)!;
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  // 確定待ちの共有はガード解除後に行うため許可します。
  return withReentrancyGuard(cacheMap, key, () => {
    const value = fn();

    if (isThenable(value)) {
      return sharePending(cacheMap, key, value);
    }

    // 非 Thenable の value の型は Awaited<V> と同じになりますが、自動で型を絞り込めないので、手動でやります。
    const awaited = value as Awaited<V>;

    cacheMap.set(key, awaited);

    return awaited;
  });
}

export default callAsyncableFnOnce;
