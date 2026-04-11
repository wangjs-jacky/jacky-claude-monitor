#!/bin/bash
# bin/interactive.sh
# Hooks Test 交互式引导测试
# 引导用户按步骤触发每个 hook 事件，每步实时验证

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$HOME/.claude-hooks-test"
CAPTURE_DIR="$TEST_DIR/captures"
SCHEMA_FILE="$SCRIPT_DIR/../hooks/schemas.json"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# 检查依赖
if ! command -v jq &> /dev/null; then
  echo -e "${RED}错误: 需要 jq 工具${RESET}" >&2
  exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  echo -e "${RED}错误: schemas.json 不存在${RESET}" >&2
  exit 1
fi

# 结果记录
RESULTS_FILE="$TEST_DIR/interactive-results.json"
mkdir -p "$TEST_DIR"

# 初始化结果
echo '{"steps":[],"started":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' > "$RESULTS_FILE"

# 辅助函数
get_session_file() {
  if [ -f "$TEST_DIR/latest-session" ]; then
    local sid=$(cat "$TEST_DIR/latest-session")
    echo "$CAPTURE_DIR/${sid}.jsonl"
  else
    echo ""
  fi
}

get_event_count() {
  local event="$1"
  local file=$(get_session_file)
  if [ -n "$file" ] && [ -f "$file" ]; then
    grep -c "\"hook\":\"$event\"" "$file" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

wait_for_event() {
  local event="$1"
  local timeout="${2:-60}"
  local elapsed=0
  local initial=$(get_event_count "$event")

  while [ "$elapsed" -lt "$timeout" ]; do
    local current=$(get_event_count "$event")
    if [ "$current" -gt "$initial" ]; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

validate_latest_event() {
  local event="$1"
  local file=$(get_session_file)
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "NO_DATA"
    return
  fi

  # 获取最新的该事件记录
  local record=$(grep "\"hook\":\"$event\"" "$file" | tail -1)
  if [ -z "$record" ]; then
    echo "NOT_FOUND"
    return
  fi

  local stdin_json=$(echo "$record" | jq -c '.stdin // {}' 2>/dev/null)
  local seq=$(echo "$record" | jq -r '.seq // 0')

  # 获取 schema
  local required=$(jq -c --arg e "$event" '.schemas[$e].required_fields // {} | keys' "$SCHEMA_FILE")
  local failed="[]"

  echo "$required" | jq -r '.[]' | while IFS= read -r field; do
    [ -z "$field" ] && continue
    local value=$(echo "$stdin_json" | jq -r --arg f "$field" '.[$f] // empty' 2>/dev/null)
    if [ -z "$value" ]; then
      echo "FAIL:$field:缺失必需字段"
      return
    fi
  done

  # hook_event_name 检查
  local actual=$(echo "$stdin_json" | jq -r '.hook_event_name // empty')
  if [ "$actual" != "$event" ]; then
    echo "FAIL:hook_event_name:期望=$event,实际=$actual"
    return
  fi

  echo "PASS"
}

record_step() {
  local step_num="$1"
  local name="$2"
  local status="$3"
  local detail="${4:-}"
  local events="${5:-}"

  local entry=$(jq -n -c \
    --arg step "$step_num" \
    --arg name "$name" \
    --arg status "$status" \
    --arg detail "$detail" \
    --arg events "$events" \
    '{step: $step, name: $name, status: $status, detail: $detail, events: $events}')

  local tmp=$(jq -c --argjson e "$entry" '.steps += [$e]' "$RESULTS_FILE")
  echo "$tmp" > "$RESULTS_FILE"
}

print_step_header() {
  local num="$1"
  local name="$2"
  echo ""
  echo -e "${BOLD}${CYAN}━━━ Step ${num}: ${name} ━━━${RESET}"
}

print_result() {
  local status="$1"
  local detail="${2:-}"
  if [ "$status" = "PASS" ]; then
    echo -e "  ${GREEN}✓ PASS${RESET} $detail"
  elif [ "$status" = "SKIP" ]; then
    echo -e "  ${YELLOW}○ SKIP${RESET} $detail"
  elif [ "$status" = "TIMEOUT" ]; then
    echo -e "  ${YELLOW}⏱ TIMEOUT${RESET} $detail"
  else
    echo -e "  ${RED}✗ FAIL${RESET} $detail"
  fi
}

# ═══════════════════════════════════════
# 测试流程开始
# ═══════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        Claude Code Hooks 交互式测试                           ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  本脚本将引导你按步骤触发每个 hook 事件"
echo -e "  请在 ${CYAN}另一个终端${RESET} 中使用 Claude Code"
echo ""
echo -e "  ${DIM}注意: 此脚本应在新会话中运行，先启动此脚本再启动 Claude Code${RESET}"
echo ""

# ── Step 0: 准备 ──
print_step_header "0" "准备环境"
echo -e "  清除旧测试数据..."
rm -rf "$TEST_DIR"
mkdir -p "$CAPTURE_DIR"
echo -e "  ${GREEN}✓ 准备完成${RESET}"
record_step "0" "准备环境" "PASS" ""

# ── Step 1: SessionStart ──
print_step_header "1" "SessionStart"
echo -e "  请在另一个终端 ${BOLD}启动一个新的 Claude Code 会话${RESET}"
echo -e "  ${DIM}(等待 SessionStart 事件...)${RESET}"

if wait_for_event "SessionStart" 120; then
  result=$(validate_latest_event "SessionStart")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "SessionStart 数据结构正确"
    record_step "1" "SessionStart" "PASS" "" "SessionStart"
  else
    print_result "FAIL" "$result"
    record_step "1" "SessionStart" "FAIL" "$result" "SessionStart"
  fi
else
  print_result "TIMEOUT" "等待 120 秒未检测到 SessionStart"
  record_step "1" "SessionStart" "TIMEOUT" "等待超时"
fi

# ── Step 2: UserPromptSubmit + Stop ──
print_step_header "2" "UserPromptSubmit + Stop"
echo -e "  请在 Claude Code 中输入 ${BOLD}hello${RESET} 并回车"
echo -e "  ${DIM}(等待 UserPromptSubmit 和 Stop 事件...)${RESET}"

prompt_ok=false
if wait_for_event "UserPromptSubmit" 60; then
  result=$(validate_latest_event "UserPromptSubmit")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "UserPromptSubmit 数据结构正确"
    prompt_ok=true
  else
    print_result "FAIL" "UserPromptSubmit: $result"
  fi
  record_step "2a" "UserPromptSubmit" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "UserPromptSubmit"
else
  print_result "TIMEOUT" "等待 UserPromptSubmit 超时"
  record_step "2a" "UserPromptSubmit" "TIMEOUT" ""
fi

echo -e "  ${DIM}(等待 Claude 回答完成... Stop 事件)${RESET}"
if wait_for_event "Stop" 60; then
  result=$(validate_latest_event "Stop")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "Stop 数据结构正确"
  else
    print_result "FAIL" "Stop: $result"
  fi
  record_step "2b" "Stop" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "Stop"
else
  print_result "TIMEOUT" "等待 Stop 超时"
  record_step "2b" "Stop" "TIMEOUT" ""
fi

# ── Step 3: PreToolUse + PostToolUse ──
print_step_header "3" "PreToolUse + PostToolUse"
echo -e "  请在 Claude Code 中输入:"
echo -e "  ${CYAN}请读取当前目录下的 CLAUDE.md 文件${RESET}"

pre_ok=false
if wait_for_event "PreToolUse" 60; then
  result=$(validate_latest_event "PreToolUse")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "PreToolUse 数据结构正确"
    pre_ok=true
  else
    print_result "FAIL" "PreToolUse: $result"
  fi
  record_step "3a" "PreToolUse" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "PreToolUse"
else
  print_result "TIMEOUT" "等待 PreToolUse 超时"
  record_step "3a" "PreToolUse" "TIMEOUT" ""
fi

echo -e "  ${DIM}(等待工具执行完成... PostToolUse)${RESET}"
if wait_for_event "PostToolUse" 60; then
  result=$(validate_latest_event "PostToolUse")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "PostToolUse 数据结构正确"
  else
    print_result "FAIL" "PostToolUse: $result"
  fi
  record_step "3b" "PostToolUse" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "PostToolUse"
else
  print_result "TIMEOUT" "等待 PostToolUse 超时"
  record_step "3b" "PostToolUse" "TIMEOUT" ""
fi

# ── Step 4: PostToolUseFailure ──
print_step_header "4" "PostToolUseFailure"
echo -e "  请在 Claude Code 中输入:"
echo -e "  ${CYAN}请读取 /nonexistent/test-file-that-does-not-exist.txt${RESET}"

if wait_for_event "PostToolUseFailure" 60; then
  result=$(validate_latest_event "PostToolUseFailure")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "PostToolUseFailure 数据结构正确"
  else
    print_result "FAIL" "PostToolUseFailure: $result"
  fi
  record_step "4" "PostToolUseFailure" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "PostToolUseFailure"
else
  print_result "TIMEOUT" "等待 PostToolUseFailure 超时"
  record_step "4" "PostToolUseFailure" "TIMEOUT" ""
fi

# ── Step 5: SubagentStart + SubagentStop ──
print_step_header "5" "SubagentStart + SubagentStop"
echo -e "  请在 Claude Code 中输入:"
echo -e "  ${CYAN}请使用 Agent 帮我看看 src/types.ts 的内容${RESET}"
echo -e "  ${DIM}(等待子代理启动和停止...)${RESET}"

if wait_for_event "SubagentStart" 90; then
  result=$(validate_latest_event "SubagentStart")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "SubagentStart 数据结构正确"
  else
    print_result "FAIL" "SubagentStart: $result"
  fi
  record_step "5a" "SubagentStart" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "SubagentStart"

  echo -e "  ${DIM}(等待子代理完成... SubagentStop)${RESET}"
  if wait_for_event "SubagentStop" 120; then
    result=$(validate_latest_event "SubagentStop")
    if [ "$result" = "PASS" ]; then
      print_result "PASS" "SubagentStop 数据结构正确"
    else
      print_result "FAIL" "SubagentStop: $result"
    fi
    record_step "5b" "SubagentStop" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "SubagentStop"
  else
    print_result "TIMEOUT" "等待 SubagentStop 超时"
    record_step "5b" "SubagentStop" "TIMEOUT" ""
  fi
else
  print_result "TIMEOUT" "等待 SubagentStart 超时（Claude 可能未使用 Agent）"
  record_step "5a" "SubagentStart" "TIMEOUT" "Claude 可能未使用 Agent"
fi

# ── Step 6: Notification ──
print_step_header "6" "Notification"
echo -e "  请 ${BOLD}等待 60+ 秒不操作${RESET} Claude Code，让空闲通知触发"
echo -e "  ${DIM}或者输入一个需要权限确认的操作${RESET}"
echo -e "  ${DIM}(等待 Notification 事件，最长等待 120 秒...)${RESET}"

if wait_for_event "Notification" 120; then
  result=$(validate_latest_event "Notification")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "Notification 数据结构正确"
  else
    print_result "FAIL" "Notification: $result"
  fi
  record_step "6" "Notification" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "Notification"
else
  print_result "TIMEOUT" "等待 Notification 超时"
  record_step "6" "Notification" "TIMEOUT" ""
fi

# ── Step 7: PermissionRequest（可选） ──
print_step_header "7" "PermissionRequest (可选)"
echo -e "  此事件仅在 ${BOLD}非 bypassPermissions${RESET} 模式下触发"
echo -e "  当前环境如果使用 bypassPermissions 模式，此步骤自动跳过"
echo -e "  ${DIM}如果要测试，请切换到默认权限模式后执行操作${RESET}"
print_result "SKIP" "取决于权限模式配置"
record_step "7" "PermissionRequest" "SKIP" "取决于权限模式"

# ── Step 8: PreCompact（跳过） ──
print_step_header "8" "PreCompact (跳过)"
echo -e "  此事件需要极长上下文才能触发"
echo -e "  在正常测试中无法手动触发，标记为 SKIP"
print_result "SKIP" "需要极长上下文"
record_step "8" "PreCompact" "SKIP" "需要极长上下文触发"

# ── Step 9: SessionEnd ──
print_step_header "9" "SessionEnd"
echo -e "  请在 Claude Code 中输入 ${BOLD}/exit${RESET} 或 ${BOLD}Ctrl+C${RESET} 退出"
echo -e "  ${DIM}(等待 SessionEnd 事件...)${RESET}"

if wait_for_event "SessionEnd" 60; then
  result=$(validate_latest_event "SessionEnd")
  if [ "$result" = "PASS" ]; then
    print_result "PASS" "SessionEnd 数据结构正确"
  else
    print_result "FAIL" "SessionEnd: $result"
  fi
  record_step "9" "SessionEnd" "$([ "$result" = "PASS" ] && echo PASS || echo FAIL)" "$result" "SessionEnd"
else
  print_result "TIMEOUT" "等待 SessionEnd 超时"
  record_step "9" "SessionEnd" "TIMEOUT" ""
fi

# ═══════════════════════════════════════
# 生成总结
# ═══════════════════════════════════════

# 运行完整验证
echo ""
echo -e "${BOLD}正在运行完整验证...${RESET}"
"$SCRIPT_DIR/validate.sh" 2>/dev/null

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD} 测试完成${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# 显示报告
"$SCRIPT_DIR/report.sh" 2>/dev/null || true

echo -e "  详细报告: ${CYAN}${REPORT_FILE}${RESET}"
echo -e "  完整验证: ${CYAN}${TEST_DIR}/report.json${RESET}"
echo -e "  交互记录: ${CYAN}${RESULTS_FILE}${RESET}"
echo ""
