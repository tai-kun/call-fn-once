import { describe, expectTypeOf, test } from "vitest";

import { callAsyncableFnOnce } from "../src/call-asyncable-fn-once.js";
import { ReentrantCallError } from "../src/errors.js";
import { captureThrow, createCounter, createDeferred } from "./_helpers.js";

describe("callAsyncableFnOnce", () => {
  describe("同期実行", () => {
    test("同期値をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "first";
      });

      // 実行
      const result = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "second";
      });

      // 検証
      expect(result).toBe("first");
      expect(counter.getCount()).toBe(1);
    });

    test("同期の undefined をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return undefined;
      });

      // 実行
      const result = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "second";
      });

      // 検証
      expect(result).toBe(undefined);
      expect(counter.getCount()).toBe(1);
    });

    test("同期例外はキャッシュせず、次回再実行する", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("boom");
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();
          throw failure;
        });
      });
      const retried = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });

      // 検証
      expect(caught).toBe(failure);
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });
  });

  describe("非同期実行", () => {
    test("非同期の解決値をキャッシュし、解決後は値を直接返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      const pending = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("ok");
        }),
      );

      // 実行
      await expect(pending).resolves.toBe("ok");
      const cached = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return Promise.resolve("unexpected");
      });

      // 検証
      expect(cached).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });

    test("解決前の並行呼び出しを単一実行にまとめる", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const counter = createCounter();

      // 実行
      const first = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return deferred.promise;
        }),
      );
      const second = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("unexpected");
        }),
      );
      deferred.resolve("ok");

      // 検証
      await expect(first).resolves.toBe("ok");
      await expect(second).resolves.toBe("ok");
      expect(counter.getCount()).toBe(1);
    });

    test("非同期の拒否はキャッシュせず、次回再実行する", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      const counter = createCounter();

      // 実行
      const rejected = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.reject(failure);
        }),
      );
      await expect(rejected).rejects.toBe(failure);
      const retried = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });

      // 検証
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("並行呼び出しの拒否は両方に伝わる", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      const counter = createCounter();

      // 実行
      const first = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.reject(failure);
        }),
      );
      const second = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("unexpected");
        }),
      );

      // 検証
      await expect(first).rejects.toBe(failure);
      await expect(second).rejects.toBe(failure);
      expect(counter.getCount()).toBe(1);
    });

    test("Thenable を非同期として扱う", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      // ダックタイピングで Thenable と判定するかを検証するため、意図的に `then` を持たせています。
      const thenable = {
        // oxlint-disable-next-line unicorn/no-thenable
        then(resolve: (value: number) => void): void {
          resolve(42);
        },
      };

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
      const counter = createCounter();
      const pending = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve(undefined);
        }),
      );

      // 実行
      await expect(pending).resolves.toBe(undefined);
      const cached = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return Promise.resolve("unexpected");
      });

      // 検証
      expect(cached).toBe(undefined);
      expect(counter.getCount()).toBe(1);
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
      const counter = createCounter();

      // 実行
      const first = callAsyncableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          counter.increment();

          return "first";
        },
      });
      const second = callAsyncableFnOnce({
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

    test("オプション形式で非同期値をキャッシュする", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      const pending = Promise.resolve(
        callAsyncableFnOnce({
          cacheMap,
          key: "key",
          fn: () => {
            counter.increment();

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
          counter.increment();

          return Promise.resolve("unexpected");
        },
      });

      // 検証
      expect(cached).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });
  });

  describe("再入", () => {
    test("同一キーでの同期的な再呼び出しは投げて再実行できる", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();
          callAsyncableFnOnce(cacheMap, "key", () => "inner");

          return "outer";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect((caught as ReentrantCallError).code).toBe("ERR_CALL_FN_ONCE_REENTRANT_CALL");
      expect(counter.getCount()).toBe(1);
      const retried = callAsyncableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("非同期値を返す前の同一キー呼び出しは投げて再実行できる", async ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        void callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();
          callAsyncableFnOnce(cacheMap, "key", () => "inner");

          return deferred.promise;
        });
      });
      deferred.resolve("unused");

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect(counter.getCount()).toBe(1);
      const retried = Promise.resolve(
        callAsyncableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("recovered");
        }),
      );
      await expect(retried).resolves.toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("異なるキーでの再入は許可する", ({ expect }) => {
      // 準備
      const cacheMap: callAsyncableFnOnce.CacheMap = new Map();

      // 実行
      const result = callAsyncableFnOnce(cacheMap, "a", () => {
        const inner = callAsyncableFnOnce(cacheMap, "b", () => "B");

        return `A:${inner}`;
      });

      // 検証
      expect(result).toBe("A:B");
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
