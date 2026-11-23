# Binary 应用处理器（C / C++ / Go）

> 在 SKILL.md 完成“总流程 1-3”并进入 Binary 处理器后，按以下“处理器内步骤”执行。
> Binary 类型需同时生成 **x86** 和 **arm** 两套文件，分别放在 `packager/x86/` 和 `packager/arm/` 下。

## 处理器内步骤 1：创建目录结构

```bash
mkdir -p packager/x86/bin packager/x86/build packager/arm/bin packager/arm/build
```

## 处理器内步骤 2：生成 start.sh

x86 和 arm 的 start.sh 内容完全相同。读取模板 [start.sh](start.sh)，按**变量替换规则**替换后分别写入：
- `packager/x86/bin/start.sh`
- `packager/arm/bin/start.sh`

## 处理器内步骤 3：生成 appmanifest.ini

- **x86**：读取模板 [appmanifest.ini](appmanifest.ini)，按**变量替换规则**替换后写入 `packager/x86/appmanifest.ini`
- **arm**：读取模板 [appmanifest_aarch64.ini](appmanifest_aarch64.ini)，按**变量替换规则**替换后写入 `packager/arm/appmanifest.ini`

## 处理器内步骤 4：生成 build.sh

- **x86**：读取模板 [build.sh](build.sh)，按**变量替换规则**替换后写入 `packager/x86/build.sh`
- **arm**：读取模板 [build_aarch64.sh](build_aarch64.sh)，按**变量替换规则**替换后写入 `packager/arm/build.sh`

## 变量替换规则

| 模板占位符 | 填入内容 |
|---|---|
| `{{APP_ID}}` | APP_ID（ID、appsets、start.sh 中的 `APP_NAME`） |
| `{{APP_NAME_CN}}` | APP_NAME_CN（name、funcDesc、appsets） |
| `{{APP_VERSION}}` | APP_VERSION |
| `{{APP_BINARY}}` | 二进制文件名（用户提供，如 `your-server`） |
| `{{FUNC_DESC}}` | FUNC_DESC（若用户未填则同 APP_NAME_CN） |
| `{{TCP_PORT}}` | 用户提供的 TCP 端口；若为空则删除全部 `healthCheck*`、`aliveDelaySeconds` 等健康检查行 |

如果项目除主程序外还依赖额外目录或文件，例如 `lib/`、`config/`、证书文件、模型文件等，也要一并纳入打包目录，并同步调整 `build.sh` 与 `start.sh`。

## ⚠️ 注意事项

所有文件生成完毕后，**必须**向用户提示以下检查项：

> **请检查 `packager/x86/bin/start.sh` 和 `packager/arm/bin/start.sh` 中的程序启动命令，确认是否需要添加额外的启动参数。**
> 常见的需要补充的场景包括：
> - 程序需要指定配置文件路径（如 `--config /path/to/config.yaml`）
> - 程序需要指定监听地址或端口（如 `--port 8080`）
> - 程序需要传入环境标识或运行模式（如 `--env production`）
> - 程序依赖特定的工作目录或数据目录
>
> 如需添加参数，在 `nohup ./$APP_NAME` 后追加即可。
> 如依赖动态库，也可以在此处补充 `export LD_LIBRARY_PATH=...` 后再启动程序。

> **请检查 `packager/x86/build.sh` 和 `packager/arm/build.sh` 中复制编译产物的命令和路径是否正确。**
> 运行打包脚本前，请先确认：
> - 对应架构的二进制文件已经编译生成
> - `cp ../../{{APP_BINARY}} ./bin/` 中的源路径与实际二进制文件位置一致；如有偏差请手动修改
> - x86 和 arm 二进制应分别为对应架构的交叉编译产物，不可混用
>
> **如果项目是 C/C++ 或其他使用动态链接的语言，还需额外确认以下内容：**
> - 程序依赖的自有 `.so` 动态库是否已一并复制到 `bin/` 目录，并在 `build.sh` 中添加了对应的 `cp` 命令
> - 程序依赖的配置文件（如 `config.yaml`、`config.toml` 等）是否已复制到打包目录中（通常与 `bin/` 同级的 `config/` 目录），并在 `build.sh` 中添加了对应的 `cp` 命令
> - `start.sh` 中是否通过 `LD_LIBRARY_PATH` 或 `-rpath` 正确指向了 `bin/` 下的动态库，或通过 `--config` 等参数指向了配置文件路径
>
> Go 静态编译（`CGO_ENABLED=0`）通常只需复制单个二进制文件，无需上述额外处理。

## 最终提醒

完成文件生成后，建议按以下结构向用户统一提醒：

```text
已完成 Binary 打包文件生成，请在构建前重点确认以下内容：
1. `packager/x86/bin/start.sh` 和 `packager/arm/bin/start.sh` 中的启动参数、配置文件路径、工作目录设置是否正确。
2. `packager/x86/build.sh` 和 `packager/arm/build.sh` 中复制的文件是否完整，除主二进制外，是否还需要补充 `lib/`、`config/` 或其他运行时资源。
3. 如项目依赖动态库，请确认 `start.sh` 中已正确设置 `LD_LIBRARY_PATH` 或其他库搜索路径。
4. x86 与 arm 的产物必须分别来自对应架构的编译结果，不能混用。
5. 如需自动编译，请按项目实际情况启用并调整 `build.sh` 头部的编译命令。

确认无误后，可分别执行：
cd packager/x86
./build.sh

cd ../arm
./build.sh
```

## 🎉 开始构建

> **请先检查 `packager/x86/build.sh` 和 `packager/arm/build.sh` 文件头部的编译构建部分。**
> 内容默认已用 `#` 注释，其中包含了通用的 Go 交叉编译示例（x86 使用 `GOARCH=amd64`，arm 使用 `GOARCH=arm64`）。
> 如希望在打包时自动编译，请参考其中的示例，取消注释并根据实际语言和项目调整命令。

完成以上所有检查后，分别进入 `packager/x86/` 和 `packager/arm/` 目录执行构建脚本：

```bash
# 构建 x86 包
cd packager/x86
./build.sh

# 构建 arm 包
cd ../arm
./build.sh
```

构建成功后，`packager/x86/build/` 和 `packager/arm/build/` 目录下将分别生成对应架构的 `.tar.gz` 应用包。
