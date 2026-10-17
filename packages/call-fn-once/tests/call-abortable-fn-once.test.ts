import { describe, expectTypeOf, test } from "vitest";

import callAbortableFnOnce from "../src/call-abortable-fn-once.js";
import { InconsistentCacheError, ReentrantCallError } from "../src/errors.js";
import { captureThrow, createCounter, createDeferred, delay, getBusyPromise } from "./_helpers.js";

describe("callAbortableFnOnce", () => {
  describe("同期実行", () => {
    test("同期成功をキャッシュし、内部の中断シグナルを渡す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      let innerSignal: AbortSignal | undefined;
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        counter.increment();
        innerSignal = signal;

        return "first";
      });

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "second";
      });

      // 検証
      expect(result).toBe("first");
      expect(counter.getCount()).toBe(1);
      expect(innerSignal).toBeInstanceOf(AbortSignal);
      expect(innerSignal?.aborted).toBe(false);
    });

    test("同期例外は状態を残さず、次回再実行する", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const failure = new Error("boom");
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", (): unknown => {
          counter.increment();
          throw failure;
        });
      });
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });

      // 検証
      expect(caught).toBe(failure);
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("事前に中断済みのシグナルでは、関数を実行せず投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const reason = new Error("already-aborted");
      const controller = new AbortController();
      controller.abort(reason);
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

            return "unexpected";
          },
          controller.signal,
        );
      });

      // 検証
      expect(caught).toBe(reason);
      expect(counter.getCount()).toBe(0);
    });

    test("signal に null を渡しても TypeError にならず同期成功する", ({ expect }) => {
      // 準備: 型には含めないが、JS 相互運用で null が渡ったときは未指定と同様に扱います。
      // 型外入力の防御を確認するため、型を無視して null を渡します。
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const counter = createCounter();

      // 実行
      const result = callAbortableFnOnce(
        cacheMap,
        "key",
        () => {
          counter.increment();

          return "ok";
        },
        null as unknown as AbortSignal | undefined,
      );

      // 検証
      expect(result).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });
  });

  describe("非同期実行", () => {
    test("非同期成功を共有し、解決後は確定値を返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const counter = createCounter();
      const first = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return deferred.promise;
        }),
      );
      const second = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("unexpected");
        }),
      );
      deferred.resolve("ok");

      // 実行と検証
      await expect(first).resolves.toBe("ok");
      await expect(second).resolves.toBe("ok");
      expect(counter.getCount()).toBe(1);

      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });

    test("非同期失敗はキャッシュせず、次回再実行する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const failure = new Error("fail");
      const counter = createCounter();

      // 実行
      const rejected = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.reject(failure);
        }),
      );
      await expect(rejected).rejects.toBe(failure);
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });

      // 検証
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
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
      const counter = createCounter();
      let innerSignal: AbortSignal | undefined;
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            counter.increment();
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
            counter.increment();

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
      expect(counter.getCount()).toBe(1);
      expect(innerSignal?.aborted).toBe(false);
    });

    test("すべての呼び出し元が中断した場合は内部処理を中断する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const reason = new Error("abort-all");
      const controller = new AbortController();
      const counter = createCounter();
      let innerSignal: AbortSignal | undefined;
      const pending = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            counter.increment();
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
        counter.increment();

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
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
      const counter = createCounter();
      let innerSignal: AbortSignal | undefined;
      const withoutSignal = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", (signal) => {
          counter.increment();
          innerSignal = signal;

          return deferred.promise;
        }),
      );
      const withSignal = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

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
      expect(counter.getCount()).toBe(1);
      expect(innerSignal?.aborted).toBe(false);
    });

    test("実行関数内での同期中断は内部処理を中断して登録を削除する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      const reason = new Error("sync-abort");
      let innerSignal: AbortSignal | undefined;
      const pending = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          (signal) => {
            innerSignal = signal;
            controller.abort(reason);

            return new Promise<string>(() => {});
          },
          controller.signal,
        ),
      );

      // 実行
      await expect(pending).rejects.toBe(reason);

      // 検証
      expect(innerSignal?.aborted).toBe(true);
      expect(cacheMap.has("key")).toBe(false);
    });

    test("同期中断した実行の遅延解決値はキャッシュしない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      const reason = new Error("sync-abort-resolved");
      const counter = createCounter();
      const pending = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();
            controller.abort(reason);

            return Promise.resolve("stale");
          },
          controller.signal,
        ),
      );

      // 実行
      await expect(pending).rejects.toBe(reason);
      await delay();
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "fresh";
      });

      // 検証
      expect(retried).toBe("fresh");
      expect(counter.getCount()).toBe(2);
    });

    test("実行関数内での同期中断は同期結果を確定しない", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      const reason = new Error("sync-abort-sync");
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();
            controller.abort(reason);

            return "stale";
          },
          controller.signal,
        );
      });
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "fresh";
      });

      // 検証
      expect(caught).toBe(reason);
      expect(retried).toBe("fresh");
      expect(counter.getCount()).toBe(2);
    });
  });

  describe("確定後のキャッシュ", () => {
    test("完了後のキャッシュは関数を実行せず、値を返す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const counter = createCounter();
      callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "cached";
      });

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "unexpected";
      });

      // 検証
      expect(result).toBe("cached");
      expect(counter.getCount()).toBe(1);
    });

    test("確定済みキャッシュでも中断済みシグナルでは投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const reason = new Error("aborted-after-done");
      const controller = new AbortController();
      const counter = createCounter();
      callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "cached";
      });
      controller.abort(reason);

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

            return "unexpected";
          },
          controller.signal,
        );
      });

      // 検証
      expect(caught).toBe(reason);
      expect(counter.getCount()).toBe(1);
    });

    test("確定直後の遅延中断で確定キャッシュを維持する", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      const counter = createCounter();
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

            return Promise.resolve("ok");
          },
          controller.signal,
        ),
      );
      const inner = getBusyPromise(cacheMap, "key");
      // 確定処理と中断の監視より後に登録されるため、監視解除より先に割り込んで発火します。
      void inner.then(
        () => {
          controller.abort(new Error("late"));
        },
        () => {},
      );

      // 実行
      await expect(first).resolves.toBe("ok");
      await delay();
      const cached = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "unexpected";
      });

      // 検証
      expect(cached).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });
  });

  describe("オプション形式", () => {
    test("オプション形式で同期成功をキャッシュする", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const counter = createCounter();

      // 実行
      const first = callAbortableFnOnce({
        cacheMap,
        key: "key",
        fn: () => {
          counter.increment();

          return "first";
        },
      });
      const second = callAbortableFnOnce({
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
      const counter = createCounter();
      const first = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

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
            counter.increment();

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
      expect(counter.getCount()).toBe(1);
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("ok");
      expect(counter.getCount()).toBe(1);
    });

    test("全員中断後の遅延解決で新世代を上書きしない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const oldDeferred = createDeferred<string>();
      const newDeferred = createDeferred<string>();
      const reason = new Error("abort-old");
      const controller = new AbortController();
      const counter = createCounter();
      const oldWrapped = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

            return oldDeferred.promise;
          },
          controller.signal,
        ),
      );
      const oldInner = getBusyPromise(cacheMap, "key");
      void oldInner.then(
        () => {},
        () => {},
      );

      // 実行
      controller.abort(reason);
      await expect(oldWrapped).rejects.toBe(reason);
      const newWrapped = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return newDeferred.promise;
        }),
      );
      oldDeferred.resolve("stale");
      await expect(oldInner).resolves.toBe("stale");
      newDeferred.resolve("fresh");

      // 検証
      await expect(newWrapped).resolves.toBe("fresh");
      expect(counter.getCount()).toBe(2);
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("fresh");
      expect(counter.getCount()).toBe(2);
    });

    test("全員中断後の遅延拒否で新世代に影響しない", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const oldDeferred = createDeferred<string>();
      const newDeferred = createDeferred<string>();
      const abortReason = new Error("abort-old");
      const oldFailure = new Error("old-failure");
      const controller = new AbortController();
      const counter = createCounter();
      const oldWrapped = Promise.resolve(
        callAbortableFnOnce(
          cacheMap,
          "key",
          () => {
            counter.increment();

            return oldDeferred.promise;
          },
          controller.signal,
        ),
      );
      const oldInner = getBusyPromise(cacheMap, "key");
      void oldInner.then(
        () => {},
        () => {},
      );

      // 実行
      controller.abort(abortReason);
      await expect(oldWrapped).rejects.toBe(abortReason);
      const newWrapped = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return newDeferred.promise;
        }),
      );
      oldDeferred.reject(oldFailure);
      await expect(oldInner).rejects.toBe(oldFailure);
      newDeferred.resolve("fresh");

      // 検証
      await expect(newWrapped).resolves.toBe("fresh");
      expect(counter.getCount()).toBe(2);
      const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
      expect(cached).toBe("fresh");
      expect(counter.getCount()).toBe(2);
    });

    test("確定済みキャッシュの読み取りは残った状態を削除して値を返す", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const counter = createCounter();
      const pending = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return deferred.promise;
        }),
      );
      cacheMap.set("key", { busy: false, value: "manual" });

      // 実行
      const first = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "unexpected";
      });
      deferred.resolve("stale");
      await expect(pending).resolves.toBe("stale");

      // 検証
      expect(first).toBe("manual");
      const second = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "unexpected";
      });
      expect(second).toBe("manual");
      expect(counter.getCount()).toBe(1);
    });
  });

  describe("不整合キャッシュ", () => {
    test("待機情報がない実行中キャッシュでは再実行せず投げる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      cacheMap.set("key", { busy: true, value: Promise.resolve("x") });
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return "unexpected";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(InconsistentCacheError);
      expect(counter.getCount()).toBe(0);
    });

    test("手動で設定した確定値はそのまま返す", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      cacheMap.set("key", { busy: false, value: "manual" });
      const counter = createCounter();

      // 実行
      const result = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "unexpected";
      });

      // 検証
      expect(result).toBe("manual");
      expect(counter.getCount()).toBe(0);
    });
  });

  describe("再入", () => {
    test("同期値の実行中に同一キーを呼ぶと投げて再実行できる", ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();
          callAbortableFnOnce(cacheMap, "key", () => "inner");

          return "outer";
        });
      });

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect(counter.getCount()).toBe(1);
      const retried = callAbortableFnOnce(cacheMap, "key", () => {
        counter.increment();

        return "recovered";
      });
      expect(retried).toBe("recovered");
      expect(counter.getCount()).toBe(2);
    });

    test("非同期値を返す前の同一キー呼び出しは投げて再実行できる", async ({ expect }) => {
      // 準備
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const deferred = createDeferred<string>();
      const counter = createCounter();

      // 実行
      const caught = captureThrow(() => {
        void callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();
          callAbortableFnOnce(cacheMap, "key", () => "inner");

          return deferred.promise;
        });
      });
      deferred.resolve("unused");

      // 検証
      expect(caught).toBeInstanceOf(ReentrantCallError);
      expect(counter.getCount()).toBe(1);
      const retried = Promise.resolve(
        callAbortableFnOnce(cacheMap, "key", () => {
          counter.increment();

          return Promise.resolve("recovered");
        }),
      );
      await expect(retried).resolves.toBe("recovered");
      expect(counter.getCount()).toBe(2);
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

  test("返り値の型はコールバックにでなくキャッシュマップから推論される", () => {
    // 準備
    const syncCacheMap: callAbortableFnOnce.CacheMap<string, string | number> = new Map();
    const asyncCacheMap: callAbortableFnOnce.CacheMap<string, Promise<string | number>> = new Map();

    // 実行と検証
    expectTypeOf(callAbortableFnOnce(syncCacheMap, "key", () => 1)).toEqualTypeOf<
      string | number
    >();
    expectTypeOf(callAbortableFnOnce(asyncCacheMap, "key", () => Promise.resolve(1))).toEqualTypeOf<
      string | number | Promise<string | number>
    >();
    expectTypeOf(
      callAbortableFnOnce({
        cacheMap: asyncCacheMap,
        key: "key",
        fn: () => Promise.resolve(1),
      }),
    ).toEqualTypeOf<string | number | Promise<string | number>>();
  });
});
