#!/bin/bash
# hooks/response-end.sh
# LLM 响应结束时调用 (Stop Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "Stop"

exit 0
