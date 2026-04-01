import { isPromiseLike } from "@tai-kun/is-promise-like";
import type { Promisable } from "./_types.js";

/**
 * キャッシュの状態を表す型定義です。
 *
 * 実行中（busy: true）か、完了済み（busy: false）かによって、保持する値の意味が異なります。
 */
type Cache = {
  /**
   * 現在、非同期処理が実行中であるかどうかを示すフラグです。
   */
  readonly busy: true;

  /**
   * 実行中の非同期処理を表す Promise オブジェクトです。
   */
  readonly value: Promise<any>;
} | {
  /**
   * 処理が完了し、結果が確定していることを示すフラグです。
   */
  readonly busy: false;

  /**
   * キャッシュされた実行結果の値です。
   */
  readonly value: any;
};

/**
 * 実行中の非同期処理を管理するための内部状態の型定義です。
 *
 * 複数の中断シグナル（AbortSignal）を紐付け、すべてが中断された場合に元の処理を止めるために使用します。
 */
type State = {
  /**
   * コールバック関数へ渡される、内部の非同期処理を中断するための AbortController です。
   */
  readonly ctrl: AbortController;

  /**
   * この処理の完了を待機している、すべての外部から渡された中断シグナルの集合です。
   */
  readonly sigs: Set<AbortSignal>;
};

/**
 * キャッシュ用の Map インスタンスをキーとして、そのコンテキストにおける実行状態（State）を管理する WeakMap です。
 *
 * メモリーリークを防ぐため、キャッシュ用 Map が破棄された際に自動的にクリーンアップされるようにしています。
 */
const stateMapMap = /*#__PURE__*/ new WeakMap<Map<unknown, Cache>, Map<unknown, State>>();

/**
 * 外部からの中断要求がない場合に使用する空のシグナルです。
 *
 * 内部状態の管理において、待機中のシグナルが無くなって処理が中断されるのを防ぐために使用します。
 */
const dummySignal = /*#__PURE__*/ new AbortController().signal;

/**
 * 内部用の Cache 型のエイリアスです。
 */
type _Cache = Cache;

/**
 * callAbortableFnOnce 関数に関連する型定義をまとめた名前空間です。
 */
export namespace callAbortableFnOnce {
  /**
   * キャッシュデータの型定義です。
   */
  export type Cache = _Cache;

  /**
   * キャッシュを格納する Map の型定義です。
   */
  export type CacheMap = Map<unknown, Cache>;

  /**
   * 関数の戻り値を推論するための型定義です。
   *
   * @template T 推論対象の型です。
   */
  export type Return<T> = T extends { readonly then: (...args: any) => any }
    ? Promisable<Awaited<T>>
    : T;
}

/**
 * 指定されたキーに基づき、コールバック関数を一度だけ実行して結果をキャッシュします。
 *
 * 同期および非同期の両方の戻り値に対応しており、非同期の場合は Promise オブジェクトがキャッシュされ、解決され次第、確定した値を再利用します。
 *
 * 全ての呼び出し元の中断シグナルが発火した場合に限り、実行中のコールバック関数の処理を中断します。
 *
 * @template T コールバック関数が返す値の型です。
 * @param cacheMap 実行結果をキャッシュとして保持するための Map オブジェクトです。
 * @param key キャッシュを識別するためのユニークなキーです。
 * @param fn 実行対象となるコールバック関数です。引数として内部管理用の中断シグナルを受け取ります。
 * @param signal 外部から渡される呼び出し元の中断シグナルです。省略可能です。
 * @returns キャッシュされている値、または新規に実行された関数の戻り値を返します。
 */
