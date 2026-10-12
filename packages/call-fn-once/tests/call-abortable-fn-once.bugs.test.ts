import { describe, test } from "vitest";

import { callAbortableFnOnce } from "../src/call-abortable-fn-once.js";

describe("callAbortableFnOnce のバグ再現 (修正されるまで test.fails で残す)", () => {
  test.fails("実行関数内での同期中断が内部処理を中断しない", async ({ expect }) => {
    // 準備: 唯一の待機者が fn 実行中に自ら中断する。
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const controller = new AbortController();
    const reason = new Error("sync-abort");
    let innerSignal: AbortSignal | undefined;
    const pending = Promise.resolve(
      callAbortableFnOnce(
        cacheMap,
        "key",
        (signal) => {
          innerSignal = signal;
          controller.abort(reason);

          return new Promise<string>(() => {});
        },
        controller.signal,
      ),
    );

    // 検証: 待機者は中断理由で拒否されるが、内部も中断されるはず。
    await expect(pending).rejects.toBe(reason);
    // 実際: attachAbort の即時拒否経路が待機集合の掃除と内部中断をしないため、
    // 内部シグナルは未中断のまま実行中キャッシュが残り続ける。
    expect(innerSignal?.aborted).toBe(true);
    expect(cacheMap.has("key")).toBe(false);
  });

  test.fails("同期中断した実行の遅延解決値がキャッシュされる", async ({ expect }) => {
    // 準備: 唯一の待機者が fn 実行中に中断し、fn は解決済み非同期を返す。
    const cacheMap: callAbortableFnOnce.CacheMap = new Map();
    const controller = new AbortController();
    const reason = new Error("sync-abort-resolved");
    let callCount = 0;
    const pending = Promise.resolve(
      callAbortableFnOnce(
        cacheMap,
        "key",
        () => {
          callCount += 1;
          controller.abort(reason);

          return Promise.resolve("stale");
        },
        controller.signal,
      ),
    );

    // 実行
    await expect(pending).rejects.toBe(reason);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // 検証: 中断された世代の解決値は破棄され、次回は再実行されるはず。
    const retried = callAbortableFnOnce(cacheMap, "key", () => {
      callCount += 1;

      return "fresh";
    });
    // 実際: 古い確定が世代判定をすり抜けて stale を確定させるため、再実行されない。
    expect(retried).toBe("fresh");
    expect(callCount).toBe(2);
  });
});
