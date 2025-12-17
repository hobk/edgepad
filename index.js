export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const edgeKV = new EdgeKV({ namespace: 'ns' });

      // =========================================================
      // 1. API: 保存
      // =========================================================
      if (path === '/api/save' && method === 'POST') {
        try {
          const data = await request.json();
          let content = data.content;

          // 【修复 Bug 2】EdgeKV 不允许存空值。
          // 如果内容为空，强制存一个空格，防止报错
          if (!content || content.trim() === '' || content === '<br>') {
            content = ' '; 
          }

          // 检查大小 (1.8MB 限制)
          const payloadSize = new TextEncoder().encode(content).length;
          if (payloadSize > 1900000) {
             return jsonResponse({ error: '数据过大 (超过限制)，请删除部分图片' }, 413);
          }

          await edgeKV.put(data.id, content);
          return jsonResponse({ success: true }, 200);
        } catch (e) {
          // 返回更详细的错误信息供前端调试
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // =========================================================
      // 2. 首页自动跳
      // =========================================================
      if (path === '/' || path === '/index.html') {
        const newId = generateSmartId();
        return new Response(null, { 
          status: 302, 
          headers: { 'Location': `${url.origin}/${newId}` } 
        });
      }

      // =========================================================
      // 3. 笔记页渲染
      // =========================================================
      let noteId = path.substring(1);
      if(!noteId || noteId.includes('.') || noteId === "favicon.ico") {
         return new Response("404 Not Found", { status: 404 });
      }
      try { noteId = decodeURIComponent(noteId); } catch (e) {}

      let content = await edgeKV.get(noteId, { type: "text" });
      if (!content) content = ""; 

      return new Response(htmlPage(noteId, content), {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });

    } catch (error) {
      return new Response(`System Error: ${error.message}`, { status: 500 });
    }
  }
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function generateSmartId() {
  const chars = 'abcdefhijkmnpqrstuvwxyz23456789';
  const rand = Math.random();
  let length = rand < 0.5 ? 3 : (rand < 0.8 ? 4 : 5);
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// --- 前端 HTML/JS ---
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
    :root { --bg: #f4f6f8; --paper: #ffffff; --text: #333; --accent: #2563eb; --danger: #dc2626; --success: #16a34a; --header-bg: #1e293b; --header-text: #f8fafc; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    /* 顶部导航栏 */
    header { background: var(--header-bg); color: var(--header-text); padding: 12px 20px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 10; }
    .top-row { display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .brand span { font-size: 0.8rem; font-weight: 400; opacity: 0.8; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; }
    .desc { font-size: 0.85rem; color: #cbd5e1; line-height: 1.4; max-width: 800px;}
    .actions { display: flex; gap: 10px; align-items: center; }
    .btn { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 0.85rem; transition: all 0.2s; }
    .btn:hover { background: rgba(255,255,255,0.2); }
    
    .qr-popover { position: absolute; top: 60px; right: 20px; background: white; padding: 10px; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); display: none; }
    .qr-popover.show { display: block; }

    #status-bar { font-size: 0.8rem; padding: 4px 0; display: flex; align-items: center; gap: 6px; min-height: 20px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #64748b; }
    .dot.saving { background: #eab308; box-shadow: 0 0 5px #eab308; }
    .dot.success { background: var(--success); box-shadow: 0 0 5px var(--success); }
    .dot.error { background: var(--danger); box-shadow: 0 0 5px var(--danger); }

    /* 编辑器 */
    #editor-container { flex: 1; padding: 20px; overflow-y: auto; display: flex; justify-content: center; }
    #editor { width: 100%; max-width: 800px; background: var(--paper); min-height: 100%; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); outline: none; line-height: 1.6; font-size: 16px; white-space: pre-wrap; word-wrap: break-word; }
    #editor img { max-width: 100%; border-radius: 4px; margin: 10px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: block; }
    #editor:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; display: block; }

    /* Loading 遮罩 */
    #loading-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:none; flex-direction:column; justify-content:center; align-items:center; z-index:99; color: white; }
    .spinner { border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid white; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin-bottom: 10px;}
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <header>
    <div class="top-row">
      <div class="brand">EdgePad <span>Global Sync</span></div>
      <div class="actions">
        <button class="btn" onclick="document.getElementById('fileInput').click()">📷 插图</button>
        <button class="btn" onclick="toggleQR()">📱 二维码</button>
        <button class="btn" onclick="copyLink()">🔗 复制链接</button>
        <input type="file" id="fileInput" accept="image/*" style="display:none" onchange="handleFileSelect(this)">
      </div>
    </div>
    <div class="desc">
      基于边缘计算的在线即时笔记，自动同步至全球边缘节点。
      <span style="color: #fbbf24; margin-left:5px;">⚠️ 公开链接，勿存隐私。图片会自动压缩。</span>
    </div>
    <div id="status-bar">
      <div id="dot" class="dot"></div>
      <span id="status-text">准备就绪</span>
    </div>
    
    <div id="qr-popover" class="qr-popover">
      <div id="qrcode"></div>
    </div>
  </header>

  <div id="editor-container" onclick="document.getElementById('editor').focus()">
    <div id="editor" contenteditable="true" spellcheck="false" 
         data-placeholder="在此输入文字，或直接粘贴(Ctrl+V)截图...">${content}</div>
  </div>

  <div id="loading-overlay">
    <div class="spinner"></div>
    <div id="loading-text">正在处理图片...</div>
  </div>

  <script>
    const noteId = "${noteId}";
    const editor = document.getElementById('editor');
    const statusText = document.getElementById('status-text');
    const dot = document.getElementById('dot');
    const loadingOverlay = document.getElementById('loading-overlay');
    let timeoutId = null;

    // --- 1. 二维码 & 复制 ---
    new QRCode(document.getElementById("qrcode"), { text: window.location.href, width: 128, height: 128 });
    function toggleQR() { document.getElementById('qr-popover').classList.toggle('show'); }
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        alert('链接已复制！');
      }).catch(err => prompt('复制失败:', window.location.href));
    }

    // --- 2. 【核心修复】独立的 TriggerSave 函数 ---
    function triggerSave() {
      // UI 状态变更
      dot.className = 'dot saving';
      statusText.innerText = '正在输入...';
      statusText.style.color = '#eab308';
      
      // 防抖
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(saveContent, 1000); 
    }

    // 绑定输入事件
    editor.addEventListener('input', triggerSave);

    // --- 3. 保存逻辑 ---
    async function saveContent() {
      statusText.innerText = '正在提交...';
      const contentHtml = editor.innerHTML; 

      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: noteId, content: contentHtml })
        });

        if (res.ok) {
          dot.className = 'dot success';
          statusText.innerText = '已保存，正在分发至全球节点 (约5秒生效)';
          statusText.style.color = 'var(--success)';
        } else {
          const data = await res.json();
          throw new Error(data.error || '未知错误');
        }
      } catch (e) {
        dot.className = 'dot error';
        statusText.innerText = '保存失败';
        statusText.style.color = 'var(--danger)';
        alert('❌ 保存失败！\\n\\n原因：' + e.message);
      }
    }

    // --- 4. 图片处理逻辑 ---

    // 粘贴拦截
    editor.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault(); 
          const file = item.getAsFile();
          await processAndInsertImage(file);
        }
      }
    });

    // 按钮上传处理
    async function handleFileSelect(input) {
      if (input.files && input.files[0]) {
        await processAndInsertImage(input.files[0]);
        input.value = ''; // 重置 input 允许重复上传同一文件
      }
    }

    // 统一处理函数
    async function processAndInsertImage(file) {
      showLoading("正在压缩图片 (限宽800px)...");
      try {
        const base64 = await compressImage(file);
        insertImageAtCursor(base64);
        triggerSave(); // 【修复 Bug 1】现在 triggerSave 已经定义了，可以正常调用
      } catch(err) {
        alert('图片处理失败: ' + err.message);
      } finally {
        hideLoading();
      }
    }

    function compressImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            const MAX_W = 800; 
            if (w > MAX_W) { h *= MAX_W / w; w = MAX_W; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            // 质量 0.6
            const data = canvas.toDataURL('image/jpeg', 0.6);
            if (data.length > 1800000) {
               reject(new Error("压缩后图片仍然过大 (超过 1.8MB)，无法保存。"));
            } else {
               resolve(data);
            }
          };
          img.onerror = () => reject(new Error("图片加载失败"));
        };
      });
    }

    function insertImageAtCursor(base64) {
      const img = document.createElement('img');
      img.src = base64;
      editor.appendChild(img); // 简单追加到末尾，或者使用 Range API 插入光标处
      
      // 如果需要更精确的光标插入 (可选，增加代码复杂度但体验更好)
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && sel.getRangeAt(0).commonAncestorContainer.parentNode === editor) {
         const range = sel.getRangeAt(0);
         range.deleteContents();
         range.insertNode(img);
      }
      
      // 插入换行
      document.execCommand('insertHTML', false, '<br>');
    }

    function showLoading(msg) {
      document.getElementById('loading-text').innerText = msg;
      loadingOverlay.style.display = 'flex';
    }
    function hideLoading() {
      loadingOverlay.style.display = 'none';
    }
  </script>
</body>
</html>
  `;
}
