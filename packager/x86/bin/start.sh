#!/bin/bash

echo "=============== Server starting ==============="

# 平台以 bin 目录为工作目录执行本脚本；dist、node_modules、.env 均位于 bin 目录下
CURRENT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$CURRENT_DIR" || exit 1

APP_NAME=hmi-ai-svc
PID_FILE="$CURRENT_DIR/$APP_NAME.pid"
LOG_DIR="${HSM_HOME:-/usr/local/hsm-os}/logs/$APP_NAME"

if ! command -v node >/dev/null 2>&1; then
    echo "node not found in PATH!"
    exit 1
fi

# 服务最低支持 Node 18
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "node $(node -v) is too old, Node 18+ required!"
    exit 1
fi

mkdir -p "$LOG_DIR"

# 已在运行则不重复启动
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "$APP_NAME is running!"
    exit 0
fi

export NODE_ENV=production

# 服务通过 dotenv 读取当前工作目录下的 .env
nohup node "$CURRENT_DIR/dist/index.js" > "$LOG_DIR/$APP_NAME.log" 2>&1 &

echo $! > "$PID_FILE"

echo "$APP_NAME started, PID: $(cat "$PID_FILE"), log: $LOG_DIR/$APP_NAME.log"
echo "=============== Server start submitted ==============="
