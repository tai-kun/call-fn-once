import { describe, expectTypeOf, test } from "vitest";

import { callFnOnce } from "../src/call-fn-once.js";
import { captureThrow } from "./_helpers.js";

describe("callFnOnce", () => {
  test("初回の実行結果を返す", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();

    // 実行
    const result = callFnOnce(cacheMap, "key", () => 42);

    // 検証
    expect(result).toBe(42);
  });

  test("2 回目以降は関数を実行せず、キャッシュを返す", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    let callCount = 0;
    callFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "first";
    });

    // 実行
    const result = callFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "second";
    });

    // 検証
    expect(result).toBe("first");
    expect(callCount).toBe(1);
  });

  test("undefined をキャッシュする", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    let callCount = 0;
    callFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return undefined;
    });

    // 実行
    const result = callFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "second";
    });

    // 検証
    expect(result).toBe(undefined);
    expect(callCount).toBe(1);
  });

  test("キャッシュしたオブジェクトは同一参照で返す", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const value = { id: 1 };

    // 実行
    const first = callFnOnce(cacheMap, "key", () => value);
    const second = callFnOnce(cacheMap, "key", () => ({ id: 2 }));

    // 検証
    expect(first).toBe(value);
    expect(second).toBe(value);
  });

  test("同期例外はキャッシュせず、次回再実行する", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const failure = new Error("boom");
    let callCount = 0;

    // 実行
    const caught = captureThrow(() => {
      callFnOnce(cacheMap, "key", () => {
        callCount += 1;
        throw failure;
      });
    });
    const retried = callFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "recovered";
    });

    // 検証
    expect(caught).toBe(failure);
    expect(retried).toBe("recovered");
    expect(callCount).toBe(2);
  });

  test("キーごとに独立してキャッシュする", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    let callCount = 0;
    const fn = (value: string) => {
      callCount += 1;

      return value;
    };

    // 実行
    const first = callFnOnce(cacheMap, "a", () => fn("A"));
    const second = callFnOnce(cacheMap, "b", () => fn("B"));
    const cached = callFnOnce(cacheMap, "a", () => fn("A2"));

    // 検証
    expect(first).toBe("A");
    expect(second).toBe("B");
    expect(cached).toBe("A");
    expect(callCount).toBe(2);
  });

  test("キャッシュ Map ごとに独立している", ({ expect }) => {
    // 準備
    const firstMap: callFnOnce.CacheMap = new Map();
    const secondMap: callFnOnce.CacheMap = new Map();

    // 実行
    const first = callFnOnce(firstMap, "key", () => "A");
    const second = callFnOnce(secondMap, "key", () => "B");

    // 検証
    expect(first).toBe("A");
    expect(second).toBe("B");
  });

  test("返り値の型が入力の型と一致する", () => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();

    // 実行と検証
    expectTypeOf(callFnOnce(cacheMap, "key", () => 1)).toEqualTypeOf<number>();
    expectTypeOf(callFnOnce(cacheMap, "key", () => undefined)).toEqualTypeOf<undefined>();
  });
});
