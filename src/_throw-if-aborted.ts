/**
 * 指定された AbortSignal がすでに中止されている場合、対応するエラーを投げます。
 *
 * @param signal 監視対象の AbortSignal オブジェクトです。
 * @throws {unknown} シグナルが中止されており、かつ中止理由 (reason) が設定されている場合にその理由を投げます。
 * @throws {DOMException} シグナルが中止されており、かつ中止理由 (reason) が設定されていない場合に AbortError を投げます。
 */
let throwIfAborted: (signal: AbortSignal | undefined) => void;

if (
  "throwIfAborted" in AbortSignal.prototype &&
  typeof AbortSignal.prototype.throwIfAborted === "function"
) {
  throwIfAborted = function throwIfAborted(signal) {
    if (signal instanceof AbortSignal) {
      signal.throwIfAborted();
    }
  };
} else {
  throwIfAborted = function throwIfAborted(signal) {
    if (signal instanceof AbortSignal && signal.aborted) {
      if (signal.reason !== undefined) {
        throw signal.reason;
      } else {
        throw new DOMException("Aborted", "AbortError");
      }
    }
  };
}

export default throwIfAborted;
