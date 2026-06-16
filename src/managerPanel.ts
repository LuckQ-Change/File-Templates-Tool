import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface SnippetItem {
  id: string;
  language: string;
  folder: string; // 'aggregated' 表示聚合文件
  name: string;
  extension: string;
  content: string;
  type: 'file' | 'aggregate';
  filePath: string; // 对于 file 是具体模板文件；对于 aggregate 是聚合文件路径
  index?: number; // 聚合文件中模板索引
}

export class TemplateManagerPanel {
  static async open(_context: vscode.ExtensionContext) {
    const root = this.getTemplatesRoot();
    if (!root) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'fileTemplates.managerPanel',
      '模板总览管理面板',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = this.getHtml(panel.webview);

    const postIndex = () => {
      const items = this.indexAll(root);
      panel.webview.postMessage({ type: 'init', items });
    };

    postIndex();

    panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'refresh':
          postIndex();
          break;
        case 'openFile':
          if (msg.filePath) {
            try {
              const filePath = String(msg.filePath);
              if (!this.isSafeTemplateJsonPath(root, filePath)) {
                vscode.window.showErrorMessage('拒绝打开：路径不安全或不在 .file-templates 下');
                break;
              }
              const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.filePath));
              await vscode.window.showTextDocument(doc, { preview: false });
            } catch {}
          }
          break;
        case 'saveSnippet': {
          const it: SnippetItem = msg.item;
          if (!it || !it.filePath) break;
          if (!this.isSafeTemplateJsonPath(root, String(it.filePath))) {
            vscode.window.showErrorMessage('保存失败：路径不安全或不在 .file-templates 下');
            break;
          }
          if (it.type === 'file') {
            const payload = { name: it.name, extension: it.extension.replace(/^\./,''), content: it.content };
            try { fs.writeFileSync(it.filePath, JSON.stringify(payload, null, 2), 'utf8'); } catch {}
          } else {
            try {
              const obj = JSON.parse(fs.readFileSync(it.filePath, 'utf8'));
              if (Array.isArray(obj.templates) && typeof it.index === 'number') {
                obj.templates[it.index] = { name: it.name, extension: it.extension.replace(/^\./,''), content: it.content };
                fs.writeFileSync(it.filePath, JSON.stringify(obj, null, 2), 'utf8');
              }
            } catch {}
          }
          vscode.window.showInformationMessage('已保存模板');
          postIndex();
          break; }
        case 'deleteSnippet': {
          const it: SnippetItem = msg.item;
          if (!it || !it.filePath) break;
          if (!this.isSafeTemplateJsonPath(root, String(it.filePath))) {
            vscode.window.showErrorMessage('删除失败：路径不安全或不在 .file-templates 下');
            break;
          }
          if (it.type === 'file') {
            try { fs.unlinkSync(it.filePath); } catch {}
          } else {
            try {
              const obj = JSON.parse(fs.readFileSync(it.filePath, 'utf8'));
              if (Array.isArray(obj.templates) && typeof it.index === 'number') {
                obj.templates.splice(it.index, 1);
                fs.writeFileSync(it.filePath, JSON.stringify(obj, null, 2), 'utf8');
              }
            } catch {}
          }
          vscode.window.showInformationMessage('已删除模板');
          postIndex();
          break; }
        case 'duplicateSnippet': {
          const it: SnippetItem = msg.item;
          if (!it || !it.filePath) break;
          if (!this.isSafeTemplateJsonPath(root, String(it.filePath))) {
            vscode.window.showErrorMessage('复制失败：路径不安全或不在 .file-templates 下');
            break;
          }
          if (it.type === 'file') {
            try {
              const dir = path.dirname(it.filePath);
              let base = it.name + ' Copy';
              let target = path.join(dir, `${base}.json`);
              let n = 1;
              while (fs.existsSync(target)) { base = it.name + ` Copy ${n++}`; target = path.join(dir, `${base}.json`); }
              const payload = { name: base, extension: it.extension.replace(/^\./,''), content: it.content };
              fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
            } catch {}
          } else {
            try {
              const obj = JSON.parse(fs.readFileSync(it.filePath, 'utf8'));
              if (Array.isArray(obj.templates)) {
                obj.templates.splice((it.index ?? obj.templates.length), 0, { name: it.name + ' Copy', extension: it.extension.replace(/^\./,''), content: it.content });
                fs.writeFileSync(it.filePath, JSON.stringify(obj, null, 2), 'utf8');
              }
            } catch {}
          }
          vscode.window.showInformationMessage('已复制模板');
          postIndex();
          break; }
        case 'createSnippet': {
          const langId = await vscode.window.showInputBox({ prompt: '输入语言ID（如 javascript, typescript, csharp, java, python, lua ...）', validateInput: v => v? undefined : '不能为空' });
          if (!langId) break;
          const folder = await vscode.window.showInputBox({ prompt: '输入模板文件夹（可新建）', value: 'default', validateInput: v => v? undefined : '不能为空' });
          if (!folder) break;
          const name = await vscode.window.showInputBox({ prompt: '输入模板名称', validateInput: v => v? undefined : '不能为空' });
          if (!name) break;
          const ext = await vscode.window.showInputBox({ prompt: '输入扩展名（不含点）', value: 'txt', validateInput: v => v? undefined : '不能为空' });
          if (!ext) break;
          const dir = path.join(root, langId, folder);
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${name}.json`);
          const payload = { name, extension: ext.replace(/^\./,''), content: String(msg.content || '') };
          try { fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8'); } catch {}
          vscode.window.showInformationMessage(`已创建模板：${name}.${ext}`);
          postIndex();
          break; }
        default:
          break;
      }
    });
  }

  private static getTemplatesRoot(): string | undefined {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return undefined;
    const root = path.join(workspace.uri.fsPath, '.file-templates');
    if (!fs.existsSync(root)) { try { fs.mkdirSync(root, { recursive: true }); } catch {} }
    return root;
  }

  private static indexAll(root: string): SnippetItem[] {
    const items: SnippetItem[] = [];
    if (!root || !fs.existsSync(root)) return items;

    // 语言子目录结构：.file-templates/<lang>/<folder>/*.json
    const entries = fs.readdirSync(root);
    for (const entry of entries) {
      const p = path.join(root, entry);
      if (fs.statSync(p).isDirectory()) {
        const langId = entry;
        let folders: string[] = [];
        try { folders = fs.readdirSync(p).filter(d => fs.statSync(path.join(p, d)).isDirectory()); } catch {}
        for (const folder of folders) {
          const folderPath = path.join(p, folder);
          let files: string[] = [];
          try { files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json')); } catch {}
          for (const f of files) {
            const filePath = path.join(folderPath, f);
            try {
              const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              if (obj && obj.name && obj.extension && typeof obj.content === 'string') {
                items.push({ id: `${langId}/${folder}/${f}`, language: langId, folder, name: String(obj.name), extension: String(obj.extension), content: String(obj.content), type: 'file', filePath });
              }
            } catch {}
          }
        }
      }
    }

    // 聚合文件：.file-templates/<language>.json
    for (const entry of entries) {
      const p = path.join(root, entry);
      if (!fs.statSync(p).isDirectory() && entry.endsWith('.json')) {
        const langId = path.basename(entry, '.json');
        try {
          const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(obj?.templates)) {
            obj.templates.forEach((t: any, idx: number) => {
              if (t && t.name && t.extension && typeof t.content === 'string') {
                items.push({ id: `${langId}#${idx}`, language: langId, folder: 'aggregated', name: String(t.name), extension: String(t.extension), content: String(t.content), type: 'aggregate', filePath: p, index: idx });
              }
            });
          }
        } catch {}
      }
    }

    return items;
  }

  private static isSafeTemplateJsonPath(root: string, filePath: string): boolean {
    if (!root || !filePath) return false;
    try {
      const rootResolved = path.resolve(root);
      const fileResolved = path.resolve(filePath);
      const rel = path.relative(rootResolved, fileResolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
      if (!fileResolved.toLowerCase().endsWith('.json')) return false;
      return true;
    } catch {
      return false;
    }
  }

  private static getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  private static getHtml(webview: vscode.Webview) {
    const nonce = this.getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="${csp}">
      <title>模板总览管理面板</title>
      <style>
        :root {
          --bg: var(--vscode-editor-background);
          --fg: var(--vscode-editor-foreground);
          --muted: var(--vscode-descriptionForeground);
          --panel-bg: var(--vscode-editorWidget-background);
          --panel-fg: var(--vscode-editorWidget-foreground);
          --input-bg: var(--vscode-input-background);
          --input-fg: var(--vscode-input-foreground);
          --button-bg: var(--vscode-button-background);
          --button-fg: var(--vscode-button-foreground);
          --button-hover: var(--vscode-button-hoverBackground);
          --border: var(--vscode-panel-border, #00000022);
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body { margin:0; background: var(--bg); color: var(--fg); font: 13px/1.5 var(--vscode-editor-font-family, system-ui, sans-serif); }
        .bar { display:flex; align-items:center; gap:8px; padding:8px; border-bottom: 1px solid var(--border); background: var(--panel-bg); color: var(--panel-fg); }
        .bar .spacer { flex:1; }
        .bar button { background: var(--button-bg); color: var(--button-fg); border: none; padding:4px 10px; border-radius:4px; cursor: pointer; }
        .bar button:hover { background: var(--button-hover); }
        .list { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
        .card { background: var(--panel-bg); color: var(--panel-fg); border: 1px solid var(--border); border-radius: 6px; }
        .card-head { display:flex; align-items:center; justify-content: space-between; padding:10px 12px; border-bottom: 1px solid var(--border); }
        .card-title { font-weight: 600; }
        .card-meta { font-size: 12px; color: var(--muted); padding:0 12px 8px; }
        .actions { display:flex; align-items:center; gap: 6px; }
        .icon-btn { background: transparent; color: var(--panel-fg); border: none; cursor: pointer; padding: 2px 4px; border-radius:4px; }
        .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, #00000022); }
        .content-view { padding: 12px; }
        pre { margin:0; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); }
        textarea.editor { width:100%; min-height: 140px; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--border); border-radius:4px; padding:8px; }
        .row { display:flex; gap:8px; padding:12px; }
        .row .field { display:flex; flex-direction: column; gap:4px; flex:1; }
        .row label { font-size: 12px; color: var(--muted); }
        .row input { width:100%; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--border); border-radius:4px; padding:6px 8px; }
        .badge { font-size: 12px; opacity:.75; }
      </style>
    </head>
    <body>
      <div class="bar">
        <button id="add">Add Snippet</button>
        <button id="refresh">刷新</button>
        <span class="spacer"></span>
        <span class="badge">管理 .file-templates 下所有模板</span>
      </div>
      <div class="list" id="list"></div>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = { items: [] };
        const $ = sel => document.querySelector(sel);

        function escapeHtml(s) { return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
        function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

        function render() {
          const root = $('#list');
          root.innerHTML = '';
          state.items.forEach((t, idx) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = \`
              <div class="card-head">
                <div>
                  <div class="card-title">\${escapeHtml(t.name || '(未命名模板)')}</div>
                  <div class="badge">\${escapeHtml(t.language)} / \${escapeHtml(t.folder)}</div>
                </div>
                <div class="actions">
                  <button class="icon-btn" data-act="edit" title="编辑">✎</button>
                  <button class="icon-btn" data-act="dup" title="复制">⎘</button>
                  <button class="icon-btn" data-act="save" title="保存">💾</button>
                  <button class="icon-btn" data-act="del" title="删除">✖</button>
                  <button class="icon-btn" data-act="open" title="打开文件">📂</button>
                </div>
              </div>
              <div class="card-meta">.\${escapeHtml(t.extension||'txt')}</div>
              <div class="content-view">
                <pre class="code" style="display:block">\${escapeHtml(t.content)}</pre>
                <textarea class="editor" style="display:none"></textarea>
              </div>
              <div class="row">
                <div class="field"><label>名称</label><input class="name" value="\${escapeAttr(t.name)}"></div>
                <div class="field" style="max-width:160px"><label>扩展名</label><input class="ext" value="\${escapeAttr(t.extension)}"></div>
              </div>
            \`;

            const $code = card.querySelector('pre.code');
            const $editor = card.querySelector('textarea.editor');
            const $name = card.querySelector('input.name');
            const $ext = card.querySelector('input.ext');
            $editor.value = t.content;

            card.querySelector('[data-act="edit"]').addEventListener('click', () => {
              const isEdit = $editor.style.display !== 'none';
              if (isEdit) {
                t.content = $editor.value;
                $code.textContent = t.content;
                $editor.style.display = 'none';
                $code.style.display = 'block';
              } else {
                $editor.value = t.content;
                $code.style.display = 'none';
                $editor.style.display = 'block';
                $editor.focus();
              }
            });
            card.querySelector('[data-act="dup"]').addEventListener('click', () => {
              vscode.postMessage({ type: 'duplicateSnippet', item: t });
            });
            card.querySelector('[data-act="save"]').addEventListener('click', () => {
              t.name = $name.value; t.extension = $ext.value.replace(/^\\./,'');
              vscode.postMessage({ type: 'saveSnippet', item: t });
            });
            card.querySelector('[data-act="del"]').addEventListener('click', () => {
              vscode.postMessage({ type: 'deleteSnippet', item: t });
            });
            card.querySelector('[data-act="open"]').addEventListener('click', () => {
              vscode.postMessage({ type: 'openFile', filePath: t.filePath });
            });
            $name.addEventListener('input', () => t.name = $name.value);
            $ext.addEventListener('input', () => t.extension = $ext.value.replace(/^\\./,'') );
            root.appendChild(card);
          });
        }

        $('#add').addEventListener('click', () => {
          vscode.postMessage({ type: 'createSnippet', content: '' });
        });
        $('#refresh').addEventListener('click', () => { vscode.postMessage({ type: 'refresh' }); });

        window.addEventListener('message', ev => {
          const msg = ev.data;
          if (msg.type === 'init') {
            state.items = msg.items || [];
            render();
          }
        });
      </script>
    </body>
    </html>`;
  }
}