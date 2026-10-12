import { describe, expectTypeOf, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";
import { captureThrow, createDeferred } from "./_helpers.js";

describe("callAbortableFnOnce", () => {
  describe("同期実行", () => {
    test("同期成功をキャッシュし、内部の中断シグナルを渡す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      let callCount = 0;
      let innerSignal: AbortSignal | undefined;
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        callCount += 1;
        innerSignal = signal;

        return "first";
      });

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "second";
      });

      // 検証
      expect(result).toBe("first");
      expect(callCount).toBe(1);
      expect(innerSignal).toBeInstanceOf(AbortSignal);
      expect(innerSignal?.aborted).toBe(false);
    });

    test("同期例外は状態を残さず、次回再実行する", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const failure = new Error("boom");
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;
          throw failure;
        });
      });
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });

      // 検証
      expect(caught).toBe(failure);
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("事前に中断済みのシグナルでは、関数を実行せず投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const reason = new Error("already-aborted");
      const controller = new AbortController();
      controller.abort(reason);
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return "unexpected";
          },
          controller.signal,
        );
      });

      // 検証
      expect(caught).toBe(reason);
      expect(callCount).toBe(0);
    });
  });

  describe("非同期実行", () => {
    test("非同期成功を共有し、解決後は確定値を返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      let callCount = 0;
      const first = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return deferred.promise;
        }),
      );
      const second = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve("unexpected");
        }),
      );
      deferred.resolve("ok");

      // 実行と検証
      await expect(first).resolves.toBe("ok");
      await expect(second).resolves.toBe("ok");
      expect(callCount).toBe(1);

      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("ok");
      expect(callCount).toBe(1);
    });

    test("非同期失敗はキャッシュせず、次回再実行する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      let callCount = 0;

      // 実行
      const rejected = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.reject(failure);
        }),
      );
      await expect(rejected).rejects.toBe(failure);
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });

      // 検証
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("キーごとに独立してキャッシュする", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();

      // 実行
      const first = Promise.resolve(callAbortableFnOnce(cacheMap, "a", () => Promise.resolve("A")));
      const second = Promise.resolve(
        callAbortableFnOnce(cacheMap, "b", () => Promise.resolve("B")),
      );

      // 検証
      await expect(first).resolves.toBe("A");
      await expect(second).resolves.toBe("B");
    });
  });

  describe("中断", () => {
    test("一部の呼び出し元の中断では内部処理を中断しない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-1");
      const firstController = new AbortController();
      const secondController = new AbortController();
      let callCount = 0;
      let innerSignal: AbortSignal | undefined;
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            callCount += 1;
            innerSignal = signal;

            return deferred.promise;
          },
          firstController.signal,
        ),
      );
      const second = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return deferred.promise;
          },
          secondController.signal,
        ),
      );

      // 実行
      firstController.abort(reason);
      await expect(first).rejects.toBe(reason);
      deferred.resolve("ok");

      // 検証
      await expect(second).resolves.toBe("ok");
      expect(callCount).toBe(1);
      expect(innerSignal?.aborted).toBe(false);
    });

    test("すべての呼び出し元が中断したら、内部処理を中断する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-all");
      const controller = new AbortController();
      let callCount = 0;
      let innerSignal: AbortSignal | undefined;
      const pending = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            callCount += 1;
            innerSignal = signal;

            return deferred.promise;
          },
          controller.signal,
        ),
      );

      // 実行
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);

      // 検証
      expect(innerSignal?.aborted).toBe(true);
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("待機中の呼び出し元がすべて中断するまで、内部処理を中断しない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const firstReason = new Error("abort-1");
      const secondReason = new Error("abort-2");
      const firstController = new AbortController();
      const secondController = new AbortController();
      let innerSignal: AbortSignal | undefined;
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            innerSignal = signal;

            return deferred.promise;
          },
          firstController.signal,
        ),
      );
      const second = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => deferred.promise, secondController.signal),
      );

      // 実行
      firstController.abort(firstReason);
      await expect(first).rejects.toBe(firstReason);
      expect(innerSignal?.aborted).toBe(false);
      secondController.abort(secondReason);

      // 検証
      await expect(second).rejects.toBe(secondReason);
      expect(innerSignal?.aborted).toBe(true);
    });

    test("シグナルなしの呼び出しがある限り、内部処理を中断しない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-with-dummy");
      const controller = new AbortController();
      let callCount = 0;
      let innerSignal: AbortSignal | undefined;
      const withoutSignal = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", (signal) => {
          callCount += 1;
          innerSignal = signal;

          return deferred.promise;
        }),
      );
      const withSignal = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return deferred.promise;
          },
          controller.signal,
        ),
      );

      // 実行
      controller.abort(reason);
      await expect(withSignal).rejects.toBe(reason);
      deferred.resolve("ok");

      // 検証
      await expect(withoutSignal).resolves.toBe("ok");
      expect(callCount).toBe(1);
      expect(innerSignal?.aborted).toBe(false);
    });
  });

  describe("確定後のキャッシュ", () => {
    test("完了後のキャッシュは関数を実行せず、値を返す", ({ expect, signal }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      let callCount = 0;
      callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "cached";
      });

      // 実行
      const result = callAbortableFnOnce(
        cacheMap,
        "key",
        () => {
          callCount += 1;

          return "unexpected";
        },
        signal,
      );

      // 検証
      expect(result).toBe("cached");
      expect(callCount).toBe(1);
    });

    test("完了済みでも中断済みシグナルでは投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const reason = new Error("aborted-after-done");
      const controller = new AbortController();
      let callCount = 0;
      callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "cached";
      });
      controller.abort(reason);

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return "unexpected";
          },
          controller.signal,
        );
      });

      // 検証
      expect(caught).toBe(reason);
      expect(callCount).toBe(1);
    });
  });

  test("返り値の型が入力に応じて決まる", () => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();

    // 実行と検証
    expectTypeOf(callAbortableFnOnce(cacheMap, "key", () => 1)).toEqualTypeOf<number>();
    expectTypeOf(callAbortableFnOnce(cacheMap, "key", () => Promise.resolve(1))).toEqualTypeOf<
      number | Promise<number>
    >();
  });
});
