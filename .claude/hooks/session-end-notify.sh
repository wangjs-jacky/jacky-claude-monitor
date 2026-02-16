#!/bin/bash
# Claude Code 会话结束时发送通知

# 读取 JSON 输入
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
REASON=$(echo "$INPUT" | jq -r '.reason // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')

# 获取当前时间戳
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 日志记录
LOG_FILE="$HOME/.claude/session-end-log.txt"
echo "[$TIMESTAMP] Session ended - ID: ${SESSION_ID} | Reason: ${REASON} | Dir: ${CWD}" >> "$LOG_FILE"

# 根据不同的退出原因显示不同的消息
case "$REASON" in
    "prompt_input_exit")
        MESSAGE="用户主动退出会话"
        ICON="👋"
        ;;
    "clear")
        MESSAGE="会话已被清除"
        ICON="🧹"
        ;;
    "logout")
        MESSAGE="用户已登出"
        ICON="🔒"
        ;;
    *)
        MESSAGE="会话结束"
        ICON="✅"
        ;;
esac

# 获取目录名称
DIR_NAME=$(basename "$CWD")

# 使用 osascript 发送通知
osascript -e "display notification \"目录: ${DIR_NAME}\" with title \"Claude Code ${ICON}\" subtitle \"${MESSAGE}\" sound name \"Glass\""

# 返回成功
echo '{"hookSpecificOutput":{"notified":true}}'
exit 0
