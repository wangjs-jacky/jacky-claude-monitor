#!/bin/bash
# hooks/common/capture.sh
# 共用的捕获工具函数（参照 claude-monitor/hooks/common/config.sh 模式）

# 捕获目录配置
CAPTURE_DIR="$PWD/.hooks-test/captures"

# 确保捕获目录存在
ensure_capture_dir() {
  mkdir -p "$CAPTURE_DIR"
}

# 读取 stdin 数据
read_stdin() {
  STDIN_DATA=""
  if [ ! -t 0 ]; then
    STDIN_DATA=$(cat)
  fi
}

# 提取 session_id（优先环境变量，其次 stdin）
get_session_id() {
  if [ -n "${CLAUDE_SESSION_ID:-}" ]; then
    echo "$CLAUDE_SESSION_ID"
  elif [ -n "$STDIN_DATA" ] && command -v jq &> /dev/null; then
    echo "$STDIN_DATA" | jq -r '.session_id // "unknown"' 2>/dev/null
  else
    echo "unknown"
  fi
}

# 获取捕获文件路径
get_capture_file() {
  local session_id="$1"
  echo "$CAPTURE_DIR/${session_id}.jsonl"
}

# 获取下一个序号
get_next_seq() {
  local capture_file="$1"
  local seq=1
  if [ -f "$capture_file" ]; then
    seq=$(($(wc -l < "$capture_file") + 1))
  fi
  echo "$seq"
}

# 收集环境变量
collect_env() {
  jq -n -c \
    --argjson ppid "$PPID" \
    --arg pwd "$PWD" \
    --arg term "${TERM_PROGRAM:-}" \
    --arg session "${CLAUDE_SESSION_ID:-}" \
    --arg conversation "${CLAUDE_CONVERSATION_ID:-}" \
    '{PPID: $ppid, PWD: $pwd, TERM_PROGRAM: $term, CLAUDE_SESSION_ID: $session, CLAUDE_CONVERSATION_ID: $conversation}' 2>/dev/null \
    || echo "{\"PPID\":$PPID,\"PWD\":\"$PWD\",\"TERM_PROGRAM\":\"${TERM_PROGRAM:-}\",\"CLAUDE_SESSION_ID\":\"${CLAUDE_SESSION_ID:-}\",\"CLAUDE_CONVERSATION_ID\":\"${CLAUDE_CONVERSATION_ID:-}\"}"
}

# 处理 stdin JSON
process_stdin_json() {
  STDIN_JSON="null"
  VALID_JSON=false
  FIELD_COUNT=0

  if [ -n "$STDIN_DATA" ]; then
    if command -v jq &> /dev/null; then
      if echo "$STDIN_DATA" | jq -e . > /dev/null 2>&1; then
        STDIN_JSON="$STDIN_DATA"
        VALID_JSON=true
        FIELD_COUNT=$(echo "$STDIN_DATA" | jq 'if type == "object" then keys | length else 0 end' 2>/dev/null)
      else
        STDIN_JSON="\"$(echo "$STDIN_DATA" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g')\""
      fi
    else
      STDIN_JSON="\"$(echo "$STDIN_DATA" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g')\""
    fi
  fi
}

# 完整的捕获流程
capture_event() {
  local hook_name="$1"

  ensure_capture_dir
  read_stdin

  local session_id=$(get_session_id)
  local capture_file=$(get_capture_file "$session_id")
  local seq=$(get_next_seq "$capture_file")
  local time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local env_data=$(collect_env)

  process_stdin_json

  # 记录当前 session
  echo "$session_id" > "$PWD/.hooks-test/latest-session"

  # 写入捕获记录
  if command -v jq &> /dev/null; then
    jq -n -c \
      --argjson seq "$seq" \
      --arg hook "$hook_name" \
      --arg time "$time" \
      --argjson env "$env_data" \
      --argjson stdin "$STDIN_JSON" \
      --argjson valid_json "$VALID_JSON" \
      --argjson field_count "$FIELD_COUNT" \
      '{seq: $seq, hook: $hook, time: $time, env: $env, stdin: $stdin, valid_json: $valid_json, field_count: $field_count}' >> "$capture_file"
  else
    echo "{\"seq\":$seq,\"hook\":\"$hook_name\",\"time\":\"$time\",\"env\":$env_data,\"stdin\":$STDIN_JSON,\"valid_json\":$VALID_JSON,\"field_count\":$FIELD_COUNT}" >> "$capture_file"
  fi
}
