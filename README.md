# call-fn-once

[English](./README.en.md)

関数の実行結果をキャッシュし、2 回目以降の呼び出しで同じ結果を返すためのユーティリティライブラリです。同期処理、非同期処理、および中断可能な非同期処理の 3 つのレベルを提供します。

## 特徴

* **型安全**: TypeScript で書かれており、高度な型推論をサポート
* **軽量**: 依存関係を最小限に抑えた設計
* **効率的**: 非同期処理の競合（Race Condition）を防ぎ、リソースを最適化
* **中断可能**: `AbortSignal` を利用した高度な実行制御

## インストール

```bash
npm install call-fn-once
```

## 各関数の比較

| 関数名 | 同期 | 非同期 | 中断可能 | 主な用途 |
| :--- | :---: | :---: | :---: | :--- |
| `callFnOnce` | ✅ | ❌ | ❌ | 同期的な重い計算のキャッシュ |
| `callAsyncableFnOnce` | ✅ | ✅ | ❌ | API レスポンスやファイルの読み込み |
| `callAbortableFnOnce` | ✅ | ✅ | ✅ | ユーザーの中断操作が伴う通信処理 |

## 使い方

### 1. callFnOnce

最もシンプルな同期キャッシュです。

```typescript
import { callFnOnce } from "call-fn-once";

const cache = new Map();

function getResult() {
  return callFnOnce(cache, "my-key", () => {
    console.log("計算中...");
    return 42;
  });
}

getResult(); // "計算中..." と出力され 42 を返す
getResult(); // キャッシュから 42 を返す
```

### 2. callAsyncableFnOnce

非同期処理に対応します。Promise が解決されるまでは Promise を返し、解決後は生の結果を返します。

```typescript
import { callAsyncableFnOnce } from "call-fn-once";

const cache = new Map();

async function fetchData() {
  return await callAsyncableFnOnce(cache, "api-data", async () => {
    const res = await fetch("https://api.example.com/data");
    return await res.json();
  });
}
```

### 3. callAbortableFnOnce

最も高度な関数です。複数の呼び出し元が同じキーで実行した場合、**「全ての呼び出し元が処理を中断した時だけ」** 実際の処理をキャンセルします。

```typescript
import { callAbortableFnOnce } from "call-fn-once";

const cache = new Map();

async function startTask(userSignal: AbortSignal) {
  try {
    const data = await callAbortableFnOnce(
      cache,
      "abortable-key",
      async signal => {
        // この signal は内部で管理されており、全ての呼び出し元の signal が abort されたら発火します。
        const res = await fetch("https://api.example.com/heavy-task", { signal });
        return await res.json();
      },
      userSignal, // 呼び出し元の中断シグナル
    );

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("タスクが中断されました");
    }
  }
}
```

## 高度な設計の仕組み

### 参照カウントによる中断制御

`callAbortableFnOnce` は、内部で待機中の `AbortSignal` を追跡しています。

1. **ユーザーA** が実行（Signal Aを渡す） → 処理開始
2. **ユーザーB** が同じキーで実行（Signal Bを渡す） → 処理を共有
3. **ユーザーA** が中断 → 処理は**続行**（ユーザーBが待っているため）
4. **ユーザーB** が中断 → 待機者がゼロになったため、**内部の処理も中断**

### メモリ管理

内部状態の管理には `WeakMap` を使用しているため、引数に渡した `cacheMap` がガベージコレクションされる際に、関連する内部状態も自動的にクリーンアップされます。

## ライセンス

MIT
