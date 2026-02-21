#!/bin/bash
# hooks/tool-start.sh
# 工具调用开始时调用 (PreToolUse Hook)
# stdin 包含: {"tool": "Read", "input": {"file_path": "..."}}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/config.sh"

DAEMON_URL="http://localhost:17530"
SESSION_PID=$PPID
PROJECT_NAME=$(basename "$PWD")
TERMINAL="${TERM_PROGRAM:-vscode}"

# 标记文件目录
MARKER_DIR="/tmp/claude-monitor"

# 从 stdin 读取 JSON 数据
INPUT=$(cat)

# 提取 tool 和 input 字段
if command -v jq &> /dev/null; then
  TOOL=$(echo "$INPUT" | jq -r '.tool // empty')
  TOOL_INPUT=$(echo "$INPUT" | jq -c '.input // {}')
else
  # 简单提取
  TOOL=$(echo "$INPUT" | sed 's/.*"tool"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  TOOL_INPUT="{}"
fi

# 如果有 tool 名称，发送到守护进程
if [ -n "$TOOL" ]; then
  # 标记工具调用开始（用于延迟弹窗检测）
  mkdir -p "$MARKER_DIR"
  echo "$SESSION_PID" > "$MARKER_DIR/tool_active_$SESSION_PID"

  # 更新状态为 executing
  curl --noproxy "*" -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID" \
    -H "Content-Type: application/json" \
    -d '{"status":"executing"}' > /dev/null 2>&1

  # 记录工具调用
  curl --noproxy "*" -s -X POST "$DAEMON_URL/api/sessions/$SESSION_PID/tools" \
    -H "Content-Type: application/json" \
    -d "{\"tool\":\"$TOOL\",\"input\":$TOOL_INPUT}" > /dev/null 2>&1

  # 检查是否启用悬浮窗
  if is_scenario_enabled "executing"; then
    # 检查工具是否在过滤列表中
    if is_tool_in_filter "$TOOL"; then
      DURATION=$(get_scenario_duration "executing" 2)
      ~/.claude-monitor/claude-float-window executing "$PROJECT_NAME" "$TOOL" "$TERMINAL" "$DURATION" &
    fi
  fi
fi

exit 0
