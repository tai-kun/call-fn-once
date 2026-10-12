import { describe, expectTypeOf, test } from "vitest";

import { callAsyncableFnOnce } from "../src/call-asyncable-fn-once.js";
import { captureThrow, createDeferred } from "./_helpers.js";

describe("callAsyncableFnOnce", () => {
  describe("同期実行", () => {
    test("同期値をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;
      callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "first";
      });

      // 実行
      const result = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "second";
      });

      // 検証
      expect(result).toBe("first");
      expect(callCount).toBe(1);
    });

    test("同期の undefined をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;
      callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return undefined;
      });

      // 実行
      const result = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "second";
      });

      // 検証
      expect(result).toBe(undefined);
      expect(callCount).toBe(1);
    });

    test("同期例外はキャッシュせず、次回再実行する", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("boom");
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;
          throw failure;
        });
      });
      const retried = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });

      // 検証
      expect(caught).toBe(failure);
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });
  });

  describe("非同期実行", () => {
    test("非同期の解決値をキャッシュし、解決後は値を直接返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;
      const pending = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve("ok");
        }),
      );

      // 実行
      await expect(pending).resolves.toBe("ok");
      const cached = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return Promise.resolve("unexpected");
      });

      // 検証
      expect(cached).toBe("ok");
      expect(callCount).toBe(1);
    });

    test("解決前の並行呼び出しを単一実行にまとめる", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      let callCount = 0;

      // 実行
      const first = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return deferred.promise;
        }),
      );
      const second = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve("unexpected");
        }),
      );
      deferred.resolve("ok");

      // 検証
      await expect(first).resolves.toBe("ok");
      await expect(second).resolves.toBe("ok");
      expect(callCount).toBe(1);
    });

    test("非同期の拒否はキャッシュせず、次回再実行する", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      let callCount = 0;

      // 実行
      const rejected = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.reject(failure);
        }),
      );
      await expect(rejected).rejects.toBe(failure);
      const retried = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });

      // 検証
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("並行呼び出しの拒否は両方に伝わる", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      let callCount = 0;

      // 実行
      const first = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.reject(failure);
        }),
      );
      const second = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve("unexpected");
        }),
      );

      // 検証
      await expect(first).rejects.toBe(failure);
      await expect(second).rejects.toBe(failure);
      expect(callCount).toBe(1);
    });

    test("Thenable を非同期として扱う", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      // ダックタイピングで Thenable と判定することを検証するため、意図的に `then` を持たせています。
      // oxlint-disable
      const thenable = {
        then(resolve: (value: number) => void): void {
          resolve(42);
        },
      };
      // oxlint-enable

      // 実行
      const pending = Promise.resolve(callAsyncableFnOnce(cacheMap, "key", () => thenable));
      await expect(pending).resolves.toBe(42);
      const cached = callAsyncableFnOnce(cacheMap, "key", () => {
        throw new Error("再実行された");
      });

      // 検証
      expect(cached).toBe(42);
    });

    test("解決値が undefined でも確定値をキャッシュする", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;
      const pending = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve(undefined);
        }),
      );

      // 実行
      await expect(pending).resolves.toBe(undefined);
      const cached = callAsyncableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return Promise.resolve("unexpected");
      });

      // 検証
      expect(cached).toBe(undefined);
      expect(callCount).toBe(1);
    });

    test("キーごとに独立してキャッシュする", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();

      // 実行
      const first = Promise.resolve(callAsyncableFnOnce(cacheMap, "a", () => Promise.resolve("A")));
      const second = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "b", () => Promise.resolve("B")),
      );

      // 検証
      await expect(first).resolves.toBe("A");
      await expect(second).resolves.toBe("B");
    });
  });

  describe("オプション形式", () => {
    test("オプション形式で同期値をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;

      // 実行
      const first = callAsyncableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          callCount += 1;

          return "first";
        },
      });
      const second = callAsyncableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          callCount += 1;

          return "second";
        },
      });

      // 検証
      expect(first).toBe("first");
      expect(second).toBe("first");
      expect(callCount).toBe(1);
    });

    test("オプション形式で非同期値をキャッシュする", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      let callCount = 0;
      const pending = Promise.resolve(
        callAsyncableFnOnce({
          cacheMap,
          key: "key",
          fn: () => {
            callCount += 1;

            return Promise.resolve("ok");
          },
        }),
      );

      // 実行
      await expect(pending).resolves.toBe("ok");
      const cached = callAsyncableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          callCount += 1;

          return Promise.resolve("unexpected");
        },
      });

      // 検証
      expect(cached).toBe("ok");
      expect(callCount).toBe(1);
    });
  });

  test("返り値の型が入力に応じて決まる", () => {
    // 準備
    const cacheMap: callAsyncableFnOnce.CacheMap = new Map();

    // 実行と検証
    expectTypeOf(callAsyncableFnOnce(cacheMap, "key", () => 1)).toEqualTypeOf<number>();
    expectTypeOf(callAsyncableFnOnce(cacheMap, "key", () => Promise.resolve(1))).toEqualTypeOf<
      number | Promise<number>
    >();
    expectTypeOf(
      callAsyncableFnOnce({ cacheMap, key: "key", fn: () => Promise.resolve(1) }),
    ).toEqualTypeOf<number | Promise<number>>();
  });
});
