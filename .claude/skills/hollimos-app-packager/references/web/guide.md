# Web 应用处理器（Vue / React）

> 在 SKILL.md 完成“总流程 1-3”并进入 Web 处理器后，按以下“处理器内步骤”执行。

## 处理器内步骤 1：创建目录结构

```bash
mkdir -p packager/files packager/build
```

## 处理器内步骤 2：生成 start.sh

Web 应用由平台 Nginx 直接托管，**无需生成 start.sh**。

## 处理器内步骤 3：生成 appmanifest.ini

读取模板 [appmanifest.ini](appmanifest.ini)，按**变量替换规则**替换后写入 `packager/appmanifest.ini`。

### 处理器内步骤 3.1：路由模式自动检测

在替换模板变量前，**必须**扫描项目源码，自动判断前端路由模式：

| 框架 | 检测文件 | hash 模式特征 | history 模式特征 |
|---|---|---|---|
| Vue | `src/router/index.ts` 或 `src/router/index.js` | `createWebHashHistory` | `createWebHistory` |
| React | `src/App.tsx` / `src/index.tsx` 等 | `HashRouter` | `BrowserRouter` |

检测规则：
1. 先查找项目中的路由配置文件（按上表中的路径扫描）
2. 在文件内容中匹配路由模式关键词
3. 若匹配到 hash 特征 → `ROUTE_MODE = hash`，`ROUTE_TYPE = alias`；同时**删除** `appmanifest.ini` 中 `path = "/{{APP_ID}}-{{APP_VERSION}}/files"` 整个 `[[execute.web.routes]]` 块
4. 若匹配到 history 特征 → `ROUTE_MODE = history`，`ROUTE_TYPE = try_files`；保留所有路由块
5. 若无法检测到路由配置，**必须**询问用户确认路由模式

## 处理器内步骤 4：生成 build.sh

读取模板 [build.sh](build.sh)，按**变量替换规则**替换后写入 `packager/build.sh`。

## 变量替换规则

| 模板占位符 | 填入内容 |
|---|---|
| `{{APP_ID}}` | APP_ID（所有出现处） |
| `{{APP_NAME_CN}}` | APP_NAME_CN |
| `{{APP_VERSION}}` | APP_VERSION |
| `{{FUNC_DESC}}` | FUNC_DESC（若用户未填则留空） |
| `{{ROUTE_MODE}}` | 路由模式（`hash` 或 `history`），由步骤 4 自动检测 |
| `{{ROUTE_TYPE}}` | 路由指令类型：hash → `alias`，history → `try_files` |
| `{{BACKEND_SERVER}}` | 后端服务对应的 IP 变量名 |
| `{{BACKEND_PORT}}` | 后端服务端口（用户提供，如 `8080`） |
| `cp -r ../dist/*` 路径 | 根据实际前端构建输出目录调整 |

> Web 应用无 TCP 端口健康检查，`appmanifest.ini` 中不需要填写端口。
> `[[execute.web.routes]]` 中的 http 和 websocket 路由根据实际有无后端服务决定保留或删除。

## ⚠️ 注意事项

所有文件生成完毕后，**必须**向用户提示以下检查项：

> **请检查 `packager/appmanifest.ini` 中的 `[[execute.web.routes]]` 配置是否符合当前项目的实际路由规则。**
> 每一条 `[[execute.web.routes]]` 本质上对应 Nginx 的一条 `location` 指令，需要确认：
> - 路由路径（`path`）与前端实际部署的 URL 路径一致
> - 如有后端 API 代理，`proxy_pass` 目标地址和 `rewrite` 规则正确
> - 如有 WebSocket 连接，相关配置已保留；如无则可删除对应路由块

> **请检查 `packager/build.sh` 中复制编译产物的命令和路径是否正确。**
> 运行打包脚本前，请先确认：
> - 前端构建产物（`dist/` 目录）已经生成
> - `cp -r ../dist/*` 中的源路径与实际构建输出目录一致；如有偏差请手动修改

## 最终提醒

完成文件生成后，建议按以下结构向用户统一提醒：

```text
已完成 Web 打包文件生成，请在构建前重点确认以下内容：
1. `packager/appmanifest.ini` 中的 `[[execute.web.routes]]` 是否符合实际路由规则。
2. 如存在后端 API 或 WebSocket，代理地址、端口和 rewrite 规则是否正确。
3. `packager/build.sh` 中前端产物复制路径是否与实际构建输出目录一致。
4. 如需自动编译，请按项目实际情况启用并调整 `build.sh` 头部的编译命令。

确认无误后，可执行：
cd packager
./build.sh
```

## 🎉 开始构建

> **请先检查 `packager/build.sh` 文件头部的编译构建部分。**
> 内容默认已用 `#` 注释，其中包含了通用的 `npm run build` / `vite build` 示例。
> 如希望在打包时自动编译，请参考其中的示例，取消注释并根据实际项目调整命令。

完成以上所有检查后，进入 `packager/` 目录执行构建脚本：

```bash
cd packager
./build.sh
```

构建成功后，`packager/build/` 目录下将生成符合 xmagital 平台规范的 `.tar.gz` 应用包。
