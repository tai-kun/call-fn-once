import { test, vi } from "vitest";
import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";

test("初回呼び出しのとき、コールバックを実行してその結果を返す", ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "test-key";
  const expectedValue = "success";
  const fn = () => expectedValue;

  // Act
  const result = callAbortableFnOnce(cacheMap, key, fn);

  // Assert
  expect(result).toBe(expectedValue);
});

test("一度実行された後に同じキーで呼び出したとき、キャッシュされた値を返す", ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "memo-key";
  const fn = vi.fn(() => "data");

  // Act
  callAbortableFnOnce(cacheMap, key, fn);
  const result = callAbortableFnOnce(cacheMap, key, fn);

  // Assert
  expect(result).toBe("data");
  expect(fn).toHaveBeenCalledTimes(1);
});

test("非同期処理の実行中に同じキーで複数回呼び出したとき、処理を 1 つに集約する", async ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "async-key";
  const {
    promise,
    resolve,
  } = Promise.withResolvers<void>();
  const fn = vi.fn(async () => {
    await promise;
    return "async-data";
  });

  // Act
  const promise1 = callAbortableFnOnce(cacheMap, key, fn);
  const promise2 = callAbortableFnOnce(cacheMap, key, fn);
  const promise3 = callAbortableFnOnce(cacheMap, key, fn);
  resolve();
  const [
    result1,
    result2,
    result3,
  ] = await Promise.all([
    promise1,
    promise2,
    promise3,
  ]);

  // Assert
  expect(result1).toBe("async-data");
  expect(result2).toBe("async-data");
  expect(result3).toBe("async-data");
  expect(fn).toHaveBeenCalledTimes(1);
});

test("外部シグナルが既に中断されているとき、即座に中断理由を投げる", ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "aborted-key";
  const controller = new AbortController();
  const reason = new Error("Already aborted");
  controller.abort(reason);
  const fn = vi.fn();

  // Act & Assert
  expect(() => {
    callAbortableFnOnce(cacheMap, key, fn, controller.signal);
  }).toThrow(reason);
  expect(fn).not.toHaveBeenCalled();
});

test("複数の呼び出し元のうち一部が中断しても、他の待機者がいる限り内部処理は継続する", async ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "partial-abort-key";
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const {
    promise,
    resolve,
  } = Promise.withResolvers<void>();
  const fn = async (cbSignal: AbortSignal) => {
    const {
      reject,
      promise: abortPromise,
    } = Promise.withResolvers();
    cbSignal.addEventListener("abort", reject, { once: true });
    await Promise.race([promise, abortPromise]);

    return "safe";
  };

  // Act
  const promise1 = callAbortableFnOnce(cacheMap, key, fn, controller1.signal);
  const promise2 = callAbortableFnOnce(cacheMap, key, fn, controller2.signal);

  // 一方だけ中断させる。
  controller1.abort();

  resolve();
  const results = await Promise.allSettled([promise1, promise2]);

  // Assert
  expect(results).toHaveLength(2);
  expect(results[0]!.status).toBe("rejected"); // 中断した方は拒否される。
  expect(results[1]).toStrictEqual({ status: "fulfilled", value: "safe" }); // 待機している方は完了する。
});

test("すべての呼び出し元が中断したとき、内部処理も中断される", async ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "total-abort-key";
  const controller1 = new AbortController();
  const controller2 = new AbortController();

  let cbAbortReason: unknown = null;
  const fn = async (cbSignal: AbortSignal) => {
    return new Promise((_, reject) => {
      cbSignal.addEventListener("abort", () => {
        cbAbortReason = cbSignal.reason;
        reject(cbSignal.reason);
      });
    });
  };

  // Act
  const promise1 = callAbortableFnOnce(cacheMap, key, fn, controller1.signal);
  const promise2 = callAbortableFnOnce(cacheMap, key, fn, controller2.signal);

  // 全員中断させる。
  const reason = new Error("All cancel");
  controller1.abort(reason);
  controller2.abort(reason);

  await Promise.allSettled([promise1, promise2]);

  // Assert
  expect(cbAbortReason).toBe(reason); // 内部に中断が伝播している。
  expect(cacheMap.has(key)).toBe(false); // 中断時はキャッシュが破棄される。
});

test("コールバックが例外を投げたとき、すべての待機者にエラーが伝播しキャッシュは作成されない", async ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "error-key";
  const error = new Error("API Error");
  const {
    promise,
    resolve,
  } = Promise.withResolvers<void>();
  const fn = async () => {
    await promise;
    throw error;
  };

  // Act
  const promise1 = callAbortableFnOnce(cacheMap, key, fn);
  const promise2 = callAbortableFnOnce(cacheMap, key, fn);
  resolve();
  const results = await Promise.allSettled([promise1, promise2]);

  // Assert
  expect(results).toHaveLength(2);
  expect(results[0]).toStrictEqual({
    status: "rejected",
    reason: error,
  });
  expect(results[1]).toStrictEqual({
    status: "rejected",
    reason: error,
  });
  expect(cacheMap.has(key)).toBe(false); // 失敗時はキャッシュされない。
});

test("同期的なコールバックの場合、Promise ではなく直接値を返す", ({ expect }) => {
  // Arrange
  const cacheMap = new Map();
  const key = "sync-check-key";
  const fn = () => 100;

  // Act
  const result = callAbortableFnOnce(cacheMap, key, fn);

  // Assert
  expect(result).toBe(100);
  expect(result).not.toBeInstanceOf(Promise); // 同期実行を保証する。
});
