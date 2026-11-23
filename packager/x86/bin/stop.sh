#!/bin/bash

CURRENT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$CURRENT_DIR" || exit 1

APP_NAME=hmi-ai-svc
APP_PORT=3100
PID_FILE="$CURRENT_DIR/$APP_NAME.pid"

killByPid() {
    local pid=$1
    for i in {1..10}; do
        kill -15 "$pid" 2>/dev/null
        sleep 1
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "$APP_NAME stopped, PID: $pid"
            return
        fi
    done
    kill -9 "$pid" 2>/dev/null
    echo "$APP_NAME killed (-9), PID: $pid"
}

if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        killByPid "$pid"
    fi
    rm -f "$PID_FILE"
else
    echo "$APP_NAME PID file does not exist."
fi

# 兜底：按监听端口清理残留进程
if command -v lsof >/dev/null 2>&1; then
    portPid=$(lsof -t -i :$APP_PORT -sTCP:LISTEN)
    if [ -n "$portPid" ]; then
        killByPid "$portPid"
    fi
fi

echo "$APP_NAME stopped."
