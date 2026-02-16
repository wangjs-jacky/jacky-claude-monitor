#!/bin/bash
# hooks/waiting-input.sh
# Claude Code 等待用户输入时调用 (PreToolUse - AskUserQuestion)

DAEMON_URL="http://localhost:17530"
PID=$$
PROJECT_NAME=$(basename "$PWD")

# 更新会话状态为 waiting
curl -s -X PATCH "$DAEMON_URL/api/sessions/$PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"waiting","message":"等待用户输入"}' > /dev/null 2>&1

# 发送系统通知
osascript -e "display notification \"Claude 正在等待输入\" with title \"Claude Monitor - $PROJECT_NAME\" sound name \"Hero\"" 2>/dev/null

exit 0
