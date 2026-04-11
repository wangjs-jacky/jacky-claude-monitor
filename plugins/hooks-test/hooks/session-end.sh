#!/bin/bash
# hooks/session-end.sh
# Claude Code 会话结束时调用

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "SessionEnd"

exit 0
