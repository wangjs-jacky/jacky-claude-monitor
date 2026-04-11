#!/bin/bash
# hooks/subagent-stop.sh
# 子代理停止时触发 (SubagentStop Hook)
# stdin 包含: {"success": true, "error": "..."}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/config.sh"

SOCKET_PATH="$HOME/.claude-monitor/monitor.sock"
SESSION_PID=$PPID
PROJECT_NAME=$(basename "$PWD")
TERMINAL="${TERM_PROGRAM:-vscode}"

# 从 stdin 读取 JSON 数据
INPUT=$(cat)

# 提取字段
if command -v jq &> /dev/null; then
  SUCCESS=$(echo "$INPUT" | jq -r '.success // true')
  ERROR=$(echo "$INPUT" | jq -r '.error // empty')
  SUBAGENT_ID=$(echo "$INPUT" | jq -r '.subagentId // empty')
else
  SUCCESS="true"
  ERROR=""
  SUBAGENT_ID=""
fi

# 如果有 subagentId，更新状态
if [ -n "$SUBAGENT_ID" ]; then
  ERROR_PART=""
  if [ -n "$ERROR" ]; then
    ESCAPED_ERROR=$(echo "$ERROR" | sed 's/\\/\\\\/g; s/"/\\"/g')
    ERROR_PART=",\"error\":\"$ESCAPED_ERROR\""
  fi

  curl -s --unix-socket "$SOCKET_PATH" -X PATCH "http://localhost/api/sessions/$SESSION_PID/subagents/$SUBAGENT_ID" \
    -H "Content-Type: application/json" \
    -d "{\"success\":$SUCCESS$ERROR_PART}" > /dev/null 2>&1
fi

# 显示子代理完成提示
if is_scenario_enabled "executing"; then
  DURATION=1
  if [ "$SUCCESS" = "true" ]; then
    ~/.claude-monitor/claude-float-window tool_done "$PROJECT_NAME" "子代理完成" "$TERMINAL" "$DURATION" &
  else
    ~/.claude-monitor/claude-float-window error "$PROJECT_NAME" "子代理失败" "$TERMINAL" 2 &
  fi
fi

exit 0
