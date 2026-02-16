#!/bin/bash
# scripts/install.sh
# 全局安装 Claude Monitor

set -e

echo "🚀 Installing Claude Monitor..."

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 构建项目
echo "📦 Building project..."
cd "$PROJECT_DIR"
pnpm install
pnpm build

# 创建全局配置目录
CONFIG_DIR="$HOME/.claude-monitor"
mkdir -p "$CONFIG_DIR"

# 复制 hooks
echo "📋 Copying hooks to $CONFIG_DIR/hooks..."
cp -r "$PROJECT_DIR/hooks" "$CONFIG_DIR/"

# 设置执行权限
chmod +x "$CONFIG_DIR/hooks/"*.sh

# 全局链接 CLI
echo "🔗 Linking CLI globally..."
pnpm link --global

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Start the daemon: claude-monitor start"
echo "2. Add hooks to ~/.claude/settings.json (see ARCHITECTURE.md)"
