import { describe, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";
import { callFnOnce } from "../src/call-fn-once.js";
import { createCounter } from "./_helpers.js";

// 同一 `Map` を関数間で使い回すことはできません。
// （ガイド「キーと CacheMap の設計」の「関数間での共有禁止」を参照します）。
// - `callFnOnce` は生の値 `T` を格納します。
// - `callAbortableFnOnce` は `{ busy, value }` ラッパーを格納します。
// 型の上では `Map<unknown, any>` 経由で相互に渡せてしまうため、
// 誤って使い回すと同一キーでの逐次読み替えはどちら向きも壊れた値を黙って返します。
// いずれもキャッシュ値でも新規実行値でもない結果を返します。
// `InconsistentCacheError` すら投げないサイレント破損になります。
describe("cross-function Map sharing (known bug)", () => {
  test.fails("abortable が fnOnce の同期キャッシュを undefined として返す", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に同期値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => "hello");

    // 実行: 別関数の型で同じ Map とキーを読みます。
    const counter = createCounter();
    const result = callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => {
      counter.increment();

      return "world";
    });

    // 検証: "hello"（共有）か "world"（再実行）のはずが、現状は undefined を返します。
    // いずれの解釈でも undefined はキャッシュ値でも新規値でもなく誤りです。
    expect(result).toBe("hello");
    expect(counter.getCount()).toBe(0);
  });

  test.fails("fnOnce が abortable の確定キャッシュをラッパーごと返す", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に abortable 値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => "hello");

    // 実行: 別関数の型で同じ Map とキーを読みます。
    const counter = createCounter();
    const result = callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => {
      counter.increment();

      return "world";
    });

    // 検証: "hello" を返すべきところ、現状は `{ busy: false, value: "hello" }` を返します。
    expect(result).toBe("hello");
    expect(counter.getCount()).toBe(0);
  });
});
