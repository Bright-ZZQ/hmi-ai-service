#!/bin/bash

# ==============================================================
# 【可选】前端编译构建
# 以下为通用的 vite 构建命令，如需在此脚本中自动编译，请取消注释并按实际情况调整。
# 注意：构建命令需在项目根目录（本脚本的上一级目录）中执行。
# ==============================================================
# SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# echo "------ Building frontend ------"
# cd "$PROJECT_DIR"
# npm run build          # 或 vite build，根据项目实际构建命令调整
# cd "$SCRIPT_DIR"
# ==============================================================

# 将前端构建产物复制到 files 目录
cp -r ../dist/* ./files/

APP_ID={{APP_ID}}
APP_VERSION={{APP_VERSION}}

# 创建构建目录
mkdir -p build/pre/${APP_ID}-${APP_VERSION}
mkdir -p build/final/${APP_ID}-${APP_VERSION}

# 复制文件
echo "------ Copy files ------"
cp -r files build/pre/${APP_ID}-${APP_VERSION}
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
