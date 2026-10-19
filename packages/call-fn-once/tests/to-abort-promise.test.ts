import { describe, test, vi } from "vitest";

import { registerPromisableSignal, unregisterPromisableSignal } from "../src/_promisable-signal.js";
import callAbortableFnOnce from "../src/call-abortable-fn-once.js";
import { NotPromisableSignalError } from "../src/errors.js";
import toAbortPromise from "../src/to-abort-promise.js";
import { captureThrow, createDeferred, delay } from "./_helpers.js";

/**
 * `AbortSignal.prototype` への abort イベントの追加・削除を記録するスパイの形です。
 * 実行の完了後に内部シグナルのリスナーが外れたことの検証に使います。
 */
type AbortListenerSpy = {
  mock: {
    instances: readonly unknown[];
    calls: readonly unknown[][];
  };
};

/**
 * 指定されたシグナルに対する abort イベントの追加回数と削除回数を数えます。
 * ほかのシグナルへの操作と混ざらないよう対象のインスタンスで絞り込みます。
 */
function countAbortListeners(
  addSpy: AbortListenerSpy,
  removeSpy: AbortListenerSpy,
  target: AbortSignal,
): { added: number; removed: number } {
  const count = (spy: AbortListenerSpy): number =>
    spy.mock.instances.filter(
      (instance, index) => instance === target && spy.mock.calls[index]?.[0] === "abort",
    ).length;

  return { added: count(addSpy), removed: count(removeSpy) };
}

describe("toAbortPromise", () => {
  test("登録済みのシグナルが中断するとその理由で拒否する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("boom");
    registerPromisableSignal(controller.signal);
    const promise = toAbortPromise(controller.signal);

    // 実行
    controller.abort(reason);

    // 検証
    await expect(promise).rejects.toBe(reason);
  });

  test("登録済みのシグナルが中断済みなら即座にその理由で拒否する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("already");
    registerPromisableSignal(controller.signal);
    controller.abort(reason);

    // 実行と検証
    await expect(toAbortPromise(controller.signal)).rejects.toBe(reason);
  });

  test("登録されていないシグナルでは NotPromisableSignalError で拒否する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();

    // 実行と検証
    await expect(toAbortPromise(controller.signal)).rejects.toBeInstanceOf(
      NotPromisableSignalError,
    );
  });

  test("中断しなければ確定しない", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    registerPromisableSignal(controller.signal);
    let settled = false;
    void toAbortPromise(controller.signal).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // 実行
    await delay();

    // 検証
    expect(settled).toBe(false);
  });

  test("複数の待ち受けはすべて同じ理由で拒否する", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("multi");
    registerPromisableSignal(controller.signal);
    const first = toAbortPromise(controller.signal);
    const second = toAbortPromise(controller.signal);

    // 実行
    controller.abort(reason);

    // 検証
    await expect(first).rejects.toBe(reason);
    await expect(second).rejects.toBe(reason);
  });

  test("登録解除後は中断しても拒否しない", async ({ expect }) => {
    // 準備
    const controller = new AbortController();
    registerPromisableSignal(controller.signal);
    let rejected = false;
    void toAbortPromise(controller.signal).then(undefined, () => {
      rejected = true;
    });

    // 実行
    unregisterPromisableSignal(controller.signal);
    controller.abort(new Error("late"));
    await delay();

    // 検証
    expect(rejected).toBe(false);
  });
});

