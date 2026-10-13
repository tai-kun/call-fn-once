import { type Thenable, type MaybePromise, isThenable } from "maypromise";

import { withReentrancyGuard } from "./_reentrancy-guard.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#types)
 */
namespace callAsyncableFnOnce {
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
 * 位置引数とオプション形式を同一形状にそろえます。
 */
// 3 関数で同形ですが Options 型が別物のため、あえて共通化せず複製しています。
function normalizeArgs<T>(
  args:
    | [options: callAsyncableFnOnce.Options<T>]
    | [cacheMap: callAsyncableFnOnce.CacheMap, key: unknown, fn: () => T],
): callAsyncableFnOnce.Options<T> {
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
function sharePending(
  cacheMap: callAsyncableFnOnce.CacheMap,
  key: unknown,
  ret: Thenable,
): Promise<any> {
  const promise = Promise.resolve(ret).then(
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
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once)
 */
function callAsyncableFnOnce<T>(
  cacheMap: callAsyncableFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callAsyncableFnOnce.Return<T>;

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-asyncable-fn-once#usage)
 */
function callAsyncableFnOnce<T>(
  options: callAsyncableFnOnce.Options<T>,
): callAsyncableFnOnce.Return<T>;

function callAsyncableFnOnce<T>(
  ...args:
    | [options: callAsyncableFnOnce.Options<T>]
    | [cacheMap: callAsyncableFnOnce.CacheMap, key: unknown, fn: () => T]
): callAsyncableFnOnce.Return<T> {
  const { fn, key, cacheMap } = normalizeArgs(args);

  // `has()` で存在を確認するため、`undefined` の値も正しく扱えます。
  if (cacheMap.has(key)) {
    return cacheMap.get(key);
  }

  // 同期的な再入を禁止するため、ガード内で実行します。
  // 確定待ちの共有はガード解除後に行うため許可します。
  return withReentrancyGuard(cacheMap, key, () => {
    const ret = fn();

    if (isThenable(ret)) {
      return sharePending(cacheMap, key, ret) as callAsyncableFnOnce.Return<T>;
    }

    cacheMap.set(key, ret);

    return ret as callAsyncableFnOnce.Return<T>;
  });
}

export default callAsyncableFnOnce;
