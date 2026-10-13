import { type ErrorOptions, I18nErrorBase, setErrorMessage } from "i18n-error-base";

export type { ErrorOptions };
export { setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
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
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
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
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
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
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
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
