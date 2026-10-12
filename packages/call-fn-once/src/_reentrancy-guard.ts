import { ReentrantCallError } from "./errors.js";

/**
 * 同期実行中のキャッシュとキーの組み合わせを保持します。
 * 同一キーへの同期的な再入だけを検出するために使います。
 * 解決待ちの非同期共有は対象外であり、許可されます。
 * 3 つの関数の同期実行部分で共有されます。
 * 実行終了後は登録したキーを取り除きます。
 */
const inflight = new WeakMap<object, Set<unknown>>();

/**
 * 同一キーへの再入呼び出しを禁止しながら指定された処理を実行します。
 * 同期実行中の再入だけを検出し、解決待ちの共有は許可します。
 * 3 つの関数の同期実行部分で共有されます。
 * 再入を検出した場合は ReentrantCallError を投げます。
 * 処理の終了後は登録したキーを取り除きます。
 *
 * @param cacheMap 実行中かどうかを判定するキャッシュを指定します。
 * @param key 再入判定の対象となるキーを指定します。
 * @param fn ガード内で実行する処理を指定します。
 * @returns 実行結果をそのまま返します。
 */
export function withReentrancyGuard<T>(cacheMap: object, key: unknown, fn: () => T): T {
  let keys = inflight.get(cacheMap);
  if (!keys) {
    keys = new Set();
    inflight.set(cacheMap, keys);
  }
  if (keys.has(key)) {
    throw new ReentrantCallError();
  }

  keys.add(key);

  try {
    return fn();
  } finally {
    keys.delete(key);
  }
}
