#!/bin/bash
# hooks/tool-end.sh
# 工具调用结束时调用 (PostToolUse Hook)
# stdin 包含: {"tool": "Read", "success": true, "error": "..."}

DAEMON_URL="http://localhost:17530"
SESSION_PID=$PPID

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

# 更新状态为 thinking（继续处理）
curl -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"thinking","message":""}' > /dev/null 2>&1

exit 0
