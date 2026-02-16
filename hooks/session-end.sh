#!/bin/bash
# hooks/session-end.sh
# Claude Code 会话结束时调用

DAEMON_URL="http://localhost:17530"
# 使用父进程 ID 作为会话标识
SESSION_PID=$PPID

# 从守护进程注销
curl -s -X DELETE "$DAEMON_URL/api/sessions/$SESSION_PID" > /dev/null 2>&1

# 发送系统通知
osascript -e 'display notification "会话已结束" with title "Claude Monitor" sound name "Glass"' 2>/dev/null

exit 0
