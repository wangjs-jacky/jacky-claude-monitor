#!/bin/bash
# hooks/tool-end.sh
# 工具调用结束时调用 (PostToolUse Hook)
# stdin 包含: {"tool": "Read", "success": true, "error": "..."}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/config.sh"

DAEMON_URL="http://localhost:17530"
SESSION_PID=$PPID
PROJECT_NAME=$(basename "$PWD")
TERMINAL="${TERM_PROGRAM:-vscode}"

# 标记文件目录
MARKER_DIR="/tmp/claude-monitor"
MARKER_FILE="$MARKER_DIR/tool_active_$SESSION_PID"

# 从 stdin 读取 JSON 数据
INPUT=$(cat)

# 提取字段
if command -v jq &> /dev/null; then
  TOOL=$(echo "$INPUT" | jq -r '.tool // empty')
  SUCCESS=$(echo "$INPUT" | jq -r '.success // true')
  ERROR=$(echo "$INPUT" | jq -r '.error // empty')
  TOOL_CALL_ID=$(echo "$INPUT" | jq -r '.toolCallId // empty')
else
  TOOL=$(echo "$INPUT" | sed 's/.*"tool"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  SUCCESS="true"
  ERROR=""
  TOOL_CALL_ID=""
fi

# 如果有 tool_call_id，更新状态
if [ -n "$TOOL_CALL_ID" ]; then
  ERROR_PART=""
  if [ -n "$ERROR" ]; then
    ESCAPED_ERROR=$(echo "$ERROR" | sed 's/\\/\\\\/g; s/"/\\"/g')
    ERROR_PART=",\"error\":\"$ESCAPED_ERROR\""
  fi

  curl -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID/tools/$TOOL_CALL_ID" \
    -H "Content-Type: application/json" \
    -d "{\"success\":$SUCCESS$ERROR_PART}" > /dev/null 2>&1
fi

# 更新状态为 done（LLM 输出完成）
curl -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"done","message":""}' > /dev/null 2>&1

# 删除工具调用标记
rm -f "$MARKER_FILE" 2>/dev/null

# 显示完成弹窗（延迟 1 秒，检测是否有新的工具调用）
if is_scenario_enabled "sessionEnd"; then
  DURATION=$(get_scenario_duration "sessionEnd" 3)
  (
    sleep 1
    # 检查是否有新的工具调用开始（标记文件是否重新创建）
    if [ ! -f "$MARKER_FILE" ]; then
      ~/.claude-monitor/claude-float-window done "$PROJECT_NAME" "任务完成" "$TERMINAL" "$DURATION"
    fi
  ) &
  disown 2>/dev/null || true
fi

exit 0
