import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class TemplatesJsonEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TemplatesJsonEditorProvider(context);
    return vscode.window.registerCustomEditorProvider('fileTemplates.jsonEditor', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    });
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, document);

    const updateWebview = () => {
      const text = document.getText();
      webviewPanel.webview.postMessage({ type: 'load', content: text, filePath: document.uri.fsPath });
    };

    // initial
    updateWebview();

    const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });
    webviewPanel.onDidDispose(() => changeSub.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'save': {
          const content = String(msg.content || '');
          try {
            const obj = JSON.parse(content);
            await this.updateTextDocument(document, JSON.stringify(obj, null, 2));
            vscode.window.showInformationMessage('模板JSON已保存');
          } catch {
            vscode.window.showErrorMessage('保存失败：JSON格式错误');
          }
          break; }
        case 'addTemplate': {
          const workspace = vscode.workspace.getWorkspaceFolder(document.uri) || vscode.workspace.workspaceFolders?.[0];
          if (!workspace) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            break;
          }
          const langId = await vscode.window.showInputBox({ prompt: '输入语言ID（如: csharp, js, ts, java, py...）', validateInput: v => v ? undefined : '不能为空' });
          if (!langId) break;
          const folderName = await vscode.window.showInputBox({ prompt: '输入模板文件夹（可新建）', value: 'default', validateInput: v => v ? undefined : '不能为空' });
          if (!folderName) break;
          const tmplName = await vscode.window.showInputBox({ prompt: '输入模板名称', validateInput: v => v ? undefined : '不能为空' });
          if (!tmplName) break;
          const ext = await vscode.window.showInputBox({ prompt: '输入扩展名（不含点）', value: 'txt', validateInput: v => v ? undefined : '不能为空' });
          if (!ext) break;
          // try get content from current document
          let contentStr = '';
          try {
            const current = JSON.parse(document.getText());
            if (typeof current?.content === 'string') contentStr = current.content;
          } catch {}
          const root = path.join(workspace.uri.fsPath, '.file-templates');
          const targetDir = path.join(root, langId, folderName);
          fs.mkdirSync(targetDir, { recursive: true });
          const targetFile = path.join(targetDir, `${tmplName}.json`);
          const payload = { name: tmplName, extension: ext, content: contentStr };
          fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');
          vscode.window.showInformationMessage(`已创建模板：${tmplName}.${ext}`);
          try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFile));
            await vscode.window.showTextDocument(doc, { preview: false });
          } catch {}
          break; }
        default:
          break;
      }
    });
  }

  private async updateTextDocument(document: vscode.TextDocument, value: string) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
    edit.replace(document.uri, fullRange, value);
    await vscode.workspace.applyEdit(edit);
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  private escapeHtml(s: string): string {
    return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch] || ch);
  }

  private getHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    const initial = document.getText();
    const nonce = this.getNonce();
    const safePath = this.escapeHtml(document.uri.fsPath);
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
      <title>模板内容面板</title>
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
          --focus: var(--vscode-focusBorder, #4FC3F7);
          --selection: var(--vscode-editor-selectionBackground, #4FC3F788);
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body { margin:0; background: var(--bg); color: var(--fg); font: 13px/1.5 var(--vscode-editor-font-family, system-ui, sans-serif); }
        .bar { display:flex; align-items:center; gap:8px; padding:8px; border-bottom: 1px solid var(--border); background: var(--panel-bg); color: var(--panel-fg); }
        .bar .spacer { flex:1; }
        .bar button { background: var(--button-bg); color: var(--button-fg); border: none; padding:4px 10px; border-radius:4px; cursor: pointer; }
        .bar button:hover { background: var(--button-hover); }
        .path { opacity: .7; font-size: 12px; }
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
      </style>
    </head>
    <body>
      <div class="bar">
        <button id="saveAll">保存全部</button>
        <button id="addSnippet">Add Snippet</button>
        <span class="spacer"></span>
        <span class="path">${safePath}</span>
      </div>
      <div class="list" id="list"></div>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = { type: 'unknown', language: '', templates: [] };
        const $ = sel => document.querySelector(sel);

        function parseContent(jsonStr) {
          try {
            const obj = JSON.parse(jsonStr);
            if (Array.isArray(obj?.templates)) {
              state.type = 'aggregated';
              state.language = String(obj.language || '');
              state.templates = obj.templates.map(t => ({ name: String(t.name||''), extension: String(t.extension||''), content: String(t.content||'') }));
            } else if (obj && typeof obj === 'object' && typeof obj.content === 'string') {
              state.type = 'single';
              state.language = '';
              state.templates = [{ name: String(obj.name||''), extension: String(obj.extension||''), content: String(obj.content||'') }];
            } else {
              state.type = 'unknown';
              state.language = '';
              state.templates = [];
            }
          } catch (e) {
            state.type = 'error';
            state.templates = [];
          }
        }

        function render() {
          const root = $('#list');
          root.innerHTML = '';
          state.templates.forEach((t, idx) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = \`
              <div class="card-head">
                <div>
                  <div class="card-title">\${escapeHtml(t.name || '(未命名模板)')}</div>
                </div>
                <div class="actions">
                  <button class="icon-btn" data-act="edit" title="编辑">✎</button>
                  <button class="icon-btn" data-act="dup" title="复制">⎘</button>
                  <button class="icon-btn" data-act="del" title="删除">✖</button>
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
                // 保存编辑
                t.content = $editor.value;
                $code.textContent = t.content;
                $editor.style.display = 'none';
                $code.style.display = 'block';
              } else {
                // 进入编辑
                $editor.value = t.content;
                $code.style.display = 'none';
                $editor.style.display = 'block';
                $editor.focus();
              }
            });
            card.querySelector('[data-act="dup"]').addEventListener('click', () => {
              state.templates.splice(idx+1, 0, { name: t.name + ' Copy', extension: t.extension, content: t.content });
              render();
            });
            card.querySelector('[data-act="del"]').addEventListener('click', () => {
              state.templates.splice(idx, 1);
              render();
            });
            $name.addEventListener('input', () => t.name = $name.value);
            $ext.addEventListener('input', () => t.extension = $ext.value.replace(/^\\./,'') );
            root.appendChild(card);
          });
        }

        function escapeHtml(s) { return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
        function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

        function serialize() {
          if (state.type === 'aggregated') {
            return JSON.stringify({ language: state.language || '', templates: state.templates }, null, 2);
          } else if (state.type === 'single') {
            return JSON.stringify(state.templates[0] || { name:'', extension:'txt', content:'' }, null, 2);
          } else {
            // 默认按聚合保存
            return JSON.stringify({ language: state.language || '', templates: state.templates }, null, 2);
          }
        }

        $('#saveAll').addEventListener('click', () => {
          vscode.postMessage({ type: 'save', content: serialize() });
        });
        $('#addSnippet').addEventListener('click', () => {
          // 在聚合文件中直接新增一个空模板；单文件情况下沿用原来的新建到文件夹逻辑
          if (state.type === 'aggregated') {
            state.templates.push({ name: 'New Snippet', extension: 'txt', content: '' });
            render();
          } else {
            vscode.postMessage({ type: 'addTemplate', content: state.templates[0]?.content || '' });
          }
        });

        window.addEventListener('message', ev => {
          const msg = ev.data;
          if (msg.type === 'load') {
            parseContent(msg.content);
            render();
          }
        });

        // 初始化
        parseContent(${JSON.stringify(initial)});
        render();
      </script>
    </body>
    </html>`;
  }
}