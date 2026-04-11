#!/bin/bash
# hooks/subagent-stop.sh
# 子代理停止时调用 (SubagentStop Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "SubagentStop"

exit 0
