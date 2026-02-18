#!/bin/bash
# 生成 Claude Code Hooks 配置 JSON

cat << 'EOF'
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-start.sh" }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/session-end.sh" }]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/prompt-submit.sh" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/waiting-input.sh" }]
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-start.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/input-answered.sh" }]
      },
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "~/.claude-monitor/hooks/tool-end.sh" }]
      }
    ]
  }
}
EOF
