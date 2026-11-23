#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$SCRIPT_DIR"

APP_ID=hmi-ai-svc
APP_VERSION=1.0.0
STAGE=build/pre/${APP_ID}-${APP_VERSION}

# 是否将生产依赖(node_modules)打入包内；目标机无法联网安装依赖，默认打入
BUNDLE_NODE_MODULES="${BUNDLE_NODE_MODULES:-true}"

# 编译 TypeScript（输出到项目根目录 dist/）
echo "------ Building project ------"
(cd "$PROJECT_DIR" && npm run build)

# 创建构建目录
rm -rf build/pre build/final
mkdir -p ${STAGE}/bin
mkdir -p build/final/${APP_ID}-${APP_VERSION}

# 复制文件：运行时文件统一放入 bin 目录（平台以 bin 为工作目录）
echo "------ Copy files ------"
cp bin/start.sh bin/stop.sh bin/hmi-ai-svc ${STAGE}/bin/
cp -r "$PROJECT_DIR/dist" ${STAGE}/bin/
cp "$PROJECT_DIR/package.json" ${STAGE}/bin/
cp "$PROJECT_DIR/appmanifest.ini" build/final/${APP_ID}-${APP_VERSION}/

# 统一为 LF 换行并赋予执行权限，避免 Windows 下打包导致 "bad interpreter: /bin/bash^M"
sed -i 's/\r$//' ${STAGE}/bin/*.sh
chmod +x ${STAGE}/bin/*.sh

if [ "$BUNDLE_NODE_MODULES" = "true" ]; then
    echo "------ Install production dependencies ------"
    # 项目的 package-lock.json 与 package.json 不同步（项目使用 pnpm-lock.yaml），故不使用 npm ci
    (cd ${STAGE}/bin && npm install --omit=dev --no-package-lock --no-audit --no-fund)
fi

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
