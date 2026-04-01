import { describe, test, vi } from "vitest";
import { callAsyncableFnOnce } from "../src/call-asyncable-fn-once.js";

describe("同期処理のキャッシュ", () => {
  test("初回呼び出し時、コールバックを実行して結果をキャッシュに保存する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "test-key";
    const fn = vi.fn(() => "value");

    // Act
    const result = callAsyncableFnOnce(cacheMap, key, fn);

    // Assert
    expect(result).toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cacheMap.get(key)).toBe("value");
  });

  test("2 回目以降の呼び出し時、コールバックを実行せずキャッシュされた値を返す", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "test-key";
    const fn = vi.fn(() => "value");

    // Act
    callAsyncableFnOnce(cacheMap, key, fn);
    const result = callAsyncableFnOnce(cacheMap, key, fn);

    // Assert
    expect(result).toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("非同期処理（Promise）のキャッシュ", () => {
  test("Promise が解決される前、同じキーでの呼び出しに対して同一の Promise インスタンスを返す", async ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "async-key";
    const {
      promise,
      resolve,
    } = Promise.withResolvers<void>();
    const fn = vi.fn(async () => {
      await promise;
      return "async-value";
    });

    // Act
    const promise1 = callAsyncableFnOnce(cacheMap, key, fn);
    const promise2 = callAsyncableFnOnce(cacheMap, key, fn);
    resolve();
    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Assert
    expect(promise1).toBe(promise2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toBe("async-value");
    expect(result2).toBe("async-value");
  });

  test("Promise が解決された後、キャッシュには Promise 自体ではなく解決された値が保存される", async ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "async-key";
    const fn = async () => "resolved-value";

    // Act
    await callAsyncableFnOnce(cacheMap, key, fn);

    // Assert
    // 解決後は Promise オブジェクトではなく、生の値が Map に入っていることを確認する
    const cachedValue = cacheMap.get(key);
    expect(cachedValue).toBe("resolved-value");
    expect(cachedValue).not.toBeInstanceOf(Promise);
  });

  test("Promise が解決された後の呼び出しでは、await なしで即座に解決された値を返す", async ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "async-key";
    const fn = async () => "resolved-value";

    // Act
    await callAsyncableFnOnce(cacheMap, key, fn);
    const result = callAsyncableFnOnce(cacheMap, key, fn);

    // Assert
    // 戻り値の型定義上は Promise になる可能性があるが、実体として解決済みであることを確認する
    expect(result).toBe("resolved-value");
  });

  test("Promise が拒否された場合、キャッシュからキーが削除され、次回の呼び出しで再試行される", async ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const key = "error-key";
    let shouldThrow = true;
    const fn = vi.fn(async () => {
      if (shouldThrow) {
        throw new Error("Temporary failure");
      }

      return "success-value";
    });

    // Act & Assert (1 回目: 失敗)
    await expect(callAsyncableFnOnce(cacheMap, key, fn)).rejects.toThrow("Temporary failure");
    expect(cacheMap.has(key)).toBe(false);

    // Act & Assert (2 回目: 再試行して成功)
    shouldThrow = false;
    const result = await callAsyncableFnOnce(cacheMap, key, fn);
    expect(result).toBe("success-value");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("エッジケースと境界条件", () => {
  test("異なるキーに対しては、それぞれ個別にキャッシュを管理する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const cb1 = () => "val1";
    const cb2 = () => "val2";

    // Act
    const result1 = callAsyncableFnOnce(cacheMap, "key1", cb1);
    const result2 = callAsyncableFnOnce(cacheMap, "key2", cb2);

    // Assert
    expect(result1).toBe("val1");
    expect(result2).toBe("val2");
    expect(cacheMap.size).toBe(2);
  });

  test("オブジェクトをキーとした場合、参照一致によってキャッシュを識別する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<unknown, any>();
    const keyObj = { id: 1 };
    const fn = () => "object-key-value";

    // Act
    callAsyncableFnOnce(cacheMap, keyObj, fn);
    const resultWithSameRef = callAsyncableFnOnce(cacheMap, keyObj, fn);
    const resultWithDiffRef = callAsyncableFnOnce(cacheMap, { id: 1 }, () => "new");

    // Assert
    expect(resultWithSameRef).toBe("object-key-value");
    expect(resultWithDiffRef).toBe("new");
  });
});
