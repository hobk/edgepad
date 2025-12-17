export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const edgeKV = new EdgeKV({ namespace: 'note' });

      // =========================================================
      // 1. API: 保存
      // =========================================================
      if (path === '/api/save' && method === 'POST') {
        try {
          const data = await request.json();
          let content = data.content;
          // 防止空内容报错
          if (!content || content.trim() === '' || content === '<br>') { content = ' '; }
          // 检查大小 (1.8MB)
          if (new TextEncoder().encode(content).length > 1900000) {
             return jsonResponse({ error: '数据过大 (超过限制)，请删除部分图片' }, 413);
          }
          await edgeKV.put(data.id, content);
          return jsonResponse({ success: true }, 200);
        } catch (e) { return jsonResponse({ error: e.message }, 500); }
      }

      // =========================================================
      // 2. 首页自动跳
      // =========================================================
      if (path === '/' || path === '/index.html') {
        const newId = generateSmartId();
        return new Response(null, { status: 302, headers: { 'Location': `${url.origin}/${newId}` } });
      }

      // =========================================================
      // 3. 笔记页渲染
      // =========================================================
      let noteId = path.substring(1);
      if(!noteId || noteId.includes('.') || noteId === "favicon.ico") return new Response("404", { status: 404 });
      try { noteId = decodeURIComponent(noteId); } catch (e) {}

      let content = await edgeKV.get(noteId, { type: "text" });
      if (!content) content = ""; 

      return new Response(htmlPage(noteId, content), {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=UTF-8','Cache-Control': 'no-store' }
      });

    } catch (error) { return new Response(`Error: ${error.message}`, { status: 500 }); }
  }
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function generateSmartId() {
  const chars = 'abcdefhijkmnpqrstuvwxyz23456789';
  let length = Math.random() < 0.5 ? 3 : (Math.random() < 0.8 ? 4 : 5);
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// --- 新版UI HTML/JS ---
function htmlPage(noteId, content) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EdgePad - ${noteId}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    /* --- 1. 配色变量 (参考 UI) --- */
    :root {
      --bg-color: #1e1e1e;       /* 整体深色背景 */
      --header-bg: #252526;      /* 头部稍浅的背景 */
      --text-primary: #cccccc;   /* 主要文字颜色 */
      --text-muted: #888888;     /* 次要文字颜色 */
      --accent-blue: #007acc;    /* 蓝色强调色 (徽章、链接) */
      --warning-bg: #333300;     /* 警告框背景 (深黄) */
      --warning-text: #ffcc00;   /* 警告框文字 (亮黄) */
      --success-green: #4caf50;  /* 状态点 (绿) */
      --danger-red: #f44336;     /* 状态点 (红) */
    }

    body {
      margin: 0;
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
      background: var(--bg-color);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* --- 2. 头部样式重构 --- */
    header {
      background: var(--header-bg);
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #333;
    }

    .header-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-right: 20px;
    }

    /* 标题行 */
    .title-row {
      font-size: 1.1rem;
      font-weight: bold;
      color: #fff;
      display: flex;
      align-items: center;
    }
    .badge {
      background: var(--accent-blue);
      color: white;
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 8px;
      font-weight: normal;
    }

    /* URL 行 */
    .url-row {
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    .link-btn {
      color: var(--accent-blue);
      cursor: pointer;
      margin-left: 5px;
      text-decoration: none;
    }
    .link-btn:hover { text-decoration: underline; }

    /* 警告框 */
    .warning-box {
      background: var(--warning-bg);
      color: var(--warning-text);
      font-size: 0.85rem;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #555500;
    }

    /* 状态行 */
    .status-row {
      font-size: 0.85rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      margin-top: 5px;
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      margin-right: 8px;
      box-shadow: 0 0 5px rgba(0,0,0,0.2);
    }
    /* 状态颜色修饰符 */
    .status-dot.ready { background: var(--success-green); box-shadow: 0 0 5px var(--success-green); }
    .status-dot.saving { background: var(--warning-text); box-shadow: 0 0 5px var(--warning-text);}
    .status-dot.error { background: var(--danger-red); box-shadow: 0 0 5px var(--danger-red); }

    /* 右侧二维码容器 */
    .header-right {
      background: #fff;
      padding: 5px;
      border-radius: 4px;
    }

    /* --- 3. 编辑器样式重构 --- */
    #editor-container {
      flex: 1;
      position: relative;
      overflow-y: auto;
      /* 移除之前的内边距，让编辑器贴边 */
    }

    #editor {
      width: 100%;
      min-height: 100%;
      /* 背景色与整体背景一致，实现无缝感 */
      background: var(--bg-color);
      color: var(--text-primary);
      padding: 20px;
      box-sizing: border-box;
      outline: none;
      line-height: 1.6;
      font-size: 16px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Consolas', 'Courier New', monospace; /* 使用等宽字体更有极客感 */
    }

    /* 编辑器里的图片 */
    #editor img {
      max-width: 100%;
      border: 1px solid #444;
      margin: 10px 0;
      display: block;
    }

    /* Placeholder 样式调整 */
    #editor:empty:before {
      content: attr(data-placeholder);
      color: #555; /* 更深色的 placeholder */
      pointer-events: none;
      display: block;
    }
    
    /* 滚动条样式优化 */
    ::-webkit-scrollbar { width: 10px; background: var(--bg-color); }
    ::-webkit-scrollbar-thumb { background: #444; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }

    /* Loading */
    #loading-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:none; flex-direction:column; justify-content:center; align-items:center; z-index:99; color: white; }
  </style>
</head>
<body>

  <header>
    <div class="header-left">
      <div class="title-row">
        EdgePad <span class="badge">边缘快捷便签</span> <sapn style="font-size:10px;color:#999;margin-left:8px;">基于阿里云ESA，数秒内同步至全球边缘节点。</span>
      </div>
      
      <div class="url-row">
        当前房间ID: <span style="color: #fff;">${noteId}</span>
        <span class="link-btn" onclick="copyLink()">[复制完整链接]</span>
      </div>

      <div class="warning-box">
        ⚠️ <strong>隐私警告：</strong> 公开链接，请勿输入密码、密钥或个人敏感信息。
      </div>

      <div id="status-bar" class="status-row">
        <div id="status-dot" class="status-dot ready"></div>
        <span id="status-text">准备就绪</span>
      </div>
    </div>

    <div class="header-right">
      <div id="qrcode"></div>
    </div>
  </header>

  <div id="editor-container">
    <div id="editor" contenteditable="true" spellcheck="false" 
         data-placeholder="在此开始输入或者粘贴图片到此，内容将自动保存...">${content}</div>
  </div>

  <div id="loading-overlay">
    <div style="margin-bottom:10px;">正在处理...</div>
  </div>

  <script>
    const noteId = "${noteId}";
    const editor = document.getElementById('editor');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const loadingOverlay = document.getElementById('loading-overlay');
    let timeoutId = null;

    // 1. 二维码 (调整大小以适应 UI)
    new QRCode(document.getElementById("qrcode"), { text: window.location.href, width: 90, height: 90 });

    // 2. 复制链接 (兼容 HTTP)
    function copyLink() {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => alert('链接已复制！')).catch(() => fallbackCopy(url));
      } else { fallbackCopy(url); }
    }
    function fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position="fixed"; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? alert('链接已复制！') : prompt('请手动复制:', text); } catch (e) { prompt('请手动复制:', text); }
      document.body.removeChild(ta);
    }

    // 3. 自动保存
    function triggerSave() {
      statusDot.className = 'status-dot saving';
      statusText.innerText = '正在输入...';
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(saveContent, 1000); 
    }
    editor.addEventListener('input', triggerSave);

    async function saveContent() {
      statusText.innerText = '正在同步...';
      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: noteId, content: editor.innerHTML })
        });
        if (res.ok) {
          statusDot.className = 'status-dot ready';
          statusText.innerText = '已保存 (同步至边缘节点)';
        } else { throw new Error((await res.json()).error); }
      } catch (e) {
        statusDot.className = 'status-dot error';
        statusText.innerText = '保存失败';
        alert('❌ 保存失败：' + e.message);
      }
    }

    // 4. 图片粘贴处理 (保持原有逻辑)
    editor.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault(); 
          loadingOverlay.style.display = 'flex';
          try {
            const base64 = await compressImage(item.getAsFile());
            document.execCommand('insertHTML', false, '<img src="' + base64 + '"><br>');
            triggerSave();
          } catch(err) { alert('图片处理失败: ' + err.message); } 
          finally { loadingOverlay.style.display = 'none'; }
        }
      }
    });

    function compressImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image(); img.src = e.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height; const MAX_W = 800; 
            if (w > MAX_W) { h *= MAX_W / w; w = MAX_W; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const data = canvas.toDataURL('image/jpeg', 0.6);
            data.length > 1900000 ? reject(new Error("图片过大")) : resolve(data);
          };
        };
      });
    }
  </script>
</body>
</html>
  `;
}
