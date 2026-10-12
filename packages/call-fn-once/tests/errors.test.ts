import { getGlobalConfig, setGlobalConfig } from "valibot";
import { describe, expectTypeOf, test } from "vitest";

import { CallFnOnceError, InconsistentCacheError, ReentrantCallError } from "../src/errors.js";

describe("errors", () => {
  test("派生エラーは基底のサブタイプになる", ({ expect }) => {
    // 準備
    const inconsistent = new InconsistentCacheError();
    const reentrant = new ReentrantCallError();

    // 実行と検証
    expect(inconsistent).toBeInstanceOf(CallFnOnceError);
    expect(inconsistent).toBeInstanceOf(Error);
    expect(reentrant).toBeInstanceOf(CallFnOnceError);
    expect(reentrant).toBeInstanceOf(Error);
    expect(inconsistent.name).toBe("InconsistentCacheError");
    expect(reentrant.name).toBe("ReentrantCallError");
  });

  test("code で判定できる", ({ expect }) => {
    // 準備
    const inconsistent = new InconsistentCacheError();
    const reentrant = new ReentrantCallError();

    // 実行と検証
    expect(inconsistent.code).toBe("ERR_CALL_FN_ONCE_INCONSISTENT_CACHE");
    expect(reentrant.code).toBe("ERR_CALL_FN_ONCE_REENTRANT_CALL");
  });

  test("派生の code は単一リテラルに絞られる", () => {
    // 準備
    const inconsistent = new InconsistentCacheError();
    const reentrant = new ReentrantCallError();

    // 実行と検証
    expectTypeOf(inconsistent.code).toEqualTypeOf<"ERR_CALL_FN_ONCE_INCONSISTENT_CACHE">();
    expectTypeOf(reentrant.code).toEqualTypeOf<"ERR_CALL_FN_ONCE_REENTRANT_CALL">();
    expectTypeOf(inconsistent).toMatchTypeOf<CallFnOnceError>();
    expectTypeOf(reentrant).toMatchTypeOf<CallFnOnceError>();
  });

  test("言語切替でメッセージが変わり、元に戻る", ({ expect }) => {
    // 準備
    const previousLang = getGlobalConfig().lang;
    const inconsistent = new InconsistentCacheError();
    const reentrant = new ReentrantCallError();

    try {
      // 実行
      setGlobalConfig({ lang: "en" });
      const enInconsistent = inconsistent.message;
      const enReentrant = reentrant.message;
      setGlobalConfig({ lang: "ja" });
      const jaInconsistent = inconsistent.message;
      const jaReentrant = reentrant.message;

      // 検証
      expect(jaInconsistent).not.toBe(enInconsistent);
      expect(jaReentrant).not.toBe(enReentrant);

      // 実行
      setGlobalConfig({ lang: "en" });

      // 検証
      expect(inconsistent.message).toBe(enInconsistent);
      expect(reentrant.message).toBe(enReentrant);
    } finally {
      // 実行
      setGlobalConfig({ lang: previousLang });
    }
  });
});
