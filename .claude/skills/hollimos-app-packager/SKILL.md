---
name: hollimos-app-packager
description: 将应用程序打包构建为符合 xmagital 平台规范的应用包。适用于 Java、Web、Binary 等类型的应用。当用户需要打包应用、生成 appmanifest.ini、生成 start.sh 或 build.sh 时触发本技能。
---

# xmagital App Packager

xmagital 平台应用包为**双层 tar.gz 结构**：外层含 `appmanifest.ini` + 内层压缩包，内层含应用程序本身。

## 总流程 1：探测应用类型

检查工作区文件，确定类型：

| 特征文件 | 应用类型 |
|---|---|
| `pom.xml` / `build.gradle` | `java` |
| `package.json` | `web` |
| `go.mod` / `.c` / `.cpp` | `binary` |

若无法判断，**必须**向用户询问。c/cpp/golang 均归类为 `binary`。

## 总流程 2：收集通用信息

**必须**要向用户收集或确认这部分的信息

| 字段 | 说明 | 默认值 |
|---|---|---|
| `APP_ID` | 小写字母 + 中划线，如 `my-service` | — |
| `APP_NAME_CN` | 中文名称 | — |
| `APP_VERSION` | 三段式，如 `1.0.0` | `1.0.0` |
| `FUNC_DESC` | 功能描述（可选） | 同 `APP_NAME_CN` |
| 程序文件 | jar/二进制文件名；web 固定 `dist/` | 当前目录 |
| TCP 端口 | 启动后监听端口（web 无需） | 可为空 |

补充规则：
- 若 `APP_VERSION` 未提供，直接使用 `1.0.0`
- 若 `FUNC_DESC` 未提供，直接使用 `APP_NAME_CN`
- 若是 `web` 类型，还需结合路由配置判断是否需要继续向用户确认 `BACKEND_SERVER` 与 `BACKEND_PORT`
- 若无法从工作区可靠判断任何关键字段，先询问，再生成文件

## 总流程 3：加载类型处理器

根据应用类型读取对应的处理器文件，**按其中的完整指引**执行后续所有步骤（目录创建、文件生成、变量替换）。
进入处理器后，步骤编号将从 1 重新开始，表示“处理器内步骤”：

| 应用类型 | 处理器入口 |
|---|---|
| `java` | [references/java/guide.md](references/java/guide.md) |
| `web` | [references/web/guide.md](references/web/guide.md) |
| `binary` | [references/binary/guide.md](references/binary/guide.md) |

执行要求：
- 严格按处理器中的步骤顺序执行，不要跳步
- 先完成文件生成，再根据处理器中的“最终提醒”部分向用户做统一收尾
- 若模板中的某一段需要按项目实际情况删除或保留，必须先判断，再输出最终文件

> **扩展新类型**：在 `references/` 下新建对应类型的子目录，放入 `guide.md`（流程引导）及各模板文件，并在上表中添加一行即可。
