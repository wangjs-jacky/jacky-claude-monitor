#!/bin/bash
# hooks/tool-failure.sh
# 工具调用失败时调用 (PostToolUseFailure Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "PostToolUseFailure"

exit 0
