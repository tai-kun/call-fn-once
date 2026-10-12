import { describe, expectTypeOf, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";
import { InconsistentCacheError, ReentrantCallError } from "../src/errors.js";
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
    test("一部の呼び出し元の中断では内部処理を継続する", async ({ expect }) => {
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

    test("すべての呼び出し元が中断した場合は内部処理を中断する", async ({ expect }) => {
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

    test("すべての待機者が中断するまで内部処理を継続する", async ({ expect }) => {
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

    test("シグナルなしの呼び出しがある限り内部処理を継続する", async ({ expect }) => {
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
    test("完了後のキャッシュは関数を実行せず、値を返す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      let callCount = 0;
      callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "cached";
      });

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "unexpected";
      });

      // 検証
      expect(result).toBe("cached");
      expect(callCount).toBe(1);
    });

    test("確定済みキャッシュでも中断済みシグナルでは投げる", ({ expect }) => {
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

    test("確定直後の遅延中断で確定キャッシュを維持する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      let callCount = 0;
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return Promise.resolve("ok");
          },
          controller.signal,
        ),
      );
      const inner = (cacheMap.get("key") as { busy: true; value: Promise<string> }).value;
      // 確定処理と中断監視より後に登録されるため、監視解除より先に割り込んで発火する。
      void inner.then(
        () => {
          controller.abort(new Error("late"));
        },
        () => {},
      );

      // 実行
      await expect(first).resolves.toBe("ok");
      await new Promise((resolve) => setTimeout(resolve, 20));
      const cached = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "unexpected";
      });

      // 検証
      expect(cached).toBe("ok");
      expect(callCount).toBe(1);
    });
  });

  describe("オプション形式", () => {
    test("オプション形式で同期成功をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      let callCount = 0;

      // 実行
      const first = callAbortableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          callCount += 1;

          return "first";
        },
      });
      const second = callAbortableFnOnce({
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

    test("オプション形式のシグナルで中断できる", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-via-options");
      const controller = new AbortController();
      let innerSignal: AbortSignal | undefined;
      const pending = Promise.resolve(
        callAbortableFnOnce({
          cacheMap,
          key: "key",
          fn: (signal) => {
            innerSignal = signal;

            return deferred.promise;
          },
          signal: controller.signal,
        }),
      );

      // 実行
      controller.abort(reason);

      // 検証
      await expect(pending).rejects.toBe(reason);
      expect(innerSignal?.aborted).toBe(true);
    });
  });

  describe("世代管理", () => {
    test("一部の待機者が中断しても残りの待機者と確定値を保つ", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-partial");
      const firstController = new AbortController();
      const secondController = new AbortController();
      let callCount = 0;
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

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
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("ok");
      expect(callCount).toBe(1);
    });

    test("全員中断後の遅延解決で新世代を上書きしない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const oldDeferred = createDeferred<string>();
      const newDeferred = createDeferred<string>();
      const reason = new Error("abort-old");
      const controller = new AbortController();
      let callCount = 0;
      const oldWrapped = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return oldDeferred.promise;
          },
          controller.signal,
        ),
      );
      const oldInner = (cacheMap.get("key") as { busy: true; value: Promise<string> }).value;
      void oldInner.then(
        () => {},
        () => {},
      );

      // 実行
      controller.abort(reason);
      await expect(oldWrapped).rejects.toBe(reason);
      const newWrapped = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return newDeferred.promise;
        }),
      );
      oldDeferred.resolve("stale");
      await expect(oldInner).resolves.toBe("stale");
      newDeferred.resolve("fresh");

      // 検証
      await expect(newWrapped).resolves.toBe("fresh");
      expect(callCount).toBe(2);
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("fresh");
      expect(callCount).toBe(2);
    });

    test("全員中断後の遅延拒否で新世代に影響しない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const oldDeferred = createDeferred<string>();
      const newDeferred = createDeferred<string>();
      const abortReason = new Error("abort-old");
      const oldFailure = new Error("old-failure");
      const controller = new AbortController();
      let callCount = 0;
      const oldWrapped = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            callCount += 1;

            return oldDeferred.promise;
          },
          controller.signal,
        ),
      );
      const oldInner = (cacheMap.get("key") as { busy: true; value: Promise<string> }).value;
      void oldInner.then(
        () => {},
        () => {},
      );

      // 実行
      controller.abort(abortReason);
      await expect(oldWrapped).rejects.toBe(abortReason);
      const newWrapped = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return newDeferred.promise;
        }),
      );
      oldDeferred.reject(oldFailure);
      await expect(oldInner).rejects.toBe(oldFailure);
      newDeferred.resolve("fresh");

      // 検証
      await expect(newWrapped).resolves.toBe("fresh");
      expect(callCount).toBe(2);
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("fresh");
      expect(callCount).toBe(2);
    });

    test("確定済みキャッシュの読み取りは残った状態を削除して値を返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      let callCount = 0;
      const pending = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return deferred.promise;
        }),
      );
      cacheMap.set("key", { busy: false, value: "manual" });

      // 実行
      const first = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "unexpected";
      });
      deferred.resolve("stale");
      await expect(pending).resolves.toBe("stale");

      // 検証
      expect(first).toBe("manual");
      const second = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "unexpected";
      });
      expect(second).toBe("manual");
      expect(callCount).toBe(1);
    });
  });

  describe("不整合キャッシュ", () => {
    test("待機情報がない実行中キャッシュでは再実行せず投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      cacheMap.set("key", { busy: true, value: Promise.resolve("x") });
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return "unexpected";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(InconsistentCacheError);
      expect((caught as InconsistentCacheError).code).toBe("ERR_CALL_FN_ONCE_INCONSISTENT_CACHE");
      expect(callCount).toBe(0);
    });

    test("手動で設定した確定値はそのまま返す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      cacheMap.set("key", { busy: false, value: "manual" });
      let callCount = 0;

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "unexpected";
      });

      // 検証
      expect(result).toBe("manual");
      expect(callCount).toBe(0);
    });
  });

  describe("再入", () => {
    test("同期値の実行中に同一キーを呼ぶと投げて再実行できる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;
          callAbortableFnOnce(cacheMap, "key", () => "inner");

          return "outer";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect((caught as ReentrantCallError).code).toBe("ERR_CALL_FN_ONCE_REENTRANT_CALL");
      expect(callCount).toBe(1);
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("非同期値を返す前の同一キー呼び出しは投げて再実行できる", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      let callCount = 0;

      // 実行
      const caught = captureThrow(() => {
        void callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;
          callAbortableFnOnce(cacheMap, "key", () => "inner");

          return deferred.promise;
        });
      });
      deferred.resolve("unused");

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect(callCount).toBe(1);
      const retried = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          callCount += 1;

          return Promise.resolve("recovered");
        }),
      );
      await expect(retried).resolves.toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("異なるキーでの再入は許可する", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();

      // 実行
      const result = callAbortableFnOnce(cacheMap, "a", () => {
        const inner = callAbortableFnOnce(cacheMap, "b", () => "B");

        return `A:${inner}`;
      });

      // 検証
      expect(result).toBe("A:B");
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
    expectTypeOf(
      callAbortableFnOnce({ cacheMap, key: "key", fn: () => Promise.resolve(1) }),
    ).toEqualTypeOf<number | Promise<number>>();
  });
});
