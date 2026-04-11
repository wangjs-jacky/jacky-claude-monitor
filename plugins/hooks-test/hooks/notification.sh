#!/bin/bash
# hooks/notification.sh
# Claude Code 发送通知时调用 (Notification Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "Notification"

exit 0
