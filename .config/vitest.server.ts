import { defineConfig } from "vitest/config";
import isDebugMode from "./_is-debug-mode";

export default defineConfig({
  oxc: {
    target: "es2020",
  },
  define: {
    __DEBUG__: `${isDebugMode}`,
  },
  test: {
    include: [
      "tests/**/*.test.ts",
    ],
    exclude: [
      "tests/**/*.client.test.ts",
    ],
  },
});
