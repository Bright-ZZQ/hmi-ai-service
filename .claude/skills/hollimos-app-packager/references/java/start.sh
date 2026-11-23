#!/bin/bash

echo "=============== Server starting ==============="

# 获取脚本所在目录
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$CURRENT_DIR")"

# 路径定义
HSM_INSTALL_HOME="$HSM_HOME"
HSM_DATA_HOME="$HSM_HOME/data"
HSM_LOG_HOME="$HSM_HOME/log"
HSM_JAVA_LIB_HOME="$HSM_INSTALL_HOME/lib/java-common-dep/lib/"

# 应用配置
APP_JAR="{{APP_JAR}}"
APP_NAME="{{APP_ID}}"

# Java 路径
JAVA="${JAVA_HOME}/bin/java"

# JVM 参数
JAVA_HEAP_OPTS="-Xms256M -Xmx256M -Xss1m"
JAVA_OPTS="-server \
-DAPP_NAME=${APP_NAME} $JAVA_HEAP_OPTS \
-XX:MaxMetaspaceSize=256m \
-XX:MetaspaceSize=256m \
-XX:MaxDirectMemorySize=256m \
-Djava.compiler=NONE \
-XX:+UseG1GC \
-XX:+AlwaysPreTouch \
-Djava.awt.headless=true \
-Dfile.encoding=UTF-8 \
-Djna.nosys=true \
-XX:+HeapDumpOnOutOfMemoryError \
-Dlogging.file.path=$HSM_LOG_HOME"

# 定义 PID 文件
PID_FILE="$CURRENT_DIR/$APP_JAR.pid"

# 启动应用（后台运行）
nohup "$JAVA" $JAVA_OPTS \
  -Dloader.path="$HSM_JAVA_LIB_HOME" \
  -jar "$CURRENT_DIR/$APP_JAR" \
  --spring.config.location="file:${CURRENT_DIR}/" \
  > starting.log 2>&1 &

# 写入 PID
echo $! > "$PID_FILE"

echo "Application started in background."
echo "PID file: $PID_FILE"
echo "=============== Server start submitted ==============="
