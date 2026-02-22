#!/bin/bash
# hooks/response-end.sh
# LLM 响应结束时调用 (Response Hook)
# stdin 包含: {"response": "AI 的回复内容..."}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/config.sh"

DAEMON_URL="http://localhost:17530"
SESSION_PID=$PPID
PROJECT_NAME=$(basename "$PWD")
TERMINAL="${TERM_PROGRAM:-vscode}"

# 更新状态为 idle（响应完成）
curl --noproxy "*" -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"idle","message":""}' > /dev/null 2>&1

# 检查是否启用悬浮窗
if is_scenario_enabled "responseEnd"; then
  DURATION=$(get_scenario_duration "responseEnd" 3)
  ~/.claude-monitor/claude-float-window done "$PROJECT_NAME" "AI 已完成" "$TERMINAL" "$DURATION" &
fi

exit 0
