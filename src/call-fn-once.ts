/**
 * `callFnOnce` 関数に関連する型定義を管理する名前空間です。
 */
export namespace callFnOnce {
  /**
   * 実行結果をキャッシュするための Map オブジェクトの型定義です。
   *
   * キーには任意の値を指定でき、値には計算結果が格納されます。
   */
  export type CacheMap = Map<unknown, any>;

  /**
   * 関数の戻り値の型を表すジェネリック型です。
   *
   * @template T 戻り値の型です。
   */
  export type Return<T> = T;
}

/**
 * 指定されたキーに基づき、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 二回目以降の呼び出しでは、キャッシュされた結果を直接返します。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果を保持するための Map オブジェクトです。
 * @param key キャッシュを識別するためのユニークなキーです。
 * @param fn 実行対象となるコールバック関数です。
 * @returns キャッシュされている値、または新規に実行された関数の戻り値を返します。
 */
export function callFnOnce<T>(
  cacheMap: callFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callFnOnce.Return<T> {
  // Map 内に指定されたキーが存在するかどうかを確認します。
  // has メソッドを使用することで、値が undefined の場合でも正しく存在チェックを行います。
  if (!cacheMap.has(key)) {
    // キーが存在しない場合は、提供されたコールバック関数を実行します。
    // 実行して得られた結果を、指定されたキーに関連付けてキャッシュに保存します。
    cacheMap.set(key, fn());
  }

  // キャッシュから値を取得して返します。
  // 上記の条件分岐により、この時点では必ずキーに対応する値が存在することが保証されます。
  return cacheMap.get(key);
}
