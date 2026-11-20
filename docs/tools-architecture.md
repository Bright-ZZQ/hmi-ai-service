# 工具层架构（src/tools）

agent（内部 LLM 循环）与 mcp 共用的工具集中在 `src/tools/`，按类别分目录；工具的定义、执行 handler、分类元数据在同一处绑定。

## 目录结构

```
src/
  tools/
    index.ts        公共 API（getToolsForType / executeToolCall / createSession / lintRegistry …）
    core/           context（SessionState、公共辅助）、session、finalize、registry（汇总 + 校验）、
                    executor（handler 分发 + 启动自检）、result-compactor、tool-module（ToolModule 类型）
    _shared/        参数片段与工厂（渐变 / 条件 / 旋转中心 / update·delete·plan 工具工厂）
    plan/           declare_generation_plan
    shape/          create_display_* / create_symbol_*
    feature/        add_feature_*、add_event_definition、set_display_script、set_pipe_script、set_symbol_attr_function
    edit/           update_element / delete_element / find_elements
    batch/          clone_element_grid / bulk_apply_feature / copy_features / import_point_table / group_elements / ungroup_elements
    layout/         align_elements / distribute_elements / set_z_order / fit_to_canvas
    page/           set_page_property / declare_page_params
    inspect/        lint_display / list_features / remove_feature / update_feature / get_element_detail / check_feature_conditions / test_script
    assembly/       assemble_display / assemble_symbol（含 display-integrity、overlay-events、edit-context）
    interaction/    ask_user（audience: 'agent'）
    lib/            非工具领域库：element-builders、element-lookup、element-geometry、text-entities、schema-validator、model-point-resolver
  prompts/          shared（共享片段）、loop（buildLoopSystemPrompt）、mcp（buildMcpInstructions）
  agent/            agent-service、thinking-digest、plan-preview、tool-routing（按意图 / 阶段 / 轮次收窄下发）
  mcp/              MCP 服务；专属工具 begin_session / get_session_state / export_result 留在此处
```

## 分类说明

分类即 `SkillMeta.category`（plan / shape / feature / edit / batch / layout / page / inspect / assembly）。脚本类工具保持 `feature`，随动态特性在特性阶段下发。`phases` / `keywords` / `core` 是 `agent/tool-routing.ts` 的路由依据，`audience` 决定是否对 MCP 暴露（`'agent'` 仅内部循环使用，缺省 `'all'`）。

## ToolModule

每个分类目录的 `index.ts` 导出 `ToolModule[]`：

```ts
interface ToolModule {
  definition: ToolDefinition  // 下发给模型的定义
  handler: ToolHandler        // 执行逻辑
  meta: SkillMeta             // category / phases / keywords / core / audience
  group: 'display' | 'symbol'
}
```

`core/registry.ts` 汇总全部模块；`getToolsForType` 的顺序由 `MODULES` 数组决定（display / symbol 各自的相对顺序即下发顺序）。`lintRegistry` 校验名称唯一、命名合规、定义 / meta / handler 一一对应；`core/executor.ts` 启动时自检，失败即抛错。

## 依赖规则

```
agent → tools      mcp → tools      routes → agent / config
```

- `tools/` 不得引用 `agent/`、`mcp/`、`routes/`
- `mcp/` 不得引用 `agent/`
- `prompts/` 不得引用 `agent/`、`mcp/`

由 `scripts/check-deps.cjs` 检查，已接入 `npm test`（build 之后）。`lib/` 为底层库，不得反向引用工具分类目录；公共函数出现环依赖时下沉到 `lib/` 或 `core/`。

## 新增工具指南

1. 选择类别目录（没有合适类别再新建，并在 `core/registry.ts` 的 `MODULES` 中追加）。
2. 在该目录的 `definitions*.ts` 中写 `SkillRegistryEntry`（`toolDef` + `group`），handler 写在 `handlers.ts` 等文件，复用 `core/context.ts` 中的 `ok` / `fail` / `recordStep` 等辅助。
3. 在目录 `index.ts` 用 `defineTool(entry, handler, meta)` 登记 `ToolModule`，填写 `category` / `phases` / `keywords`；仅内部循环使用的工具加 `audience: 'agent'`。
4. 运行 `npm test`：`lintRegistry` 与依赖检查会发现漏登记、重名或违规引用。
5. 工具名称、描述与参数会影响模型行为；改动已有工具定义时注意 `selectTools` 的下发结果与 prompts 中的说明保持一致。