export function callAbortableFnOnce<T>(
  cacheMap: callAbortableFnOnce.CacheMap,
  key: unknown,
  fn: (signal: AbortSignal) => T,
  signal?: AbortSignal | undefined,
): callAbortableFnOnce.Return<T> {
  // すでにシグナルが中断されている場合は、即座にエラーを投げます。
  signal?.throwIfAborted();

  // 指定されたキャッシュ用 Map に対応する、内部状態管理用の Map を取得または作成します。
  let stateMap = stateMapMap.get(cacheMap);
  if (!stateMap) {
    stateMap = new Map();
    stateMapMap.set(cacheMap, stateMap);
  }

  /**
   * Promise に対して外部の中断シグナルを監視するロジックを付与します。
   *
   * @param promise 監視対象となる Promise オブジェクトです。
   * @param state 現在の実行状態を管理するオブジェクトです。
   * @returns シグナルの監視ロジックが組み込まれた新しい Promise オブジェクトです。
   */
  const attach = (promise: Promise<any>, state: State): Promise<any> => {
    // 外部から中断シグナルが渡されていない場合は、そのまま Promise を返します。
    if (!signal) {
      return promise;
    }

    return new Promise((resolve, reject) => {
      // 登録時点で中断されているか確認します。
      if (signal.aborted) {
        return reject(signal.reason);
      }

      /**
       * 外部シグナルが中断された際のハンドラーです。
       */
      const handleAbort = (): void => {
        // この呼び出し元を待機リストから除外します。
        state.sigs.delete(signal);

        // 待機しているシグナルが一つもなくなった場合、誰も結果を求めていないため処理を中断します。
        if (state.sigs.size === 0) {
          state.ctrl.abort(signal.reason);
          // 中断されたためキャッシュからも削除し、次回の呼び出しで再試行できるようにします。
          cacheMap.delete(key);
        }

        // この呼び出し元に対してエラーを通知します。
        reject(signal.reason);
        // 元の Promise が呼び出せないようにします。
        resolve = reject = () => {};
      };

      // シグナルの監視を開始します。
      signal.addEventListener("abort", handleAbort, { once: true });

      // 元の Promise が完了した際の処理です。
      promise
        .then(x => resolve(x))
        .catch(x => reject(x))
        .finally(() => {
          // 処理が完了（成功または失敗）した場合は、イベントリスナーを解除します。
          signal.removeEventListener("abort", handleAbort);
        });
    });
  };

  // すでにキャッシュが存在する場合の処理です。
  if (cacheMap.has(key)) {
    const cache = cacheMap.get(key)!;
    if (!cache.busy) {
      // 処理が完了済みの場合は、キャッシュされている値をそのまま返します。
      return cache.value;
    }

    // 非同期処理が実行中の場合、現在の実行状態を取得します。
    const state = stateMap.get(key);
    if (state) {
      // 現在の呼び出し元のシグナルを待機リストに追加します。
      // シグナルが未指定の場合はダミーを追加し、リストが空になるのを防ぎます。
      state.sigs.add(signal || dummySignal);

      // 中断監視ロジックを付与して返します。
      return attach(cache.value, state) as any;
    }
  }

  // 新規に実行を開始するための状態オブジェクトを作成します。
  const state: State = {
    ctrl: new AbortController(),
    sigs: new Set<AbortSignal>(),
  };
  stateMap.set(key, state);

  // 待機リストに現在のシグナルを登録します。
  state.sigs.add(signal || dummySignal);

  let ret: any;
  try {
    // コールバック関数を実行し、内部管理用の中断シグナルを渡します。
    ret = fn(state.ctrl.signal);
  } catch (e) {
    // 同期処理で例外が発生した場合は、状態を破棄してエラーを投げます。
    stateMap.delete(key);

    throw e;
  }

  if (isPromiseLike(ret)) {
    // Promise が解決または拒否された際の共通クリーンアップ処理を定義します。
    const innerPromise = Promise.resolve(ret).then(
      val => {
        // 成功時は結果をキャッシュし、実行状態をクリアします。
        cacheMap.set(key, {
          busy: false,
          value: val,
        });
        stateMap.delete(key);

        return val;
      },
      ex => {
        // 失敗時はキャッシュおよび実行状態を削除します。
        cacheMap.delete(key);
        stateMap.delete(key);

        throw ex;
      },
    );

    // 実行中フラグと共に Promise をキャッシュに登録します。
    cacheMap.set(key, {
      busy: true,
      value: innerPromise,
    });

    // 中断監視ロジックを付与して返します。
    return attach(innerPromise, state) as any;
  } else {
    // 同期処理の結果をキャッシュに登録し、実行状態をクリアします。
    cacheMap.set(key, {
      busy: false,
      value: ret,
    });
    stateMap.delete(key);

    return ret;
  }
}
