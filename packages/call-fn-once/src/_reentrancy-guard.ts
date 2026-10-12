import { ReentrantCallError } from "./errors.js";

/**
 * 同期実行中のキャッシュマップとキーの組み合わせを保持します。
 *
 * 同期的な再入の検出だけに使い、確定待ちの共有は扱いません。
 */
const inflight = /*#__PURE__*/ new WeakMap<object, Set<unknown>>();

/**
 * 指定されたキャッシュマップに対応する実行中キー集合を取得します。
 *
 * 存在しないときは作成して返します。
 *
 * @param cacheMap 実行中かを判定するキャッシュマップを指定します。
 */
function getOrCreateKeys(cacheMap: object): Set<unknown> {
  const existing = inflight.get(cacheMap);
  if (existing) {
    return existing;
  }

  const keys = new Set<unknown>();
  inflight.set(cacheMap, keys);

  return keys;
}

/**
 * 同一キーへの同期的な再入を禁止しながら指定された処理を実行します。
 *
 * 確定待ちの共有はガード解除後に行うため許可します。
 * 再入を検出したときは ReentrantCallError を投げます。
 *
 * @param cacheMap 実行中かを判定するキャッシュマップを指定します。
 * @param key 再入判定の対象となるキーを指定します。
 * @param fn ガード内で実行する処理を指定します。
 */
export function withReentrancyGuard<T>(cacheMap: object, key: unknown, fn: () => T): T {
  const keys = getOrCreateKeys(cacheMap);
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
