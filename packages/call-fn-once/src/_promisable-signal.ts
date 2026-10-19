import { NotPromisableSignalError } from "./errors.js";

type AbortListener = (this: AbortSignal, ev: Event) => void;

/**
 * シグナルごとに `toAbortPromise` が追加した中断リスナーを保持します。
 */
const listenersBySignal = /*#__PURE__*/ new WeakMap<AbortSignal, Set<AbortListener>>();

/**
 * 指定されたシグナルが `toAbortPromise` で Promise に変換可能かを確認します。
 *
 * 変換できないときは `NotPromisableSignalError` を投げます。
 */
export function assertPromisableSignal(signal: AbortSignal): void {
  if (!listenersBySignal.has(signal)) {
    throw new NotPromisableSignalError();
  }
}

/**
 * 指定されたシグナルを `toAbortPromise` で Promise に変換可能なシグナルとして登録します。
 *
 * すでに登録済みのときは何もしません。
 */
export function registerPromisableSignal(signal: AbortSignal): void {
  if (!listenersBySignal.has(signal)) {
    listenersBySignal.set(signal, new Set());
  }
}

/**
 * 指定されたシグナルに追加された中断リスナーをすべて外し、登録を解除します。
 *
 * 登録されていないときは何もしません。そのため何度呼んでも安全です。
 */
export function unregisterPromisableSignal(signal: AbortSignal): void {
  const listeners = listenersBySignal.get(signal);
  if (!listeners) {
    return;
  }

  listenersBySignal.delete(signal);
  for (const listener of listeners) {
    signal.removeEventListener("abort", listener);
  }
}

/**
 * 指定されたシグナルに中断リスナーを追加し、登録解除時にまとめて外せるよう追跡します。
 *
 * 追加したリスナーは一度だけ発火し、発火後は自身を外します。
 */
export function subscribeAbortEvent(signal: AbortSignal, abortListener: AbortListener): void {
  assertPromisableSignal(signal);

  const listener: AbortListener = function (...args) {
    signal.removeEventListener("abort", listener);
    abortListener.call(this, ...args);
  };

  signal.addEventListener("abort", listener, { once: true });
  const listeners = listenersBySignal.get(signal)!;
  listeners.add(listener);
}
