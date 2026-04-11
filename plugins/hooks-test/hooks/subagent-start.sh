#!/bin/bash
# hooks/subagent-start.sh
# 子代理启动时调用 (SubagentStart Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "SubagentStart"

exit 0
