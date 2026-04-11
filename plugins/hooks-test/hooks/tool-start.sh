#!/bin/bash
# hooks/tool-start.sh
# 工具调用开始时调用 (PreToolUse Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "PreToolUse"

exit 0
