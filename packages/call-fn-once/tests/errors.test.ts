import { getGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test } from "vitest";

import {
  CallFnOnceError,
  InconsistentCacheError,
  MismatchedCacheMapError,
  ReentrantCallError,
} from "../src/errors.js";

describe("errors", () => {
  test("派生エラーは基底のサブタイプになる", ({ expect }) => {
    // 準備
    const inconsistent = new InconsistentCacheError();
    const mismatched = new MismatchedCacheMapError();
    const reentrant = new ReentrantCallError();

    // 実行と検証
    expect(inconsistent).toBeInstanceOf(CallFnOnceError);
    expect(inconsistent).toBeInstanceOf(Error);
    expect(mismatched).toBeInstanceOf(CallFnOnceError);
    expect(mismatched).toBeInstanceOf(Error);
    expect(reentrant).toBeInstanceOf(CallFnOnceError);
    expect(reentrant).toBeInstanceOf(Error);
    expect(inconsistent.name).toBe("InconsistentCacheError");
    expect(mismatched.name).toBe("MismatchedCacheMapError");
    expect(reentrant.name).toBe("ReentrantCallError");
  });

  test("言語切替でメッセージが変わり、元に戻る", ({ expect }) => {
    // 準備
    const previousLang = getGlobalConfig().lang;
    const inconsistent = new InconsistentCacheError();
    const mismatched = new MismatchedCacheMapError();
    const reentrant = new ReentrantCallError();

    try {
      // 実行
      setGlobalConfig({ lang: "en" });
      const enInconsistent = inconsistent.message;
      const enMismatched = mismatched.message;
      const enReentrant = reentrant.message;
      setGlobalConfig({ lang: "ja" });
      const jaInconsistent = inconsistent.message;
      const jaMismatched = mismatched.message;
      const jaReentrant = reentrant.message;

      // 検証
      expect(jaInconsistent).not.toBe(enInconsistent);
      expect(jaMismatched).not.toBe(enMismatched);
      expect(jaReentrant).not.toBe(enReentrant);

      // 実行
      setGlobalConfig({ lang: "en" });

      // 検証
      expect(inconsistent.message).toBe(enInconsistent);
      expect(mismatched.message).toBe(enMismatched);
      expect(reentrant.message).toBe(enReentrant);
    } finally {
      // 実行
      setGlobalConfig({ lang: previousLang });
    }
  });
});
