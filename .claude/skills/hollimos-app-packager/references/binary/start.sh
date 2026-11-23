#!/bin/bash

echo "=============== Server starting ==============="

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$CURRENT_DIR")"

# 默认的环境变量
HSM_INSTALL_HOME="${HSM_HOME}"
HSM_DATA_HOME="${HSM_HOME}/data"
HSM_LOG_HOME="${HSM_HOME}/log"

APP_NAME={{APP_ID}}

# 定义日志和 PID 文件
PID_FILE="$CURRENT_DIR/$APP_NAME.pid"

chmod +x ./$APP_NAME

nohup ./$APP_NAME > starting.log 2>&1 &

# 写入 PID
echo $! > "$PID_FILE"

echo "Application started in background."
echo "PID file: $PID_FILE"
echo "=============== Server start submitted ==============="
