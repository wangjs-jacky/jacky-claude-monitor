#!/bin/bash
# hooks/prompt-submit.sh
# 用户提交提问时调用 (UserPromptSubmit Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "UserPromptSubmit"

exit 0
