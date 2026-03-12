#!/bin/bash
# PostToolUse hook: Edit後にBiomeフォーマッターを実行する
# stdinからJSON入力を読み取り、編集されたファイルパスを取得してフォーマットする

input=$(cat /dev/stdin)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# ファイルパスが取得できない場合は何もしない
if [ -z "$file_path" ] || [ "$file_path" = "null" ]; then
  exit 0
fi

# TypeScript/JavaScript ファイルのみフォーマットする
case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.jsonc)
    npx biome check --fix --unsafe "$file_path" 2>&1
    ;;
esac

exit 0