describe("callAbortableFnOnce との連携", () => {
  test("コールバックの競合で中断理由を受け取れる", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const controller = new AbortController();
    const reason = new Error("abort-race");
    const never = new Promise<string>(() => {});

    // 実行
    const pending = Promise.resolve(
      callAbortableFnOnce(
        cacheMap,
        "key",
        (signal) => Promise.race([never, toAbortPromise(signal)]),
        controller.signal,
      ),
    );
    controller.abort(reason);

    // 検証
    await expect(pending).rejects.toBe(reason);
    expect(cacheMap.has("key")).toBe(false);
  });

  test("一部の待機者の中断では内部の待ち受けを維持する", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const deferred = createDeferred<string>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstReason = new Error("first-only");
    let innerRejected = false;
    const first = Promise.resolve(
      callAbortableFnOnce(
        cacheMap,
        "key",
        (signal) => {
          void toAbortPromise(signal).then(undefined, () => {
            innerRejected = true;
          });

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
    await delay();
    deferred.resolve("ok");

    // 検証
    expect(innerRejected).toBe(false);
    await expect(second).resolves.toBe("ok");
  });

  test("非同期成功の確定後にリスナーを外す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    let innerSignal: AbortSignal | undefined;
    using addSpy = vi.spyOn(AbortSignal.prototype, "addEventListener");
    using removeSpy = vi.spyOn(AbortSignal.prototype, "removeEventListener");

    // 実行
    const result = await Promise.resolve(
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        innerSignal = signal;
        void toAbortPromise(signal).catch(() => {});

        return Promise.resolve("ok");
      }),
    );

    // 検証
    expect(result).toBe("ok");
    const { added, removed } = countAbortListeners(addSpy, removeSpy, innerSignal!);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(removed).toBeGreaterThanOrEqual(added);
  });

  test("同期成功の確定後にリスナーを外す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    let innerSignal: AbortSignal | undefined;
    using addSpy = vi.spyOn(AbortSignal.prototype, "addEventListener");
    using removeSpy = vi.spyOn(AbortSignal.prototype, "removeEventListener");

    // 実行
    const result = callAbortableFnOnce(cacheMap, "key", (signal) => {
      innerSignal = signal;
      void toAbortPromise(signal).catch(() => {});

      return "ok";
    });

    // 検証
    expect(result).toBe("ok");
    const { added, removed } = countAbortListeners(addSpy, removeSpy, innerSignal!);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(removed).toBeGreaterThanOrEqual(added);
  });

  test("同期例外の後にリスナーを外す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const failure = new Error("sync-failure");
    let innerSignal: AbortSignal | undefined;
    using addSpy = vi.spyOn(AbortSignal.prototype, "addEventListener");
    using removeSpy = vi.spyOn(AbortSignal.prototype, "removeEventListener");

    // 実行
    const caught = captureThrow(() => {
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        innerSignal = signal;
        void toAbortPromise(signal).catch(() => {});

        throw failure;
      });
    });

    // 検証
    expect(caught).toBe(failure);
    const { added, removed } = countAbortListeners(addSpy, removeSpy, innerSignal!);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(removed).toBeGreaterThanOrEqual(added);
  });

  test("非同期失敗の確定後にリスナーを外す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const failure = new Error("async-failure");
    let innerSignal: AbortSignal | undefined;
    using addSpy = vi.spyOn(AbortSignal.prototype, "addEventListener");
    using removeSpy = vi.spyOn(AbortSignal.prototype, "removeEventListener");

    // 実行
    const pending = Promise.resolve(
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        innerSignal = signal;
        void toAbortPromise(signal).catch(() => {});

        return Promise.reject(failure);
      }),
    );

    // 検証
    await expect(pending).rejects.toBe(failure);
    const { added, removed } = countAbortListeners(addSpy, removeSpy, innerSignal!);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(removed).toBeGreaterThanOrEqual(added);
  });

  test("すべての待機者が中断したときにリスナーを外す", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const controller = new AbortController();
    const reason = new Error("abort-all");
    let innerSignal: AbortSignal | undefined;
    using addSpy = vi.spyOn(AbortSignal.prototype, "addEventListener");
    using removeSpy = vi.spyOn(AbortSignal.prototype, "removeEventListener");

    // 実行
    const pending = Promise.resolve(
      callAbortableFnOnce(
        cacheMap,
        "key",
        (signal) => {
          innerSignal = signal;
          void toAbortPromise(signal).catch(() => {});

          return new Promise<string>(() => {});
        },
        controller.signal,
      ),
    );
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);

    // 検証
    const { added, removed } = countAbortListeners(addSpy, removeSpy, innerSignal!);
    expect(added).toBeGreaterThanOrEqual(1);
    expect(removed).toBeGreaterThanOrEqual(added);
  });

  test("確定後の内部シグナルは Promise に変換できない", async ({ expect }) => {
    // 準備
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    let innerSignal: AbortSignal | undefined;

    // 実行
    await Promise.resolve(
      callAbortableFnOnce(cacheMap, "key", (signal) => {
        innerSignal = signal;

        return Promise.resolve("ok");
      }),
    );

    // 検証
    await expect(toAbortPromise(innerSignal!)).rejects.toBeInstanceOf(NotPromisableSignalError);
  });
});
