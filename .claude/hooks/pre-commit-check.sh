#!/bin/bash
# PreToolUse hook: git commit 実行前にlintと型チェックを実行する
# stdinからJSON入力を読み取り、git commitコマンドかどうかを判定する

input=$(cat /dev/stdin)
command=$(echo "$input" | jq -r '.tool_input.command')

# git commit コマンドかどうかを判定
if echo "$command" | grep -qE '^\s*git\s+commit\b'; then
  # 型チェックとlintを実行
  errors=""

  tsc_output=$(npx tsc --noEmit 2>&1)
  if [ $? -ne 0 ]; then
    errors="TypeScript type check failed:\n$tsc_output"
  fi

  biome_output=$(npx biome check . 2>&1)
  if [ $? -ne 0 ]; then
    if [ -n "$errors" ]; then
      errors="$errors\n\n"
    fi
    errors="${errors}Biome lint check failed:\n$biome_output"
  fi

  if [ -n "$errors" ]; then
    echo -e "$errors" >&2
    exit 2
  fi
fi

exit 0
