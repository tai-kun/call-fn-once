/**
 * 手動で解決・拒否できる遅延 Promise です。
 *
 * 解決前の並行呼び出しの共有や、中断時の振る舞いを決定的に検証するために使います。
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
 * 例外がそのまま伝播するかを検証するために使います。
 */
export function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (ex) {
    return ex;
  }

  return undefined;
}
