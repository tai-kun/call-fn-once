import { getGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test } from "vitest";

import {
  CallFnOnceError,
  InconsistentCacheError,
  MismatchedCacheMapError,
  NotPromisableSignalError,
  ReentrantCallError,
} from "../src/errors.js";

describe("errors", () => {
  test("派生エラーは基底のサブタイプになる", ({ expect }) => {
    // 準備
    const inconsistent = new InconsistentCacheError();
    const mismatched = new MismatchedCacheMapError();
    const reentrant = new ReentrantCallError();
    const notPromisable = new NotPromisableSignalError();

    // 実行と検証
    expect(inconsistent).toBeInstanceOf(CallFnOnceError);
    expect(inconsistent).toBeInstanceOf(Error);
    expect(mismatched).toBeInstanceOf(CallFnOnceError);
    expect(mismatched).toBeInstanceOf(Error);
    expect(reentrant).toBeInstanceOf(CallFnOnceError);
    expect(reentrant).toBeInstanceOf(Error);
    expect(notPromisable).toBeInstanceOf(CallFnOnceError);
    expect(notPromisable).toBeInstanceOf(Error);
    expect(inconsistent.name).toBe("InconsistentCacheError");
    expect(mismatched.name).toBe("MismatchedCacheMapError");
    expect(reentrant.name).toBe("ReentrantCallError");
    expect(notPromisable.name).toBe("NotPromisableSignalError");
  });

  test("言語切替でメッセージが変わり、元に戻る", ({ expect }) => {
    // 準備
    const previousLang = getGlobalConfig().lang;
    const inconsistent = new InconsistentCacheError();
    const mismatched = new MismatchedCacheMapError();
    const reentrant = new ReentrantCallError();
    const notPromisable = new NotPromisableSignalError();

    try {
      // 実行
      setGlobalConfig({ lang: "en" });
      const enInconsistent = inconsistent.message;
      const enMismatched = mismatched.message;
      const enReentrant = reentrant.message;
      const enNotPromisable = notPromisable.message;
      setGlobalConfig({ lang: "ja" });
      const jaInconsistent = inconsistent.message;
      const jaMismatched = mismatched.message;
      const jaReentrant = reentrant.message;
      const jaNotPromisable = notPromisable.message;

      // 検証
      expect(jaInconsistent).not.toBe(enInconsistent);
      expect(jaMismatched).not.toBe(enMismatched);
      expect(jaReentrant).not.toBe(enReentrant);
      expect(jaNotPromisable).not.toBe(enNotPromisable);

      // 実行
      setGlobalConfig({ lang: "en" });

      // 検証
      expect(inconsistent.message).toBe(enInconsistent);
      expect(mismatched.message).toBe(enMismatched);
      expect(reentrant.message).toBe(enReentrant);
      expect(notPromisable.message).toBe(enNotPromisable);
    } finally {
      // 実行
      setGlobalConfig({ lang: previousLang });
    }
  });
});
