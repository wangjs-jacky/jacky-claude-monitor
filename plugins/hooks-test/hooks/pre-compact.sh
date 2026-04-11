#!/bin/bash
# hooks/pre-compact.sh
# 上下文压缩前调用 (PreCompact Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "PreCompact"

exit 0
