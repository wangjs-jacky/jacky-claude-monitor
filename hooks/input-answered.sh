#!/bin/bash
# hooks/input-answered.sh
# Claude Code 用户输入已响应时调用 (PostToolUse - AskUserQuestion)

DAEMON_URL="http://localhost:17530"
# 使用父进程 ID 作为会话标识
SESSION_PID=$PPID

# 更新会话状态为 running
curl -s -X PATCH "$DAEMON_URL/api/sessions/$SESSION_PID" \
  -H "Content-Type: application/json" \
  -d '{"status":"running"}' > /dev/null 2>&1

exit 0
