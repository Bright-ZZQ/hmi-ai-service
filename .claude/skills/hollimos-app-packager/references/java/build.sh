#!/bin/bash

# ==============================================================
# 【可选】Java 编译构建
# 以下为通用的 Maven 构建命令，如需在此脚本中自动编译，请取消注释并按实际情况调整。
# 注意：构建命令需在项目根目录（本脚本的上一级目录）中执行。
# ==============================================================
# SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# echo "------ Building Java project ------"
# cd "$PROJECT_DIR"
# mvn package -DskipTests  # 如使用 Gradle，替换为：./gradlew bootJar
# cd "$SCRIPT_DIR"
# ==============================================================

# 将 jar 包复制到 bin 目录下（从项目 target 目录）
cp ../target/*.jar ./bin/

APP_ID={{APP_ID}}
APP_VERSION={{APP_VERSION}}

# 创建构建目录
mkdir -p build/pre/${APP_ID}-${APP_VERSION}
mkdir -p build/final/${APP_ID}-${APP_VERSION}

# 复制文件
echo "------ Copy files ------"
cp -r bin build/pre/${APP_ID}-${APP_VERSION}
cp appmanifest.ini build/final/${APP_ID}-${APP_VERSION}

# 压缩
echo "------ Compress files ------"
tar zcvf build/pre/${APP_ID}-${APP_VERSION}.tar.gz -C build/pre ${APP_ID}-${APP_VERSION}
cp build/pre/${APP_ID}-${APP_VERSION}.tar.gz build/final/${APP_ID}-${APP_VERSION}
tar zcvf build/final/${APP_ID}-${APP_VERSION}.tar.gz -C build/final ${APP_ID}-${APP_VERSION}

# 移动包
cp build/final/${APP_ID}-${APP_VERSION}.tar.gz build/

# 清除资源
echo "------ Clear files ------"
rm -rf build/pre
rm -rf build/final

echo "------ Everything done ------"
