import { describe, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";
import { delay } from "./_helpers.js";

// `process.on("unhandledRejection")` を使うため、ブラウザーでは実行できません。
// サーバー側でのみ実行します。
describe("callAbortableFnOnce (server)", () => {
  describe("中断", () => {
    test("同期中断と非同期拒否が重なっても共有から外れた Promise を `unhandledRejection` にしない", async ({
      expect,
    }) => {
      // 準備: 唯一の待機者が fn の実行中に自ら中断し、fn は拒否済みの非同期を返します。
      // 待機者のラッパーは中断理由で拒否されるため、呼び出し元は正しく処理できます。
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

        // 実行: 待機者は中断理由で拒否されます。
        await expect(pending).rejects.toBe(abortReason);
        // 共有から外れた内部 Promise の拒否が報告される猶予を与えてから検証します。
        await delay(50);

        // 検証: 切り離した内部 Promise の拒否はダミーの拒否ハンドラーで処理され、`unhandledRejection` として報告されません。
        expect(unhandled).toBe(undefined);
        expect(cacheMap.has("key")).toBe(false);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });
});
