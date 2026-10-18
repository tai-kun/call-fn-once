# Changelog

## call-fn-once@0.0.11

### バグ修正

- オーバーロードの順番を変えて入力補完がでるようにする ([ebc328e](https://github.com/tai-kun/call-fn-once/commit/ebc328ea421f7c3034112f1efcfec8aa0fbe88f2))

### ドキュメント

- 仕様例の console.log に出力値を記載する ([55b3ed7](https://github.com/tai-kun/call-fn-once/commit/55b3ed7954db766d9a26346489ab048441484ab5))

**Full Changelog**: https://github.com/tai-kun/call-fn-once/compare/call-fn-once@0.0.10...call-fn-once@0.0.11

## call-fn-once@0.0.10

### バグ修正

- CahceMap の get の返り値に undefined を含める ([24f7795](https://github.com/tai-kun/call-fn-once/commit/24f7795525459fed995eef9aa29f7369996be759))

**Full Changelog**: https://github.com/tai-kun/call-fn-once/compare/call-fn-once@0.0.9...call-fn-once@0.0.10

## call-fn-once@0.0.9

### バグ修正

- キーと戻り値の型を CacheMap から推論する ([3566cac](https://github.com/tai-kun/call-fn-once/commit/3566caccebeefc4bacd2cefbc42167a6026d8410))
- CacheMap インターフェースに最低限の API しか要求しないことで、CacheMap に WeakMap を使える ([346d2e2](https://github.com/tai-kun/call-fn-once/commit/346d2e2ae05ef7ab323ed7d65ea91f9af7e377b4))

### ドキュメント

- Diátaxis アプローチに基づいて刷新 ([e3973b6](https://github.com/tai-kun/call-fn-once/commit/e3973b6e88881ffc5bad459053b1e0a09a3d9ad9))
- 戻り値の型推論が CacheMap に制約されることを文書化 ([690ca67](https://github.com/tai-kun/call-fn-once/commit/690ca67209cf238b5db9a0477025e555d5db4f6d))
- CacheMap の最小インターフェース化と WeakMap の利用を文書化 ([ffa5f09](https://github.com/tai-kun/call-fn-once/commit/ffa5f099d564acd310d4104fdff6f15ee26e4634))

### その他

- パッケージを更新 ([362b319](https://github.com/tai-kun/call-fn-once/commit/362b3193eb84c5f802573e0e5534cb84d54f1077))

**Full Changelog**: https://github.com/tai-kun/call-fn-once/compare/call-fn-once@0.0.8...call-fn-once@0.0.9

## call-fn-once@0.0.8

### 新機能

- CacheMapの所有権検査を追加し.codeを廃止 ([995efe4](https://github.com/tai-kun/call-fn-once/commit/995efe4eaca65936e643f8c88f5641a8f4763def))

### リファクタリング

- 整理 ([877ddbd](https://github.com/tai-kun/call-fn-once/commit/877ddbd5e8a7e9e8a89a2f375329910a9e837e06))

**Full Changelog**: https://github.com/tai-kun/call-fn-once/compare/call-fn-once@0.0.7...call-fn-once@0.0.8

## call-fn-once@0.0.7

### 新機能

- オブジェクト形式の引数に対応 ([5884f47](https://github.com/tai-kun/call-fn-once/commit/5884f47659444b76ad991af0d2b355fded9d8b2a))
- 拡張用の型定義を追加 ([a260d20](https://github.com/tai-kun/call-fn-once/commit/a260d2058df3868dc527b853e40b0b0f2631f180))

### バグ修正

- 同期中断と非同期拒否が重なる際の孤児 Promise を処理する ([f4374ef](https://github.com/tai-kun/call-fn-once/commit/f4374efb11446c06b389800fdfa08b2166f132b8))
- 実行関数内の同期中断を正しく処理する ([9372a5d](https://github.com/tai-kun/call-fn-once/commit/9372a5deb9bb03036524ae9297b38e67ad45019c))
- 確定後の遅延中断で確定キャッシュを消さない ([4a38b63](https://github.com/tai-kun/call-fn-once/commit/4a38b6359322b5cfe7a48190882c1420d4546cd2))
- TODO の [P0] 4件に対処 ([a9a8606](https://github.com/tai-kun/call-fn-once/commit/a9a86064d58d25b9e10cbc9a753904c24c0bd72f))
- signal の操作 ([0a9ef3d](https://github.com/tai-kun/call-fn-once/commit/0a9ef3df8621b66cd0b42a8d529257a4ea6a21e6))
- 型修正 ([7fb6ed3](https://github.com/tai-kun/call-fn-once/commit/7fb6ed3def6fea53e3880911fd6f713f200da7d4))

### リファクタリング

- 内部実装を整理し日本語 JSDoc を整える ([566efa9](https://github.com/tai-kun/call-fn-once/commit/566efa98e7fedf8a5bef6f5aa8f3c17b7c9c3603))
- 実装とテスト、日本語を整える ([bb59064](https://github.com/tai-kun/call-fn-once/commit/bb59064a4c9fb819370d4e2c3be0ab39f5ec280b))

### ドキュメント

- CacheMapの関数間共有禁止を文書化 ([001cefb](https://github.com/tai-kun/call-fn-once/commit/001cefbf107ef49bd2cb9362e479e39a74b9dc47))
- 英語版を追加して公開設定 ([dbcebca](https://github.com/tai-kun/call-fn-once/commit/dbcebca4173431e78044d5fefa55f00d9ba7a088))
- JSDoc を URL と紐付ける ([9ff514b](https://github.com/tai-kun/call-fn-once/commit/9ff514b9effbb7c581fae35faec15929cff9a223))
- 日本語ドキュメントを整備 ([d2c3e10](https://github.com/tai-kun/call-fn-once/commit/d2c3e1011d7405fe112252fea5432f14802f95c8))

### ビルド・CI

- 修正 ([aceb1fe](https://github.com/tai-kun/call-fn-once/commit/aceb1fef004cfc057d70d4ef5f275d85642b108a))

### その他

- blume の生成物 ([f213022](https://github.com/tai-kun/call-fn-once/commit/f2130224c7092f2d6a65911be09c4b9b1e93a552))
- 開発環境刷新 ([a9bff48](https://github.com/tai-kun/call-fn-once/commit/a9bff48c898f75820ceab6a243e4309cba778066))
- signal 関係の関数を外部化 ([6c1407c](https://github.com/tai-kun/call-fn-once/commit/6c1407cab969c7af53f16e2ce4d025dfac249e3f))
- npm, dprint から pnpm, oxc に移行 ([3110ebf](https://github.com/tai-kun/call-fn-once/commit/3110ebf2cef99f1a720f72a393eccf0f20f40058))
- README を追加 ([ba59b1c](https://github.com/tai-kun/call-fn-once/commit/ba59b1c93bd7abb0304e5a69a27f8e39b990f5c2))
- 最初のコミット ([b2b317e](https://github.com/tai-kun/call-fn-once/commit/b2b317e474fbe43ed9fce0b8260915ee3fbc5fc5))

**Full Changelog**: https://github.com/tai-kun/call-fn-once/commits/call-fn-once@0.0.7
