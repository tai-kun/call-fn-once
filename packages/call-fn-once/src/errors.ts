import { type ErrorOptions, I18nErrorBase, setErrorMessage } from "i18n-error-base";

export type { ErrorOptions };
export { setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/errors#error-classes)
 */
export class CallFnOnceError extends I18nErrorBase<undefined> {
  static {
    this.prototype.name = "CallFnOnceError";
  }

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/errors#inconsistent-cache-error)
 */
export class InconsistentCacheError extends CallFnOnceError {
  static {
    this.prototype.name = "InconsistentCacheError";
  }

  public constructor(options?: ErrorOptions) {
    super("Inconsistent cache state for the given key.", options);
  }
}

/*#__PURE__*/ setErrorMessage(
  InconsistentCacheError,
  "指定されたキーに対応するキャッシュの状態が不整合です。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/errors#mismatched-cache-map-error)
 */
export class MismatchedCacheMapError extends CallFnOnceError {
  static {
    this.prototype.name = "MismatchedCacheMapError";
  }

  public constructor(options?: ErrorOptions) {
    super(
      "CacheMap is already used by another function. Use a separate Map for each function.",
      options,
    );
  }
}

/*#__PURE__*/ setErrorMessage(
  MismatchedCacheMapError,
  "この CacheMap は別の関数で既に使用されています。関数ごとに Map を分けてください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/errors#reentrant-call-error)
 */
export class ReentrantCallError extends CallFnOnceError {
  static {
    this.prototype.name = "ReentrantCallError";
  }

  public constructor(options?: ErrorOptions) {
    super("Reentrant call with the same key is not allowed.", options);
  }
}

/*#__PURE__*/ setErrorMessage(
  ReentrantCallError,
  "同じキーによる再入呼び出しは許可されていません。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/errors#not-promisable-signal-error)
 */
export class NotPromisableSignalError extends CallFnOnceError {
  static {
    this.prototype.name = "NotPromisableSignalError";
  }

  public constructor(options?: ErrorOptions) {
    super(
      "The given signal is not promisable. Use the signal passed to the callback of callAbortableFnOnce.",
      options,
    );
  }
}

/*#__PURE__*/ setErrorMessage(
  NotPromisableSignalError,
  "指定されたシグナルは Promise に変換できません。callAbortableFnOnce のコールバック関数に渡されるシグナルを使ってください。",
  "ja",
);
