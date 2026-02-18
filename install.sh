#!/bin/bash
# Claude Code Monitor - 一键安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/你的用户名/jacky-claude-monitor/main/install.sh | bash

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 安装目录
INSTALL_DIR="$HOME/.claude-monitor"
REPO_URL="https://github.com/你的用户名/jacky-claude-monitor.git"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         Claude Code Monitor - 安装程序                    ║"
echo "║         监控 Claude Code 会话，优雅的通知体验              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 检查操作系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${YELLOW}警告: 此工具目前仅支持 macOS${NC}"
    echo "其他系统的支持正在开发中..."
    exit 1
fi

# 检查依赖
echo -e "${CYAN}[1/5] 检查依赖...${NC}"

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ 缺少依赖: $1${NC}"
        echo "  请先安装: $2"
        exit 1
    fi
    echo -e "${GREEN}✓ $1 已安装${NC}"
}

check_command "curl" "brew install curl"
check_command "git" "brew install git"
check_command "jq" "brew install jq"

# 检查 Swift
if ! command -v swiftc &> /dev/null; then
    echo -e "${RED}✗ 缺少 Swift 编译器${NC}"
    echo "  请安装 Xcode Command Line Tools: xcode-select --install"
    exit 1
fi
echo -e "${GREEN}✓ Swift 已安装${NC}"

# 创建安装目录
echo -e "${CYAN}[2/5] 创建安装目录...${NC}"
mkdir -p "$INSTALL_DIR/hooks"
echo -e "${GREEN}✓ 目录已创建: $INSTALL_DIR${NC}"

# 下载或更新仓库
echo -e "${CYAN}[3/5] 下载最新版本...${NC}"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

if git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null; then
    echo -e "${GREEN}✓ 仓库已克隆${NC}"
else
    echo -e "${RED}✗ 克隆失败，请检查网络连接或仓库地址${NC}"
    exit 1
fi

# 复制 hooks
echo -e "${CYAN}[4/5] 安装 Hooks...${NC}"
cp "$TEMP_DIR/hooks/"*.sh "$INSTALL_DIR/hooks/"
chmod +x "$INSTALL_DIR/hooks/"*.sh
echo -e "${GREEN}✓ Hooks 已安装${NC}"

# 编译 Swift 悬浮窗
echo -e "${CYAN}[5/5] 编译悬浮窗工具...${NC}"
cd "$TEMP_DIR/swift-notify"
if swiftc -o "$INSTALL_DIR/claude-float-window" main.swift -framework Cocoa 2>/dev/null; then
    chmod +x "$INSTALL_DIR/claude-float-window"
    echo -e "${GREEN}✓ 悬浮窗工具已编译${NC}"
else
    echo -e "${RED}✗ 编译失败${NC}"
    exit 1
fi

# 安装完成
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               🎉 安装成功！                                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "安装位置: ${CYAN}$INSTALL_DIR${NC}"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo ""
echo "  1. 启动守护进程:"
echo -e "     ${CYAN}cd $TEMP_DIR && pnpm install && pnpm build${NC}"
echo -e "     ${CYAN}node dist/cli.js start${NC}"
echo ""
echo "  2. 配置 Claude Code Hooks (在 Claude Code 会话中运行):"
echo -e "     ${CYAN}/hooks${NC}"
echo ""
echo "  3. 选择以下 Hook 文件:"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/session-start.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/session-end.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/prompt-submit.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/waiting-input.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/input-answered.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/tool-start.sh${NC}"
echo -e "     ${CYAN}$INSTALL_DIR/hooks/tool-end.sh${NC}"
echo ""
echo -e "${YELLOW}卸载方法:${NC}"
echo -e "  运行 ${CYAN}rm -rf $INSTALL_DIR${NC}"
echo ""
