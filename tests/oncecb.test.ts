import { describe, test, vi } from "vitest";
import { callFnOnce } from "../src/call-fn-once.js";

describe("キャッシュにキーが存在しない場合", () => {
  test("コールバック関数を実行し、その結果を返却する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<string, string>();
    const key = "test-key";
    const expectedValue = "computed-value";
    const fn = () => expectedValue;

    // Act
    const result = callFnOnce(cacheMap, key, fn);

    // Assert
    expect(result).toBe(expectedValue);
  });

  test("コールバック関数の実行結果をキャッシュに保存する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<string, string>();
    const key = "test-key";
    const value = "stored-value";

    // Act
    callFnOnce(cacheMap, key, () => value);

    // Assert
    expect(cacheMap.has(key)).toBe(true);
    expect(cacheMap.get(key)).toBe(value);
  });
});

describe("キャッシュに既にキーが存在する場合", () => {
  test("コールバック関数を呼び出さず、キャッシュされている値を返却する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<string, string>();
    const key = "shared-key";
    const initialValue = "initial-value";
    cacheMap.set(key, initialValue);
    const fn = vi.fn(() => "new-value");

    // Act
    const result = callFnOnce(cacheMap, key, fn);

    // Assert
    expect(result).toBe(initialValue);
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe("コールバックの結果が特殊な値の場合", () => {
  test("結果が undefined であっても、2 回目以降はキャッシュから値を返却する", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<string, undefined>();
    const key = "undefined-key";
    const fn = vi.fn(() => undefined);

    // Act
    callFnOnce(cacheMap, key, fn); // 初回実行
    const result = callFnOnce(cacheMap, key, fn); // 2 回目実行

    // Assert
    expect(result).toBe(undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("例外が発生した場合", () => {
  test("コールバックが例外を投げたとき、キャッシュは保存されず、次の呼び出しで再度実行される", ({ expect }) => {
    // Arrange
    const cacheMap = new Map<string, string>();
    const key = "error-key";
    const successValue = "success";
    let shouldThrow = true;
    const fn = vi.fn(() => {
      if (shouldThrow) {
        throw new Error("Temporary failure");
      }

      return successValue;
    });

    // Act & Assert (1 回目: 失敗)
    expect(() => callFnOnce(cacheMap, key, fn)).toThrow();
    expect(cacheMap.has(key)).toBe(false);

    // Act (2 回目: 成功)
    shouldThrow = false;
    const result = callFnOnce(cacheMap, key, fn);

    // Assert
    expect(result).toBe(successValue);
    expect(cacheMap.get(key)).toBe(successValue);
  });
});
