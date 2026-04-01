import { isPromiseLike } from "@tai-kun/is-promise-like";
import type { Promisable } from "./_types.js";

/**
 * `callAsyncableFnOnce` 関数に関連する型定義を管理する名前空間です。
 */
export namespace callAsyncableFnOnce {
  /**
   * キャッシュされた実行結果を保持するための Map 型の定義です。
   *
   * キーには任意の値を指定でき、値には計算結果が格納されます。
   */
  export type CacheMap = Map<unknown, any>;

  /**
   * `callAsyncableFnOnce` が返す戻り値の型を定義します。
   *
   * 入力が `then` メソッドを持つ（Promise ライクな）型である場合、解決後の値を `Promisable` でラップした型を返します。
   *
   * @template T 判定対象となる元の型です。
   */
  export type Return<T> = T extends { readonly then: (...args: any) => any }
    ? Promisable<Awaited<T>>
    : T;
}

/**
 * 指定されたキーに基づき、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 同期および非同期の両方の戻り値に対応しており、非同期の場合は Promise オブジェクトがキャッシュされ、解決され次第その値をキャッシュします。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果を保持するための Map オブジェクトです。
 * @param key キャッシュを識別するためのユニークなキーです。
 * @param fn 実行対象となるコールバック関数です。
 * @returns キャッシュされている値、または新規に実行された関数の戻り値を返します。
 */
export function callAsyncableFnOnce<T>(
  cacheMap: callAsyncableFnOnce.CacheMap,
  key: unknown,
  fn: () => T,
): callAsyncableFnOnce.Return<T> {
  // Map 内に指定されたキーが存在するかどうかを確認します。
  // has メソッドを使用することで、値が undefined の場合でも正しく存在チェックを行います。
  if (cacheMap.has(key)) {
    // すでに指定されたキーでキャッシュが存在する場合は、その値を即座に返します。
    return cacheMap.get(key);
  }

  // コールバック関数を実行して結果を取得します。
  const ret = fn();

  // 戻り値が Promise のよう（then メソッドを持つオブジェクトなど）であるかを確認します。
  if (isPromiseLike(ret)) {
    const innerPromise = Promise.resolve(ret).then(
      val => {
        // 解決された値をキャッシュに保存します。
        // これにより、後続の呼び出しでは Promise ではなく解決後の値が返るようになります。
        cacheMap.set(key, val);

        return val;
      },
      ex => {
        // 非同期処理中にエラーが発生した場合は、不完全なキャッシュ（Promise）を削除します。
        cacheMap.delete(key);

        // キャッチしたエラーをそのまま呼び出し元へ投げます。
        throw ex;
      },
    );

    // 解決を待っている間は、この Promise 自体をキャッシュに登録しておきます。
    // これにより、解決前に再度呼び出された際も同じ Promise を共有できます。
    cacheMap.set(key, innerPromise);
  } else {
    // 戻り値が同期的な値である場合は、そのままキャッシュに保存します。
    cacheMap.set(key, ret);
  }

  // キャッシュから値を取得して返します。
  // 上記の処理により、この時点では必ずキーに対応する値が存在することが保証されます。
  return cacheMap.get(key);
}
