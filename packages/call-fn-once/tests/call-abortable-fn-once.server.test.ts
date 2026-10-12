import { describe, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";

// `process.on("unhandledRejection")` を使うため、ブラウザーでは実行できません。
// サーバー側でのみ実行します。
describe("callAbortableFnOnce (server)", () => {
  describe("中断", () => {
    test("同期中断と非同期拒否が重なっても孤児 Promise を unhandled にしない", async ({ expect }) => {
      // 準備: 唯一の待機者が fn 実行中に自ら中断し、fn は拒否済み非同期を返す。
      // 待機者のラッパーは中断理由で拒否されるため、呼び出し元は正しく処理できる。
      const cacheMap: callAbortableFnOnce.CacheMap = new Map();
      const controller = new AbortController();
      const abortReason = new Error("sync-abort-reject");
      const innerFailure = new Error("inner-failure");
      let unhandled: unknown;
      const onUnhandled = (reason: unknown): void => {
        unhandled = reason;
      };
      process.on("unhandledRejection", onUnhandled);
      try {
        const pending = Promise.resolve(
          callAbortableFnOnce(
            cacheMap,
            "key",
            () => {
              controller.abort(abortReason);
              return Promise.reject(innerFailure);
            },
            controller.signal,
          ),
        );

        // 実行: 待機者は中断理由で拒否される。
        await expect(pending).rejects.toBe(abortReason);
        // 孤児になった内部 Promise の拒否が報告される猶予を与えてから検証する。
        await new Promise((resolve) => setTimeout(resolve, 50));

        // 検証: 破棄した内部 Promise の拒否はダミーハンドラで処理され、漏れない。
        expect(unhandled).toBe(undefined);
        expect(cacheMap.has("key")).toBe(false);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });
});
