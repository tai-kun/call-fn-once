import { describe, expectTypeOf, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";

/**
 * 手動で解決・拒否できる遅延Promiseです。
 * 実行中のキャッシュ共有や中断時の振る舞いを決定的に検証するために使用します。
 */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve = (_value: T): void => {};
  let reject = (_reason?: unknown): void => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("callAbortableFnOnce", () => {
  test("同期成功をキャッシュし内部の中断信号を渡す", ({ expect }) => {
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

  test("同期例外は状態を残さず次回再実行する", ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const failure = new Error("boom");
    let callCount = 0;

    // 実行
    let caught: unknown;
    try {
      callAbortableFnOnce(cacheMap, "key", () => {
        callCount += 1;
        throw failure;
      });
    } catch (ex) {
      caught = ex;
    }
    const retried = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "recovered";
    });

    // 検証
    expect(caught).toBe(failure);
    expect(retried).toBe("recovered");
    expect(callCount).toBe(2);
  });

  test("事前に中断済みの信号では関数を実行せず投げる", ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const reason = new Error("already-aborted");
    const controller = new AbortController();
    controller.abort(reason);
    let callCount = 0;

    // 実行
    let caught: unknown;
    try {
      callAbortableFnOnce(
        cacheMap,
        "key",
        () => {
          callCount += 1;

          return "unexpected";
        },
        controller.signal,
      );
    } catch (ex) {
      caught = ex;
    }

    // 検証
    expect(caught).toBe(reason);
    expect(callCount).toBe(0);
  });

  test("非同期成功を共有し解決後は確定値を返す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    let callCount = 0;
    const first = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return deferred.promise;
    }) as Promise<string>;
    const second = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return Promise.resolve("unexpected");
    }) as Promise<string>;
    deferred.resolve("ok");

    // 実行と検証
    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
    expect(callCount).toBe(1);

    const cached = callAbortableFnOnce(cacheMap, "key", () => "unexpected");
    expect(cached).toBe("ok");
    expect(callCount).toBe(1);
  });

  test("非同期失敗はキャッシュせず次回再実行する", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const failure = new Error("fail");
    let callCount = 0;

    // 実行
    const rejected = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return Promise.reject(failure);
    }) as Promise<string>;
    await expect(rejected).rejects.toBe(failure);
    const retried = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "recovered";
    });

    // 検証
    expect(retried).toBe("recovered");
    expect(callCount).toBe(2);
  });

  test("一部の呼び出し元の中断では内部処理を中断しない", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    const reason = new Error("abort-1");
    const firstController = new AbortController();
    const secondController = new AbortController();
    let callCount = 0;
    let innerSignal: AbortSignal | undefined;
    const first = callAbortableFnOnce(
      cacheMap,
      "key",
      (signal) => {
        callCount += 1;
        innerSignal = signal;

        return deferred.promise;
      },
      firstController.signal,
    ) as Promise<string>;
    const second = callAbortableFnOnce(
      cacheMap,
      "key",
      () => {
        callCount += 1;

        return deferred.promise;
      },
      secondController.signal,
    ) as Promise<string>;

    // 実行
    firstController.abort(reason);
    await expect(first).rejects.toBe(reason);
    deferred.resolve("ok");

    // 検証
    await expect(second).resolves.toBe("ok");
    expect(callCount).toBe(1);
    expect(innerSignal?.aborted).toBe(false);
  });

  test("全ての呼び出し元が中断したら内部処理を中断する", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    const reason = new Error("abort-all");
    const controller = new AbortController();
    let callCount = 0;
    let innerSignal: AbortSignal | undefined;
    const pending = callAbortableFnOnce(
      cacheMap,
      "key",
      (signal) => {
        callCount += 1;
        innerSignal = signal;

        return deferred.promise;
      },
      controller.signal,
    ) as Promise<string>;

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

  test("待機中の呼び出し元が全て中断するまで内部処理を中断しない", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    const firstReason = new Error("abort-1");
    const secondReason = new Error("abort-2");
    const firstController = new AbortController();
    const secondController = new AbortController();
    let innerSignal: AbortSignal | undefined;
    const first = callAbortableFnOnce(
      cacheMap,
      "key",
      (signal) => {
        innerSignal = signal;

        return deferred.promise;
      },
      firstController.signal,
    ) as Promise<string>;
    const second = callAbortableFnOnce(
      cacheMap,
      "key",
      () => deferred.promise,
      secondController.signal,
    ) as Promise<string>;

    // 実行
    firstController.abort(firstReason);
    await expect(first).rejects.toBe(firstReason);
    expect(innerSignal?.aborted).toBe(false);
    secondController.abort(secondReason);

    // 検証
    await expect(second).rejects.toBe(secondReason);
    expect(innerSignal?.aborted).toBe(true);
  });

  test("信号なしの呼び出しがある限り内部処理を中断しない", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    const reason = new Error("abort-with-dummy");
    const controller = new AbortController();
    let callCount = 0;
    let innerSignal: AbortSignal | undefined;
    const withoutSignal = callAbortableFnOnce(cacheMap, "key", (signal) => {
      callCount += 1;
      innerSignal = signal;

      return deferred.promise;
    }) as Promise<string>;
    const withSignal = callAbortableFnOnce(
      cacheMap,
      "key",
      () => {
        callCount += 1;

        return deferred.promise;
      },
      controller.signal,
    ) as Promise<string>;

    // 実行
    controller.abort(reason);
    await expect(withSignal).rejects.toBe(reason);
    deferred.resolve("ok");

    // 検証
    await expect(withoutSignal).resolves.toBe("ok");
    expect(callCount).toBe(1);
    expect(innerSignal?.aborted).toBe(false);
  });

  test("完了後のキャッシュは関数を実行せず値を返す", ({ expect, signal }) => {
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

  test("完了済みでも中断済み信号では投げる", ({ expect }) => {
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
    let caught: unknown;
    try {
      callAbortableFnOnce(
        cacheMap,
        "key",
        () => {
          callCount += 1;

          return "unexpected";
        },
        controller.signal,
      );
    } catch (ex) {
      caught = ex;
    }

    // 検証
    expect(caught).toBe(reason);
    expect(callCount).toBe(1);
  });

  test("キーごとに独立してキャッシュする", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();

    // 実行
    const first = callAbortableFnOnce(cacheMap, "a", () => Promise.resolve("A")) as Promise<string>;
    const second = callAbortableFnOnce(cacheMap, "b", () =>
      Promise.resolve("B"),
    ) as Promise<string>;

    // 検証
    await expect(first).resolves.toBe("A");
    await expect(second).resolves.toBe("B");
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
