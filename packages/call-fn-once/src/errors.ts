import { type ErrorMeta, type ErrorOptions, I18nErrorBase, setErrorMessage } from "i18n-error-base";

export type { ErrorMeta, ErrorOptions };
export { setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
 */
export class CallFnOnceError extends I18nErrorBase<undefined> {
  static {
    this.prototype.name = "CallFnOnceError";
  }

  readonly code: "ERR_CALL_FN_ONCE_INCONSISTENT_CACHE" | "ERR_CALL_FN_ONCE_REENTRANT_CALL";

  public constructor(message: string, code: CallFnOnceError["code"], options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/call-abortable-fn-once#types)
 */
export class InconsistentCacheError extends CallFnOnceError {
  static {
    this.prototype.name = "InconsistentCacheError";
  }

  override readonly code: "ERR_CALL_FN_ONCE_INCONSISTENT_CACHE";

  public constructor(options?: ErrorOptions) {
    super(
      "Inconsistent cache state for the given key.",
      "ERR_CALL_FN_ONCE_INCONSISTENT_CACHE",
      options,
    );
    this.code = "ERR_CALL_FN_ONCE_INCONSISTENT_CACHE";
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
export class ReentrantCallError extends CallFnOnceError {
  static {
    this.prototype.name = "ReentrantCallError";
  }

  override readonly code: "ERR_CALL_FN_ONCE_REENTRANT_CALL";

  public constructor(options?: ErrorOptions) {
    super(
      "Reentrant call with the same key is not allowed.",
      "ERR_CALL_FN_ONCE_REENTRANT_CALL",
      options,
    );
    this.code = "ERR_CALL_FN_ONCE_REENTRANT_CALL";
  }
}

/*#__PURE__*/ setErrorMessage(
  ReentrantCallError,
  "同じキーによる再入呼び出しは許可されていません。",
  "ja",
);
