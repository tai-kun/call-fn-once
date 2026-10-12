/**
 * `callFnOnce` 関数に関する型定義をまとめた名前空間です。
 */
export namespace callFnOnce {
  /**
   * 実行結果を保持する Map の型定義です。
   *
   * 任意の値をキーとして、計算結果を値として保持します。
   */
  export type CacheMap = Map<unknown, any>;

  /**
   * 関数の返り値の型です。
   *
   * @template T 返り値の型です。
   */
  export type Return<T> = T;

  /**
   * オブジェクト形式の引数の型定義です。
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
 * 2 回目以降の呼び出しでは、再実行せずにキャッシュされた結果を返します。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果を保持する Map オブジェクトです。
 * @param key キャッシュを識別する一意のキーです。
 * @param fn 実行するコールバック関数です。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
 */
export function callFnOnce<T>(
  cacheMap: callFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callFnOnce.Return<T>;

/**
 * 指定されたキーごとに、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * オブジェクト形式で引数を渡す場合のオーバーロードです。
 *
 * @template T コールバック関数が返す値の型です。
 * @param options 実行に必要な引数をまとめたオブジェクトです。
 * @returns キャッシュ済みの値、または今回の実行結果を返します。
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
