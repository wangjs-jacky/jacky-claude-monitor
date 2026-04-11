#!/bin/bash
# bin/report.sh
# Hooks Test 报告格式化工具
# 读取 report.json → 输出终端友好的表格报告

set -euo pipefail

TEST_DIR="$HOME/.claude-hooks-test"
REPORT_FILE="$TEST_DIR/report.json"

if [ ! -f "$REPORT_FILE" ]; then
  echo "错误: 没有找到报告文件" >&2
  echo "请先运行 validate.sh" >&2
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "错误: 需要 jq 工具" >&2
  exit 1
fi

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# 读取报告数据
TOTAL_EVENTS=$(jq -r '.total_events' "$REPORT_FILE")
TOTAL_CHECKS=$(jq -r '.total_checks' "$REPORT_FILE")
PASSED=$(jq -r '.passed' "$REPORT_FILE")
FAILED=$(jq -r '.failed' "$REPORT_FILE")
WARNINGS=$(jq -r '.warnings' "$REPORT_FILE")
COVERAGE_RATE=$(jq -r '.coverage.rate' "$REPORT_FILE")
TEST_TIME=$(jq -r '.test_time' "$REPORT_FILE")

# 表头
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║          Claude Code Hooks Test Report                      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  测试时间: ${CYAN}${TEST_TIME}${RESET}"
echo -e "  事件总数: ${TOTAL_EVENTS}  检查总数: ${TOTAL_CHECKS}"
echo ""

# 事件覆盖表
echo -e "  ${BOLD}事件覆盖${RESET}"
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

# 获取 schema 中所有事件名
EVENTS=$(jq -r '.summary | keys[]' "$REPORT_FILE")

# 计算列宽
printf "  %-22s %6s %8s %s\n" "事件" "次数" "结果" "说明"
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

while IFS= read -r event; do
  count=$(jq -r --arg e "$event" '.summary[$e].count' "$REPORT_FILE")
  status=$(jq -r --arg e "$event" '.summary[$e].status' "$REPORT_FILE")
  note=$(jq -r --arg e "$event" '.summary[$e].note // ""' "$REPORT_FILE")

  case "$status" in
    "PASS") color="$GREEN"; symbol="✓" ;;
    "FAIL") color="$RED"; symbol="✗" ;;
    "SKIP") color="$YELLOW"; symbol="○" ;;
    *) color=""; symbol="?" ;;
  esac

  if [ "$count" -eq 0 ]; then
    count_display="-"
  else
    count_display="$count"
  fi

  printf "  %-22s %6s " "$event" "$count_display"
  echo -e "${color}${symbol} ${status}${RESET}   ${DIM}${note}${RESET}"
done <<< "$EVENTS"

echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"
echo -e "  覆盖率: ${CYAN}${COVERAGE_RATE}${RESET}"
echo ""

# 验证结果
PASS_RATE="0"
if [ "$TOTAL_CHECKS" -gt 0 ]; then
  PASS_RATE=$(echo "scale=1; $PASSED * 100 / $TOTAL_CHECKS" | bc 2>/dev/null || echo "$PASSED/$TOTAL_CHECKS")
fi

echo -e "  ${BOLD}数据结构验证${RESET}"
echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

if [ "$FAILED" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "  ${GREEN}全部通过: ${PASSED}/${TOTAL_CHECKS} checks passed (100%)${RESET}"
else
  echo -e "  通过: ${GREEN}${PASSED}${RESET}  失败: ${RED}${FAILED}${RESET}  警告: ${YELLOW}${WARNINGS}${RESET}  (${PASS_RATE}%)"
fi

# 失败详情
if [ "$FAILED" -gt 0 ] || [ "$WARNINGS" -gt 0 ]; then
  echo ""

  # 按事件分组显示失败
  while IFS= read -r event; do
    failures=$(jq -c --arg e "$event" '.summary[$e].failures // []' "$REPORT_FILE")
    failure_count=$(echo "$failures" | jq 'length')

    if [ "$failure_count" -gt 0 ]; then
      echo -e "  ${BOLD}${event}:${RESET}"
      echo "$failures" | jq -c '.[]' | while IFS= read -r f; do
        seq=$(echo "$f" | jq -r '.seq')
        field=$(echo "$f" | jq -r '.field')
        issue=$(echo "$f" | jq -r '.issue')
        severity=$(echo "$f" | jq -r '.severity')

        if [ "$severity" = "error" ]; then
          color="$RED"
        else
          color="$YELLOW"
        fi

        echo -e "    ${color}[$severity #${seq}]${RESET} ${field}: ${issue}"
      done
    fi
  done <<< "$EVENTS"
fi

# 额外字段发现
EXTRA=$(jq -c '.extra_fields_discovered' "$REPORT_FILE")
extra_count=$(echo "$EXTRA" | jq 'to_entries | map(select(.value | length > 0)) | length')

if [ "$extra_count" -gt 0 ]; then
  echo ""
  echo -e "  ${BOLD}额外字段发现${RESET} (${DIM}schema 中未定义${RESET})"
  echo -e "  ${DIM}──────────────────────────────────────────────────────────${RESET}"

  echo "$EXTRA" | jq -c 'to_entries[] | select(.value | length > 0)' | while IFS= read -r entry; do
    event=$(echo "$entry" | jq -r '.key')
    fields=$(echo "$entry" | jq -r '.value | join(", ")')
    echo -e "  ${CYAN}${event}${RESET}: ${fields}"
  done
fi

# 总结
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}结果: PASS${RESET}"
  [ "$WARNINGS" -gt 0 ] && echo -e "  (${YELLOW}${WARNINGS} warnings${RESET})"
else
  echo -e "  ${RED}${BOLD}结果: FAIL${RESET} (${FAILED} failures)"
fi
echo ""
