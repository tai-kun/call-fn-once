import { MismatchedCacheMapError } from "./errors.js";

/**
 * キャッシュマップごとに対応する所有関数を保持します。
 *
 * 弱参照で保持するため、キャッシュマップが回収されると自動的に解放されます。
 */
const ownersByCacheMap = /*#__PURE__*/ new WeakMap<object, Function>();

/**
 * 指定されたキャッシュマップの所有権を確認し、未登録なら登録します。
 *
 * 別の関数が既に所有しているときは MismatchedCacheMapError を投げます。
 *
 * @param cacheMap 所有権を確認するキャッシュマップを指定します。
 * @param owner 所有者となる関数を指定します。
 */
export function assertCacheMapOwner(cacheMap: object, owner: Function): void {
  const existing = ownersByCacheMap.get(cacheMap);
  if (existing === undefined) {
    ownersByCacheMap.set(cacheMap, owner);
  } else if (existing !== owner) {
    throw new MismatchedCacheMapError();
  }
}
