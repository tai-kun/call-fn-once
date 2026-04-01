# call-fn-once

A utility library designed to cache function execution results and return the same value on subsequent calls. It provides three levels of functionality: synchronous, asynchronous, and abortable asynchronous processing.

## Features

* **Type Safe**: Written in TypeScript with support for advanced type inference.
* **Lightweight**: Designed with minimal dependencies.
* **Efficient**: Prevents race conditions in asynchronous tasks and optimizes resource usage.
* **Abortable**: Advanced execution control using `AbortSignal`.

## Installation

```bash
npm install call-fn-once
```

## Function Comparison

| Function | Sync | Async | Abortable | Primary Use Case |
| :--- | :---: | :---: | :---: | :--- |
| `callFnOnce` | ✅ | ❌ | ❌ | Caching heavy synchronous computations. |
| `callAsyncableFnOnce` | ✅ | ✅ | ❌ | API responses or file reading. |
| `callAbortableFnOnce` | ✅ | ✅ | ✅ | Network requests involving user cancellation. |

## Usage

### 1. callFnOnce

The simplest form of synchronous caching.

```typescript
import { callFnOnce } from "call-fn-once";

const cache = new Map();

function getResult() {
  return callFnOnce(cache, "my-key", () => {
    console.log("Computing...");
    return 42;
  });
}

getResult(); // Logs "Computing..." and returns 42
getResult(); // Returns 42 from cache
```

### 2. callAsyncableFnOnce

Supports asynchronous operations. It returns a `Promise` while the task is pending and the raw result once resolved.

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

The most advanced function. If multiple callers execute with the same key, the actual underlying process is canceled **"only when all callers have aborted their requests."**

```typescript
import { callAbortableFnOnce } from "call-fn-once";

const cache = new Map();

async function startTask(userSignal: AbortSignal) {
  try {
    const data = await callAbortableFnOnce(
      cache,
      "abortable-key",
      async signal => {
        // This signal is managed internally and triggers 
        // only when all callers' signals are aborted.
        const res = await fetch("https://api.example.com/heavy-task", { signal });
        return await res.json();
      },
      userSignal, // The caller's abort signal
    );

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Task was aborted");
    }
  }
}
```

## Advanced Architecture

### Abort Control via Reference Counting

`callAbortableFnOnce` internally tracks pending `AbortSignal` instances:

1. **User A** starts execution (passes Signal A) → Process begins.
2. **User B** executes with the same key (passes Signal B) → Shares the process.
3. **User A** aborts → The process **continues** (because User B is still waiting).
4. **User B** aborts → With zero waiters remaining, the **internal process is aborted**.

### Memory Management

By utilizing `WeakMap` for internal state management, related internal data is automatically cleaned up by garbage collection when the `cacheMap` passed as an argument is no longer in use.

## License

MIT
