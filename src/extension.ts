import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TemplatesJsonEditorProvider } from './jsonEditor';
import { TemplateManagerPanel } from './managerPanel';

type TemplateItem = {
  name: string;
  extension: string; // without leading dot
  content: string;
};

type TemplatesFile = {
  language: string;
  templates: TemplateItem[];
};

const DEFAULT_LANGUAGES: { id: string; label: string; defaultExt: string; sample?: TemplateItem }[] = [
  {
    id: 'csharp',
    label: 'C#',
    defaultExt: 'cs',
    sample: {
      name: 'ConsoleProgram',
      extension: 'cs',
      content: `using System;\n\nclass Program {\n    static void Main(string[] args) {\n        Console.WriteLine("Hello World");\n    }\n}`
    }
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    defaultExt: 'js',
    sample: {
      name: 'NodeScript',
      extension: 'js',
      content: `#!/usr/bin/env node\n\nconsole.log('Hello from template');`
    }
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    defaultExt: 'ts',
    sample: {
      name: 'ClassTemplate',
      extension: 'ts',
      content: `export class Template {\n  constructor(public name: string) {}\n}\n`
    }
  },
  {
    id: 'java',
    label: 'Java',
    defaultExt: 'java',
    sample: {
      name: 'Main',
      extension: 'java',
      content: `public class Main {\n  public static void main(String[] args){\n    System.out.println("Hello World");\n  }\n}`
    }
  },
  {
    id: 'python',
    label: 'Python',
    defaultExt: 'py',
    sample: {
      name: 'script',
      extension: 'py',
      content: `def main():\n    print('Hello from template')\n\nif __name__ == '__main__':\n    main()`
    }
  }
];

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0] : undefined;
}

function getTemplatesRoot(): string | undefined {
  const folder = getWorkspaceFolder();
  if (!folder) return undefined;
  return path.join(folder.uri.fsPath, '.file-templates');
}

async function ensureTemplatesInitialized(): Promise<void> {
  const root = getTemplatesRoot();
  if (!root) {
    vscode.window.showErrorMessage('请先打开一个工作区以使用模板。');
    return;
  }
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  // Create default language files if missing
  for (const lang of DEFAULT_LANGUAGES) {
    const filePath = path.join(root, `${lang.id}.json`);
    if (!fs.existsSync(filePath)) {
      const content: TemplatesFile = {
        language: lang.id,
        templates: lang.sample ? [lang.sample] : []
      };
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    }
  }
}

