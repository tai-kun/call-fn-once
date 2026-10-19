import { getAbortReason, throwIfAborted } from "abort-signal-utils";

import { assertPromisableSignal, subscribeAbortEvent } from "./_promisable-signal.js";

/**
 * [API Reference](https://tai-kun.github.io/call-fn-once/reference/to-abort-promise#usage)
 */
export default function toAbortPromise(signal: AbortSignal): Promise<never> {
  try {
    assertPromisableSignal(signal);
    throwIfAborted(signal);
  } catch (ex) {
    return Promise.reject(ex);
  }

  return new Promise<never>((_, reject) => {
    subscribeAbortEvent(signal, function () {
      reject(getAbortReason(this));
    });
  });
}
