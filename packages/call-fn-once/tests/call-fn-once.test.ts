import { describe, expectTypeOf, test } from "vitest";

import callAsyncableFnOnce from "../src/call-asyncable-fn-once.js";
import callFnOnce from "../src/call-fn-once.js";
import { MismatchedCacheMapError, ReentrantCallError } from "../src/errors.js";
import { captureThrow, createCounter } from "./_helpers.js";

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
    const counter = createCounter();
    callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return "first";
    });

    // 実行
    const result = callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return "second";
    });

    // 検証
    expect(result).toBe("first");
    expect(counter.getCount()).toBe(1);
  });

  test("undefined をキャッシュする", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const counter = createCounter();
    callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return undefined;
    });

    // 実行
    const result = callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return "second";
    });

    // 検証
    expect(result).toBe(undefined);
    expect(counter.getCount()).toBe(1);
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
    const counter = createCounter();

    // 実行
    const caught = captureThrow(() => {
      callFnOnce(cacheMap, "key", () => {
        counter.increment();
        throw failure;
      });
    });
    const retried = callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return "recovered";
    });

    // 検証
    expect(caught).toBe(failure);
    expect(retried).toBe("recovered");
    expect(counter.getCount()).toBe(2);
  });

  test("キーごとに独立してキャッシュする", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const counter = createCounter();
    const fn = (value: string) => {
      counter.increment();

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
    expect(counter.getCount()).toBe(2);
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

  test("オプション形式でも実行結果を返してキャッシュする", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const counter = createCounter();

    // 実行
    const first = callFnOnce({
      cacheMap,
      key: "key",
      fn: () => {
        counter.increment();

        return "first";
      },
    });
    const second = callFnOnce({
      cacheMap,
      key: "key",
      fn: () => {
        counter.increment();

        return "second";
      },
    });

    // 検証
    expect(first).toBe("first");
    expect(second).toBe("first");
    expect(counter.getCount()).toBe(1);
  });

  test("位置引数とオプション形式でキャッシュを共有する", ({ expect }) => {
    // 準備
    const cacheMap: callFnOnce.CacheMap = new Map();
    const counter = createCounter();
    callFnOnce(cacheMap, "key", () => {
      counter.increment();

      return "first";
    });

    // 実行
    const result = callFnOnce({
      cacheMap,
      key: "key",
      fn: () => {
        counter.increment();

        return "second";
      },
    });

    // 検証
    expect(result).toBe("first");
    expect(counter.getCount()).toBe(1);
  });

  describe("再入", () => {
    test("同一キーでの同期的な再呼び出しは投げて再実行できる", ({ expect }) => {
      // 準備
      const cacheMap: callFnOnce.CacheMap = new Map();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callFnOnce(cacheMap, "key", () => {
          counter.increment();
          callFnOnce(cacheMap, "key", () => "inner");

          return "outer";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect(counter.getCount()).toBe(1);
      const retried = callFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("異なるキーでの再入は許可する", ({ expect }) => {
      // 準備
      const cacheMap: callFnOnce.CacheMap = new Map();

      // 実行
      const result = callFnOnce(cacheMap, "a", () => {
        const inner = callFnOnce(cacheMap, "b", () => "B");

        return `A:${inner}`;
      });

      // 検証
      expect(result).toBe("A:B");
    });

    test("別の関数で同じ CacheMap を使うと投げる", ({ expect }) => {
      // 準備
      const cacheMap = new Map<unknown, any>();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callFnOnce(cacheMap, "key", () => {
          counter.increment();
          callAsyncableFnOnce(cacheMap, "key", () => "inner");

          return "outer";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(MismatchedCacheMapError);
      expect(counter.getCount()).toBe(1);
      const retried = callFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });
  });

  test("返り値の型はコールバックにでなくキャッシュマップから推論される", () => {
    // 準備
    const cacheMap: callFnOnce.CacheMap<string, string | number> = new Map();
    const undefinedCacheMap: callFnOnce.CacheMap<string, undefined> = new Map();

    // 実行と検証
    expectTypeOf(callFnOnce(cacheMap, "key", () => 1)).toEqualTypeOf<string | number>();
    expectTypeOf(callFnOnce(undefinedCacheMap, "key", () => undefined)).toEqualTypeOf<undefined>();
    expectTypeOf(callFnOnce({ cacheMap, key: "key", fn: () => 1 })).toEqualTypeOf<
      string | number
    >();
  });
});
