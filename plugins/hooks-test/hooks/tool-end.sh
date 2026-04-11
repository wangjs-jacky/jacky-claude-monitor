#!/bin/bash
# hooks/tool-end.sh
# 工具调用结束时调用 (PostToolUse Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "PostToolUse"

exit 0
