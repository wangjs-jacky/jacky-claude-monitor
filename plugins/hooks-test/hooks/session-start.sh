#!/bin/bash
# hooks/session-start.sh
# Claude Code 会话开始时调用

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "SessionStart"

exit 0
