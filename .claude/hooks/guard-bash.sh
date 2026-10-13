#!/usr/bin/env bash
# Claude Code PreToolUse guard for Bash. Exit 2 blocks the call and shows stderr to the agent.
# Each rule comes from a measured agent mistake (docs/plan/deslop/00-index.md, 2026-10-13 retro).
cmd=$(jq -r '.tool_input.command // empty')

block() {
  echo "$1" >&2
  exit 2
}

# A gate piped through tail/grep/head reports the pipe's exit code, so a failing check reads as a pass.
if [[ $cmd =~ vp[[:space:]]+(check|test|run[[:space:]]+(test|build|check)) ]] && [[ $cmd == *"|"* ]] && [[ $cmd != *pipefail* ]]; then
  block "Run the gate unpiped (vp check --quiet prints only errors), or add 'set -o pipefail' first. The exit code is the verdict."
fi

# Scripted in-place edits of source failed silently in 501 of 825 runs. Use the Edit tool or ast-grep -r.
if [[ $cmd =~ sed[[:space:]]+(-[a-zA-Z]*i|--in-place) ]]; then
  block "Don't edit files with sed -i. Use the Edit tool, or 'ast-grep run -p ... -r ...' for many sites."
fi

if [[ $cmd =~ (apps|packages|infra|e2e|bench)/[^[:space:]]+\.(ts|tsx|js|mjs|json|sql) ]] && [[ $cmd =~ (write_text|writeFileSync|open\([^\)]*[\'\"]w|[^2]\>[[:space:]]*(apps|packages|infra|e2e|bench)/) ]]; then
  block "Don't write source files from a script or shell redirect. Use the Edit or Write tool, or 'ast-grep -r' for many sites."
fi

exit 0
