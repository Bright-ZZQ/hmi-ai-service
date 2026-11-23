#!/bin/bash

# ==============================================================
# 【可选】二进制编译构建（arm64 / aarch64）
# 以下为通用的 Go 语言交叉编译命令，如需在此脚本中自动编译，请取消注释并按实际情况调整。
# 注意：构建命令需在项目根目录（本脚本的上上一级目录）中执行。
# C/C++ 项目请替换为对应的交叉编译 make 或 cmake 命令。
# ==============================================================
# SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
# echo "------ Building binary (aarch64) ------"
# cd "$PROJECT_DIR"
# CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOFLAGS=-trimpath \
#   go build -ldflags="-s -w" -o {{APP_BINARY}} main.go
# cd "$SCRIPT_DIR"
# ==============================================================

# 将 arm 架构的二进制文件复制到 bin 目录下
cp ../../{{APP_BINARY}} ./bin/

APP_ID={{APP_ID}}
APP_VERSION={{APP_VERSION}}

# 创建构建目录
mkdir -p build/pre/${APP_ID}-${APP_VERSION}
mkdir -p build/final/${APP_ID}-${APP_VERSION}

# 复制文件
echo "------ Copy files ------"
cp -r bin build/pre/${APP_ID}-${APP_VERSION}
cp appmanifest_aarch64.ini build/final/${APP_ID}-${APP_VERSION}/appmanifest.ini

# 压缩
echo "------ Compress files ------"
tar zcvf build/pre/${APP_ID}-${APP_VERSION}.tar.gz -C build/pre ${APP_ID}-${APP_VERSION}
cp build/pre/${APP_ID}-${APP_VERSION}.tar.gz build/final/${APP_ID}-${APP_VERSION}
tar zcvf build/final/${APP_ID}_aarch64-${APP_VERSION}.tar.gz -C build/final ${APP_ID}-${APP_VERSION}

# 移动包
cp build/final/${APP_ID}_aarch64-${APP_VERSION}.tar.gz build/

# 清除资源
echo "------ Clear files ------"
rm -rf build/pre
rm -rf build/final

echo "------ Everything done ------"
