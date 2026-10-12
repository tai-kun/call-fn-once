import { describe, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";
import { callFnOnce } from "../src/call-fn-once.js";

// 同一 `Map` の関数間での使い回しは禁止
// （ガイド「キーと CacheMap の設計」の「関数間での共有禁止」を参照）。
// - `callFnOnce` は生の値 `T` を格納する。
// - `callAbortableFnOnce` は `{ busy, value }` ラッパーを格納する。
// 型上は `Map<unknown, any>` 経由で相互に渡せてしまうため、
// 誤って使い回すと同一キーでの逐次読み替えはどちら向きも黙って壊れた値を返す。
// いずれもキャッシュ値でも新規実行値でもない結果を返しており、
// `InconsistentCacheError` すら投げないサイレント破損である。
describe("cross-function Map sharing (known bug)", () => {
  test.fails("abortable が fnOnce の同期キャッシュを undefined として返す", ({ expect }) => {
    // 準備: 同一 Map・同一キーで先に同期値を確定させる。
    const cacheMap = new Map<unknown, any>();
    callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => "hello");

    // 実行: 別関数の型で同じ Map・キーを読む。
    let callCount = 0;
    const result = callAbortableFnOnce(
      cacheMap as callAbortableFnOnce.CacheMap,
      "key",
      () => {
        callCount += 1;

        return "world";
      },
    );

    // 検証: "hello" (共有) か "world" (再実行) のはずが、現状は undefined。
    // いずれの解釈でも undefined はキャッシュ値でも新規値でもなく誤り。
    expect(result).toBe("hello");
    expect(callCount).toBe(0);
  });

  test.fails("fnOnce が abortable の確定キャッシュをラッパーごと返す", ({ expect }) => {
    // 準備: 同一 Map・同一キーで先に abortable 値を確定させる。
    const cacheMap = new Map<unknown, any>();
    callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => "hello");

    // 実行: 別関数の型で同じ Map・キーを読む。
    let callCount = 0;
    const result = callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => {
      callCount += 1;

      return "world";
    });

    // 検証: "hello" を返すべきところ、現状は `{ busy: false, value: "hello" }`。
    expect(result).toBe("hello");
    expect(callCount).toBe(0);
  });
});
