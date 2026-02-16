#!/bin/bash
# hooks/session-end.sh
# Claude Code 会话结束时调用

DAEMON_URL="http://localhost:17530"
PID=$$

# 从守护进程注销
curl -s -X DELETE "$DAEMON_URL/api/sessions/$PID" > /dev/null 2>&1

# 发送系统通知
osascript -e 'display notification "会话已结束" with title "Claude Monitor" sound name "Glass"' 2>/dev/null

exit 0
