#!/bin/bash
# hooks/pre-compact.sh
# 上下文压缩前触发 (PreCompact Hook)
# stdin 包含: {"conversationId": "..."}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/config.sh"

SOCKET_PATH="$HOME/.claude-monitor/monitor.sock"
SESSION_PID=$PPID
PROJECT_NAME=$(basename "$PWD")

# 从 stdin 读取 JSON 数据
INPUT=$(cat)

# 提取 conversationId
if command -v jq &> /dev/null; then
  CONVERSATION_ID=$(echo "$INPUT" | jq -r '.conversationId // empty')
else
  CONVERSATION_ID=$(echo "$INPUT" | sed 's/.*"conversationId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
fi

if [ -n "$CONVERSATION_ID" ]; then
  # 发送到守护进程记录压缩事件
  curl -s --unix-socket "$SOCKET_PATH" -X POST "http://localhost/api/sessions/$SESSION_PID/compacts" \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"$CONVERSATION_ID\"}" > /dev/null 2>&1

  # 显示压缩提示弹窗
  if is_scenario_enabled "executing"; then
    TERMINAL="${TERM_PROGRAM:-vscode}"
    DURATION=$(get_scenario_duration "executing" 2)
    ~/.claude-monitor/claude-float-window executing "$PROJECT_NAME" "压缩上下文..." "$TERMINAL" "$DURATION" &
  fi
fi

exit 0
