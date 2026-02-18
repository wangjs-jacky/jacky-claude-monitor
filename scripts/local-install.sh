#!/bin/bash
# 本地安装脚本 - 在项目目录中运行
# 使用方法: ./scripts/local-install.sh

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="$HOME/.claude-monitor"

echo -e "${CYAN}Claude Code Monitor - 本地安装${NC}"
echo ""

# 检查 Swift
if ! command -v swiftc &> /dev/null; then
    echo "错误: 请先安装 Xcode Command Line Tools"
    echo "运行: xcode-select --install"
    exit 1
fi

# 创建目录
mkdir -p "$INSTALL_DIR/hooks"

# 复制 hooks
echo -e "${CYAN}复制 Hooks...${NC}"
cp "$PROJECT_DIR/hooks/"*.sh "$INSTALL_DIR/hooks/"
chmod +x "$INSTALL_DIR/hooks/"*.sh
echo -e "${GREEN}✓ Hooks 已复制${NC}"

# 编译 Swift 悬浮窗
echo -e "${CYAN}编译悬浮窗工具...${NC}"
cd "$PROJECT_DIR/swift-notify"
swiftc -o "$INSTALL_DIR/claude-float-window" main.swift -framework Cocoa
chmod +x "$INSTALL_DIR/claude-float-window"
echo -e "${GREEN}✓ 悬浮窗工具已编译${NC}"

# 构建项目
echo -e "${CYAN}构建守护进程...${NC}"
cd "$PROJECT_DIR"
pnpm build
echo -e "${GREEN}✓ 守护进程已构建${NC}"

echo ""
echo -e "${GREEN}✅ 安装完成！${NC}"
echo ""
echo "安装位置: $INSTALL_DIR"
echo ""
echo "Hooks 文件:"
for hook in "$INSTALL_DIR/hooks/"*.sh; do
    echo "  - $(basename $hook)"
done
echo ""
echo "下一步:"
echo "  1. 启动守护进程: pnpm start 或 node dist/cli.js start"
echo "  2. 在 Claude Code 中运行 /hooks 配置上述 hook 文件"