function listLanguageFiles(): { id: string; label: string; file: string }[] {
  const root = getTemplatesRoot();
  if (!root || !fs.existsSync(root)) return [];
  const files = fs.readdirSync(root).filter((f: string) => f.endsWith('.json'));
  const map: { [id: string]: string } = {};
  for (const f of files) {
    const id = path.basename(f, '.json');
    map[id] = path.join(root, f);
  }
  const entries: { id: string; label: string; file: string }[] = [];
  for (const id of Object.keys(map)) {
    const defaultLang = DEFAULT_LANGUAGES.find(l => l.id === id);
    entries.push({ id, label: defaultLang ? defaultLang.label : id, file: map[id] });
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

function readTemplates(filePath: string): TemplatesFile {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as TemplatesFile;
    if (!data.templates) data.templates = [];
    return data;
  } catch {
    return { language: path.basename(filePath, '.json'), templates: [] };
  }
}

function writeTemplates(filePath: string, data: TemplatesFile) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function pickLanguage(): Promise<{ id: string; label: string; file: string } | undefined> {
  await ensureTemplatesInitialized();
  const langs = listLanguageFiles();
  const addLanguageItem = { label: '➕ 新增语言', id: '__add__', file: '' } as any;
  const selected = await vscode.window.showQuickPick([
    ...langs.map(l => ({ label: l.label, description: l.id, id: l.id, file: l.file })),
    addLanguageItem
  ], { placeHolder: '选择语言' });
  if (!selected) return undefined;
  if (selected.id === '__add__') {
    const name = await vscode.window.showInputBox({ prompt: '输入新语言标识（例如: ruby, go, rust）', validateInput: v => v ? undefined : '不能为空' });
    if (!name) return undefined;
    const ext = await vscode.window.showInputBox({ prompt: '为该语言设定默认扩展名（不含点，例如：rb）', validateInput: v => v ? undefined : '不能为空' });
    if (!ext) return undefined;
    const root = getTemplatesRoot();
    if (!root) return undefined;
    const file = path.join(root, `${name}.json`);
    if (!fs.existsSync(file)) {
      const data: TemplatesFile = { language: name, templates: [] };
      writeTemplates(file, data);
    }
    return { id: name, label: name, file };
  }
  return selected as any;
}

async function commandCreateFromTemplate(targetUri?: vscode.Uri) {
  const folderUri = await resolveFolderUriFromContext(targetUri);
  if (!folderUri) return;
  const lang = await pickLanguage();
  if (!lang) return;
  // 优先支持按语言/文件夹的模板结构
  let templates: TemplateItem[] = [];
  const root = getTemplatesRoot();
  const langDir = root ? path.join(root, lang.id) : undefined;
  if (langDir && fs.existsSync(langDir)) {
    let folders = fs.readdirSync(langDir).filter(d => fs.statSync(path.join(langDir, d)).isDirectory());
    if (folders.length === 0) folders = ['default'];
    const folderPick = await vscode.window.showQuickPick(folders.map(f => ({ label: f })), { placeHolder: '选择模板文件夹' });
    if (!folderPick) return;
    const folderPath = path.join(langDir, folderPick.label);
    if (fs.existsSync(folderPath)) {
      const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const obj = JSON.parse(fs.readFileSync(path.join(folderPath, f), 'utf8')) as TemplateItem;
          if (obj && obj.name && obj.extension) templates.push(obj);
        } catch {}
      }
    }
  }
  // 回退到旧的聚合JSON
  if (templates.length === 0) {
    const data = readTemplates(lang.file);
    templates = data.templates || [];
  }
  if (!templates || templates.length === 0) {
    const add = await vscode.window.showInformationMessage('当前语言没有模板，是否先添加模板？', '添加模板', '取消');
    if (add === '添加模板') {
      await commandManageTemplates();
    }
    return;
  }
  const pickTemplate = await vscode.window.showQuickPick(
    templates.map(t => ({ label: t.name, description: `.${t.extension}` })),
    { placeHolder: '选择一个模板' }
  );
  if (!pickTemplate) return;
  const chosen = templates.find(t => t.name === pickTemplate.label)!;

  const baseName = await vscode.window.showInputBox({ prompt: '输入新文件名（不含扩展名）', validateInput: v => v ? undefined : '不能为空' });
  if (!baseName) return;
  // 过滤用户输入中的后缀：只取第一个点之前的文件名部分
  const baseNameNoExt = baseName.split('.')[0];
  const filePath = path.join(folderUri.fsPath, `${baseNameNoExt}.${chosen.extension}`);
  if (fs.existsSync(filePath)) {
    const overwrite = await vscode.window.showWarningMessage('文件已存在，是否覆盖？', '覆盖', '取消');
    if (overwrite !== '覆盖') return;
  }
  // 支持模板内容中的占位符：${NAME} 替换为不带后缀的文件名
  const finalContent = (chosen.content || '').replace(/\$\{NAME\}/g, baseNameNoExt);
  fs.writeFileSync(filePath, finalContent, 'utf8');
  const createdUri = vscode.Uri.file(filePath);
  vscode.window.showInformationMessage(`已创建：${path.basename(filePath)}`);
  try {
    const doc = await vscode.workspace.openTextDocument(createdUri);
    await vscode.window.showTextDocument(doc);
  } catch {}
}

async function resolveFolderUriFromContext(targetUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (targetUri) {
    try {
      const stat = await vscode.workspace.fs.stat(targetUri);
      if (stat && stat.type === vscode.FileType.Directory) return targetUri;
      // If a file was clicked, use its parent
      if (stat && stat.type === vscode.FileType.File) {
        return vscode.Uri.file(path.dirname(targetUri.fsPath));
      }
    } catch {
      // ignore
    }
  }
  const folder = getWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('请在打开的工作区中右击目标文件夹使用该功能。');
    return undefined;
  }
  return folder.uri;
}

