#!/bin/bash
# Claude Code Monitor - 卸载脚本

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="$HOME/.claude-monitor"

echo -e "${CYAN}Claude Code Monitor - 卸载程序${NC}"
echo ""

if [[ ! -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}未找到安装目录，可能未安装${NC}"
    exit 0
fi

# 确认卸载
read -p "确定要卸载 Claude Code Monitor? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# 停止守护进程
echo -e "${CYAN}停止守护进程...${NC}"
if pgrep -f "node.*daemon.js" > /dev/null; then
    pkill -f "node.*daemon.js" 2>/dev/null || true
    echo -e "${GREEN}✓ 守护进程已停止${NC}"
fi

# 删除安装目录
echo -e "${CYAN}删除安装文件...${NC}"
rm -rf "$INSTALL_DIR"
echo -e "${GREEN}✓ 安装目录已删除${NC}"

echo ""
echo -e "${GREEN}🎉 卸载完成！${NC}"
echo ""
echo -e "${YELLOW}注意: Claude Code 中的 Hooks 配置需要手动移除${NC}"
echo "  在 Claude Code 中运行 /hooks 命令查看和编辑配置"
