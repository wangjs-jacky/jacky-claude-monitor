#!/bin/bash
# hooks/tool-failure.sh
# 工具执行失败时触发 (PostToolUseFailure Hook)
# stdin 包含: {"tool": "Bash", "error": "..."}

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
  TOOL=$(echo "$INPUT" | jq -r '.tool // empty')
  ERROR=$(echo "$INPUT" | jq -r '.error // empty')
else
  TOOL=$(echo "$INPUT" | sed 's/.*"tool"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  ERROR=$(echo "$INPUT" | sed 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
fi

# 清理工具活动标记
MARKER_DIR="/tmp/claude-monitor"
MARKER_FILE="$MARKER_DIR/tool_active_$SESSION_PID"
rm -f "$MARKER_FILE" 2>/dev/null

# 尝试匹配并关闭 pending tool call
if [ -n "$TOOL" ]; then
  # 查找该工具的 pending tool call ID
  TOOL_ID_FILE="$MARKER_DIR/tool_id_${SESSION_PID}_${TOOL}"
  if [ -f "$TOOL_ID_FILE" ]; then
    TOOL_CALL_ID=$(cat "$TOOL_ID_FILE")
    rm -f "$TOOL_ID_FILE" 2>/dev/null

    if [ -n "$TOOL_CALL_ID" ]; then
      ESCAPED_ERROR=$(echo "$ERROR" | sed 's/\\/\\\\/g; s/"/\\"/g')
      curl -s --unix-socket "$SOCKET_PATH" -X PATCH "http://localhost/api/sessions/$SESSION_PID/tools/$TOOL_CALL_ID" \
        -H "Content-Type: application/json" \
        -d "{\"success\":false,\"error\":\"$ESCAPED_ERROR\"}" > /dev/null 2>&1
    fi
  fi
fi

# 显示失败弹窗
if is_scenario_enabled "executing"; then
  DURATION=2
  ERROR_MSG="${TOOL:-未知工具} 失败"
  if [ -n "$ERROR" ]; then
    # 截断过长的错误信息
    ERROR_SHORT=$(echo "$ERROR" | head -c 80)
    ERROR_MSG="$ERROR_MSG: $ERROR_SHORT"
  fi
  ~/.claude-monitor/claude-float-window error "$PROJECT_NAME" "✗ $ERROR_MSG" "$TERMINAL" "$DURATION" &
fi

exit 0