async function commandManageTemplates() {
  await ensureTemplatesInitialized();
  const lang = await pickLanguage();
  if (!lang) return;
  const actions = await vscode.window.showQuickPick([
    { label: '➕ 新增模板（从文件导入）', id: 'add' },
    { label: '✏️ 编辑模板（替换为文件内容）', id: 'edit' },
    { label: '🗑️ 删除模板', id: 'delete' },
    { label: '📂 打开模板JSON', id: 'open' },
    { label: '📁 打开模板目录', id: 'openDir' }
  ], { placeHolder: '选择操作' });
  if (!actions) return;
  switch (actions.id) {
    case 'add':
      await addTemplateFromFile(lang);
      break;
    case 'edit':
      await editTemplateFromFile(lang);
      break;
    case 'delete':
      await deleteTemplate(lang);
      break;
    case 'open': {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(lang.file));
      await vscode.window.showTextDocument(doc);
      break; }
    case 'openDir': {
      const root = getTemplatesRoot();
      if (!root) return;
      const uri = vscode.Uri.file(root);
      await vscode.commands.executeCommand('revealInExplorer', uri);
      break; }
    default:
      break;
  }
}

async function addTemplateFromFile(lang: { id: string; label: string; file: string }) {
  const pick = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: '选择一个文件导入为模板' });
  if (!pick || pick.length === 0) return;
  const fileUri = pick[0];
  const content = fs.readFileSync(fileUri.fsPath, 'utf8');
  const defaultName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
  const defaultExt = path.extname(fileUri.fsPath).replace(/^\./, '') || (DEFAULT_LANGUAGES.find(x => x.id === lang.id)?.defaultExt ?? 'txt');
  const name = await vscode.window.showInputBox({ prompt: '输入模板名称', value: defaultName, validateInput: v => v ? undefined : '不能为空' });
  if (!name) return;
  const ext = await vscode.window.showInputBox({ prompt: '输入模板文件扩展名（不含点）', value: defaultExt, validateInput: v => v ? undefined : '不能为空' });
  if (!ext) return;
  const data = readTemplates(lang.file);
  data.templates.push({ name, extension: ext, content });
  writeTemplates(lang.file, data);
  vscode.window.showInformationMessage(`已添加模板：${name}.${ext}`);
}

async function editTemplateFromFile(lang: { id: string; label: string; file: string }) {
  const data = readTemplates(lang.file);
  if (data.templates.length === 0) {
    vscode.window.showInformationMessage('当前语言没有模板可编辑。');
    return;
  }
  const pickTpl = await vscode.window.showQuickPick(data.templates.map(t => ({ label: t.name, description: `.${t.extension}` })), { placeHolder: '选择要编辑的模板' });
  if (!pickTpl) return;
  const toEdit = data.templates.find(t => t.name === pickTpl.label)!;
  const pickFile = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: '选择一个文件以替换模板内容' });
  if (!pickFile || pickFile.length === 0) return;
  const content = fs.readFileSync(pickFile[0].fsPath, 'utf8');
  toEdit.content = content;
  writeTemplates(lang.file, data);
  vscode.window.showInformationMessage(`模板已更新：${toEdit.name}`);
}

async function deleteTemplate(lang: { id: string; label: string; file: string }) {
  const data = readTemplates(lang.file);
  if (data.templates.length === 0) {
    vscode.window.showInformationMessage('当前语言没有模板可删除。');
    return;
  }
  const pickTpl = await vscode.window.showQuickPick(data.templates.map(t => ({ label: t.name, description: `.${t.extension}` })), { placeHolder: '选择要删除的模板' });
  if (!pickTpl) return;
  const confirm = await vscode.window.showWarningMessage(`确认删除模板：${pickTpl.label}?`, '删除', '取消');
  if (confirm !== '删除') return;
  const idx = data.templates.findIndex(t => t.name === pickTpl.label);
  if (idx >= 0) {
    data.templates.splice(idx, 1);
    writeTemplates(lang.file, data);
    vscode.window.showInformationMessage('模板已删除');
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('fileTemplates.createFromTemplate', commandCreateFromTemplate),
    vscode.commands.registerCommand('fileTemplates.manageTemplates', commandManageTemplates),
    vscode.commands.registerCommand('fileTemplates.openManagerPanel', () => TemplateManagerPanel.open(context)),
    vscode.commands.registerCommand('fileTemplates.openTemplatesFolder', async () => {
      await ensureTemplatesInitialized();
      const root = getTemplatesRoot();
      if (!root) return;
      const uri = vscode.Uri.file(root);
      await vscode.commands.executeCommand('revealInExplorer', uri);
    }),
    TemplatesJsonEditorProvider.register(context)
  );
}

export function deactivate() {}