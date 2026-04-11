#!/bin/bash
# hooks/permission-request.sh
# 权限请求时调用 (PermissionRequest Hook)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common/capture.sh"

capture_event "PermissionRequest"

exit 0
