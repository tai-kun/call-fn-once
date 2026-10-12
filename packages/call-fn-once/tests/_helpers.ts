/**
 * 手動で解決または拒否できる遅延 Promise です。
 *
 * 解決前の並行呼び出しの共有や中断時の振る舞いを確実に検証するために使います。
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve = (_value: T): void => {};
  let reject = (_reason?: unknown): void => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * 同期関数の例外を捕捉して返します。
 *
 * 例外がそのまま伝わるかを検証するために使います。
 */
export function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (ex) {
    return ex;
  }

  return undefined;
}

/**
 * 呼び出し回数を数えるカウンターです。
 *
 * 各テストで `let` を使った計数を書かずに済ませるために使います。
 */
export type Counter = {
  getCount: () => number;
  increment: () => void;
};

/**
 * 呼び出し回数を数えるカウンターを作成します。
 */
export function createCounter(): Counter {
  let count = 0;

  return {
    getCount: () => count,
    increment: () => {
      count += 1;
    },
  };
}

/**
 * 指定されたミリ秒だけ待機します。
 *
 * 遅れて確定する処理の完了を待つために使います。
 */
export function delay(ms = 20): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 実行中の共有 Promise を取り出します。
 *
 * 世代の検証で古い世代の確定を待つために使います。
 * 実行中でないキーに使うとエラーを投げます。
 */
export function getBusyPromise(cacheMap: Map<unknown, any>, key: unknown): Promise<any> {
  const cache: { busy: boolean; value: Promise<any> } | undefined = cacheMap.get(key);

  if (cache === undefined || cache.busy !== true) {
    throw new Error("Expected a busy cache for the given key.");
  }

  return cache.value;
}
