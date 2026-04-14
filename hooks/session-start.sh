#!/bin/bash
# hooks/session-start.sh
# Claude Code 会话开始时调用

SOCKET_PATH="$HOME/.claude-monitor/monitor.sock"
# 使用父进程 ID 作为会话标识（所有 hooks 都由同一父进程启动）
SESSION_PID=$PPID
PARENT_PID=$(ps -o ppid= -p $$ | tr -d ' ')
CWD="$PWD"

# 检测终端类型：通过父进程链区分 Cursor 和 VSCode
detect_terminal() {
  local pid=$SESSION_PID
  for i in $(seq 1 5); do
    local info=$(ps -o comm=,ppid= -p $pid 2>/dev/null)
    [ -z "$info" ] && break

    local comm=$(echo "$info" | awk '{$NF=""; print}' | sed 's/[[:space:]]*$//')
    local ppid=$(echo "$info" | awk '{print $NF}')

    # Cursor 必须在 VSCode 之前检查（进程名含 "Cursor Helper"）
    if echo "$comm" | grep -qi "cursor"; then
      echo "cursor"
      return
    fi
    if echo "$comm" | grep -qi "vscode\|code helper"; then
      echo "vscode"
      return
    fi
    if echo "$comm" | grep -qi "iterm"; then
      echo "iterm"
      return
    fi
    if echo "$comm" | grep -qi "warp"; then
      echo "warp"
      return
    fi
    if echo "$comm" | grep -qi "terminal"; then
      echo "terminal"
      return
    fi

    pid=$ppid
    [ -z "$pid" ] || [ "$pid" -le 1 ] && break
  done

  # 回退到 TERM_PROGRAM（Cursor 终端中该值可能为 "vscode"）
  echo "${TERM_PROGRAM:-unknown}"
}

TERMINAL=$(detect_terminal)

# 发送到守护进程
curl -s --unix-socket "$SOCKET_PATH" -X POST "http://localhost/api/sessions" \
  -H "Content-Type: application/json" \
  -d "{
    \"pid\": $SESSION_PID,
    \"ppid\": $PARENT_PID,
    \"terminal\": \"$TERMINAL\",
    \"cwd\": \"$CWD\"
  }" > /dev/null 2>&1

# 静默退出
exit 0
