import { describe, test } from "vitest";

import callAbortableFnOnce from "../src/call-abortable-fn-once.js";
import callAsyncableFnOnce from "../src/call-asyncable-fn-once.js";
import callFnOnce from "../src/call-fn-once.js";
import { MismatchedCacheMapError } from "../src/errors.js";
import { createCounter } from "./_helpers.js";

// 同一 `Map` を関数間で使い回すことはできません。
// （ガイド「キーと CacheMap の設計」の「関数間での共有禁止」を参照します）。
// - `callFnOnce` は生の値 `T` を格納します。
// - `callAbortableFnOnce` は `{ busy, value }` ラッパーを格納します。
// 型の上では `Map<unknown, any>` 経由で相互に渡せてしまうため、
// 所有権の登録で実行時に検出して `MismatchedCacheMapError` を投げます。
describe("CacheMap の所有権", () => {
  test("fnOnce の Map を abortable で使うと投げる", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に同期値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => "hello");

    // 実行と検証: 別関数の型で同じ Map とキーを読むと投げます。
    const counter = createCounter();
    expect(() => {
      callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => {
        counter.increment();

        return "world";
      });
    }).toThrow(MismatchedCacheMapError);
    expect(counter.getCount()).toBe(0);
  });

  test("abortable の Map を fnOnce で使うと投げる", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に abortable 値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => "hello");

    // 実行と検証: 別関数の型で同じ Map とキーを読むと投げます。
    const counter = createCounter();
    expect(() => {
      callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => {
        counter.increment();

        return "world";
      });
    }).toThrow(MismatchedCacheMapError);
    expect(counter.getCount()).toBe(0);
  });

  test("fnOnce の Map を asyncable で使うと投げる", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に同期値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callFnOnce(cacheMap as callFnOnce.CacheMap, "key", () => "hello");

    // 実行と検証: 別関数の型で同じ Map とキーを読むと投げます。
    const counter = createCounter();
    expect(() => {
      callAsyncableFnOnce(cacheMap as callAsyncableFnOnce.CacheMap, "key", () => {
        counter.increment();

        return "world";
      });
    }).toThrow(MismatchedCacheMapError);
    expect(counter.getCount()).toBe(0);
  });

  test("asyncable の Map を abortable で使うと投げる", ({ expect }) => {
    // 準備: 同一 Map と同一キーで先に asyncable 値を確定させます。
    const cacheMap = new Map<unknown, any>();
    callAsyncableFnOnce(cacheMap as callAsyncableFnOnce.CacheMap, "key", () => "hello");

    // 実行と検証: 別関数の型で同じ Map とキーを読むと投げます。
    const counter = createCounter();
    expect(() => {
      callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "key", () => {
        counter.increment();

        return "world";
      });
    }).toThrow(MismatchedCacheMapError);
    expect(counter.getCount()).toBe(0);
  });

  test("キーが異なっても同じ Map の使い回しは投げる", ({ expect }) => {
    // 準備: キーが重ならなければ壊れませんが、将来の衝突を防ぐため禁止します。
    const cacheMap = new Map<unknown, any>();
    callFnOnce(cacheMap as callFnOnce.CacheMap, "a", () => "hello");

    // 実行と検証: 異なるキーでも同じ Map を別関数で使うと投げます。
    expect(() => {
      callAbortableFnOnce(cacheMap as callAbortableFnOnce.CacheMap, "b", () => "world");
    }).toThrow(MismatchedCacheMapError);
  });

  test("関数ごとに Map を分けると投げない", ({ expect }) => {
    // 準備: 関数ごとに Map を分けます。
    const syncMap: callFnOnce.CacheMap = new Map();
    const abortableMap: callAbortableFnOnce.CacheMap = new Map();

    // 実行
    const first = callFnOnce(syncMap, "key", () => "hello");
    const second = callAbortableFnOnce(abortableMap, "key", () => "world");

    // 検証
    expect(first).toBe("hello");
    expect(second).toBe("world");
  });
});
