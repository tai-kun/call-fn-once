import { tryCaptureStackTrace } from "try-capture-stack-trace";

/**
 * 指定された AbortSignal から中止の理由を取得します。
 *
 * シグナルが中止されていない場合は undefined を返し、シグナルに理由が設定されている場合はその理由を返します。理由が設定されていない場合は、代替として新規に生成した DOMException オブジェクトを返します。
 *
 * @param signal 中止の理由を取得するための AbortSignal オブジェクトです。
 * @returns 中止の理由です。シグナルがまだ中止されていない場合は undefined を返します。
 */
export default function getAbortReason(signal: AbortSignal): unknown {
  if (!signal.aborted) {
    return undefined;
  }

  if (signal.reason !== undefined) {
    return signal.reason;
  }

  const err = new DOMException("Aborted", "AbortError");
  tryCaptureStackTrace(err, getAbortReason);
  return err;
}
