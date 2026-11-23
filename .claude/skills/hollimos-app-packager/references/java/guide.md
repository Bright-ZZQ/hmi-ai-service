# Java 应用处理器

> 在 SKILL.md 完成“总流程 1-3”并进入 Java 处理器后，按以下“处理器内步骤”执行。

## 处理器内步骤 1：创建目录结构

```bash
mkdir -p packager/bin packager/build
```

## 处理器内步骤 2：生成 start.sh

读取模板 [start.sh](start.sh)，按**变量替换规则**替换后写入 `packager/bin/start.sh`。

## 处理器内步骤 3：生成 appmanifest.ini

读取模板 [appmanifest.ini](appmanifest.ini)，按**变量替换规则**替换后写入 `packager/appmanifest.ini`。

## 处理器内步骤 4：生成 build.sh

读取模板 [build.sh](build.sh)，按**变量替换规则**替换后写入 `packager/build.sh`。

## 变量替换规则

| 模板占位符 | 填入内容 |
|---|---|
| `{{APP_ID}}` | APP_ID |
| `{{APP_JAR}}` | jar 文件名（用户提供，如 `my-service.jar`） |
| `{{APP_NAME_CN}}` | APP_NAME_CN |
| `{{APP_VERSION}}` | APP_VERSION |
| `{{FUNC_DESC}}` | FUNC_DESC（若用户未填则同 APP_NAME_CN） |
| `{{TCP_PORT}}` | 用户提供的 TCP 端口；若为空则删除全部健康检查行 |
| `cp ../target/*.jar` 路径 | 根据实际 jar 包所在位置调整 |

## ⚠️ 注意事项

所有文件生成完毕后，**必须**向用户提示以下检查项：

> **请检查 `packager/bin/start.sh` 中的 JVM 参数是否适合当前应用。**
> 重点关注以下参数，根据应用实际内存需求手动调整：
> - `-Xms` / `-Xmx`：堆内存初始值和上限（模板默认 256M，实际应根据服务规模调整）
> - `-Xss`：每个线程的栈大小
> - `-XX:MaxMetaspaceSize` / `-XX:MetaspaceSize`：元空间大小
> - `-XX:MaxDirectMemorySize`：直接内存上限

> **请检查 `packager/build.sh` 中复制编译产物的命令和路径是否正确。**
> 运行打包脚本前，请先确认：
> - jar 包已经编译生成
> - `cp ../target/*.jar ./bin/` 中的源路径与实际 jar 包输出目录一致；如有偏差请手动修改

## 最终提醒

完成文件生成后，建议按以下结构向用户统一提醒：

```text
已完成 Java 打包文件生成，请在构建前重点确认以下内容：
1. `packager/bin/start.sh` 中的 JVM 参数是否适合当前应用。
2. `packager/build.sh` 中 jar 包复制路径是否与实际编译产物位置一致。
3. 如需自动编译，请按项目实际情况启用并调整 `build.sh` 头部的编译命令。

确认无误后，可执行：
cd packager
./build.sh
```

## 🎉 开始构建

> **请先检查 `packager/build.sh` 文件头部的编译构建部分。**
> 内容默认已用 `#` 注释，其中包含了通用的 `mvn package` 示例。
> 如希望在打包时自动编译，请参考其中的示例，取消注释并根据实际项目调整命令。

完成以上所有检查后，进入 `packager/` 目录执行构建脚本：

```bash
cd packager
./build.sh
```

构建成功后，`packager/build/` 目录下将生成符合 xmagital 平台规范的 `.tar.gz` 应用包。
