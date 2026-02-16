#!/bin/bash
# hooks/session-start.sh
# Claude Code 会话开始时调用

DAEMON_URL="http://localhost:17530"
PID=$$
PPID=$(ps -o ppid= -p $$ | tr -d ' ')
TERMINAL="${TERM_PROGRAM:-unknown}"
CWD="$PWD"

# 发送到守护进程
curl -s -X POST "$DAEMON_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d "{
    \"pid\": $PID,
    \"ppid\": $PPID,
    \"terminal\": \"$TERMINAL\",
    \"cwd\": \"$CWD\"
  }" > /dev/null 2>&1

# 静默退出
exit 0
