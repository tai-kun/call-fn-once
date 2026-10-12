import { type Thenable, type MaybePromise, isThenable } from "maypromise";

/**
 * `callAsyncableFnOnce` 関数に関する型定義をまとめた名前空間です。
 */
export namespace callAsyncableFnOnce {
  /**
   * 実行結果を保持する Map の型定義です。
   *
   * 任意の値をキー、計算結果を値として保持します。
   */
  export type CacheMap = Map<unknown, MaybePromise<any>>;

  /**
   * {@link callAsyncableFnOnce} が返す値の型を定義します。
   *
   * `T` が `then` メソッドを持つ型（Promise ライク）の場合、解決値を {@link MaybePromise} でラップした型を返します。
   *
   * @template T コールバック関数の返り値の型です。
   */
  export type Return<T> = T extends Thenable ? MaybePromise<Awaited<T>> : T;

  /**
   * オブジェクト形式で渡す引数の型定義です。
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
     * 実行するコールバック関数です。
     */
    fn: () => T;
  };
}

/**
 * 指定されたキーごとに、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 同期値と非同期値のどちらも受け付けます。非同期の場合は解決待ちの Promise を共有し、解決後はその値を返します。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果を保持する Map オブジェクトです。
 * @param key キャッシュを識別する一意のキーです。
 * @param fn 実行するコールバック関数です。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
 */
export function callAsyncableFnOnce<T>(
  cacheMap: callAsyncableFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callAsyncableFnOnce.Return<T>;

/**
 * 指定されたキーごとに、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 引数をオブジェクト形式で渡す場合のオーバーロードです。
 *
 * @template T コールバック関数が返す値の型です。
 * @param options 実行に必要な引数をまとめたオブジェクトです。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
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
}
