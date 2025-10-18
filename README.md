# File Templates Tool

管理并快速应用多语言的代码模板/片段：支持右键文件夹选择模板，在该文件夹下创建新文件。

## 功能

- 右击资源管理器中的文件夹，选择“从模板创建文件”。
- 自定义编辑器面板：当打开 `.file-templates` 下任意 `.json` 文件时，在编辑器区域显示一个面板用于编辑与保存模板 JSON，并可一键基于当前内容创建新模板文件。
- 模板可按“语言/文件夹”组织：例如 `.file-templates/javascript/default/NodeScript.json`；每种语言可建立多个子文件夹。
- 同时兼容旧结构：仍可使用 `.file-templates/<language>.json` 聚合模板文件。

## 使用方法

1. 在新窗口中：
   - 右击任意文件夹 → 选择“从模板创建文件”。
   - 首次使用会在工作区根目录创建 `.file-templates/` 并初始化示例模板。
   - 选择语言 → 选择模板 → 输入文件名，即可生成文件。
2. 自定义编辑器面板（只在编辑器区域显示）：
   - 打开 `.file-templates` 下任意 `.json` 文件（如 `Lua.json` 或 `javascript/default/NodeScript.json`）。
   - 顶部工具栏包含“保存”“从当前内容创建新模板文件”两个按钮。
   - “从当前内容创建新模板文件”：将当前内容保存为新的模板文件，并提示选择语言与目标文件夹。

4. 模板管理：打开命令面板（Ctrl+Shift+P），执行“管理文件模板”。
   - 新增模板（从文件导入）：选择一个现有文件作为模板来源，设置模板名与扩展名。
   - 编辑模板：选择模板并用文件内容替换其内容。
   - 删除模板：从语言模板列表中删除条目。
   - 打开模板JSON/目录：直接编辑对应的 JSON 或浏览模板目录。

## 占位符支持
- `${NAME}`：在生成文件时，替换为用户输入的文件名（自动过滤后缀）。
- 过滤规则：若输入包含多重后缀（如 `Main.xx.xx`），仅取第一个点之前的部分（例：`Main`）。
- 示例模板：

```json
{
  "name": "Main",
  "extension": "java",
  "content": "public class ${NAME} {\n  public static void main(String[] args){\n    System.out.println(\"Hello World\");\n  }\n}"
}
```

## 模板存储结构

- 工作区根目录下的 `.file-templates/` 为模板根目录。
- 推荐结构（语言/文件夹/模板文件）：

```
.file-templates/
  javascript/
    default/
      NodeScript.json
  csharp/
    console/
      ConsoleProgram.json
```

- 兼容旧结构：`.file-templates/<language>.json`（其中 `templates` 为模板数组）。
- 单模板 JSON 结构（新结构中的每个模板文件）：

```json
{
  "language": "javascript",
  "templates": [
    { "name": "NodeScript", "extension": "js", "content": "console.log('Hello');" }
  ]
}

## 备注

- 若无工作区，扩展会提示先打开一个工作区。
- 模板扩展名不带点（例如 `ts`、`py`）。
- 可通过“从当前内容创建新模板文件”选择语言与文件夹并创建新模板。