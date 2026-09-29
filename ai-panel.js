// ============================================
// AI 制作面板
// ============================================

var AIPanel = (function() {

  var _overlay = null;
  var _messages = [];
  var _isStreaming = false;
  var _abortController = null;
  var _fileOps = []; // { type: 'create'|'edit'|'delete', path, content, original?, accepted: bool }
  var _currentFileContext = ''; // currently open file path

  // 提示词缓存（从文件加载）
  var _promptCache = {};

  // ============================================
  // 公共 API
  // ============================================

  function open() {
    if (_overlay) { _overlay.style.display = 'flex'; return; }
    createPanel();
    loadHistory();
  }

  function close() {
    if (_overlay) { _overlay.style.display = 'none'; }
    if (window.electronAPI && window.electronAPI.ai) {
      window.electronAPI.ai.removeListeners();
    }
  }

  function setFileContext(filePath) {
    _currentFileContext = filePath || '';
    var ctxEl = document.getElementById('ai-context-file');
    if (ctxEl) {
      ctxEl.textContent = _currentFileContext ? '当前文件: ' + _currentFileContext.split(/[\\/]/).pop() : '无上下文文件';
    }
  }

  // ============================================
  // 创建面板
  // ============================================

  function createPanel() {
    _overlay = document.createElement('div');
    _overlay.id = 'ai-panel-overlay';
    _overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';

    _overlay.innerHTML = '\
<div id="ai-panel" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:12px;width:92%;max-width:860px;height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.5);overflow:hidden;">\
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-border);flex-shrink:0;">\
    <div style="display:flex;align-items:center;gap:10px;">\
      <span style="font-size:16px;font-weight:700;background:linear-gradient(135deg,#00c8ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">AI 制作</span>\
      <span id="ai-status" style="font-size:11px;color:var(--color-text-tertiary);"></span>\
    </div>\
    <div style="display:flex;align-items:center;gap:6px;">\
      <button id="ai-btn-settings" title="设置" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:15px;padding:4px 8px;border-radius:4px;">⚙️</button>\
      <button id="ai-btn-clear" title="清除对话" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:15px;padding:4px 8px;border-radius:4px;">🗑️</button>\
      <button id="ai-btn-close" title="关闭" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:4px;">✕</button>\
    </div>\
  </div>\
  <div id="ai-context-bar" style="display:flex;align-items:center;padding:6px 16px;border-bottom:1px solid var(--color-border);background:var(--color-bg-tertiary);flex-shrink:0;font-size:11px;color:var(--color-text-tertiary);gap:12px;">\
    <span id="ai-context-file">无上下文文件</span>\
    <span id="ai-token-count" style="margin-left:auto;"></span>\
  </div>\
  <div id="ai-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:0;"></div>\
  <div id="ai-file-ops" style="flex-shrink:0;max-height:200px;overflow-y:auto;border-top:1px solid var(--color-border);padding:8px 16px;display:none;"></div>\
  <div style="flex-shrink:0;padding:12px 16px;border-top:1px solid var(--color-border);">\
    <div style="display:flex;gap:8px;align-items:flex-end;">\
      <textarea id="ai-input" placeholder="输入你的需求... (Enter 发送, Shift+Enter 换行)" style="flex:1;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-tertiary);color:var(--color-text-primary);font-size:13px;resize:none;min-height:40px;max-height:120px;font-family:inherit;outline:none;" rows="2"></textarea>\
      <button id="ai-btn-send" style="padding:10px 20px;background:linear-gradient(135deg,#00c8ff,#7c3aed);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">发送</button>\
      <button id="ai-btn-stop" style="padding:10px 16px;background:var(--color-error);border:none;border-radius:8px;color:#fff;font-size:13px;cursor:pointer;display:none;white-space:nowrap;">停止</button>\
    </div>\
  </div>\
</div>';

    document.body.appendChild(_overlay);
    bindEvents();

    // 更新上下文文件信息
    setFileContext(_currentFileContext);

    // 从磁盘加载提示词
    loadPromptsFromDisk();

    // 恢复上次对话
    var saved = loadMessages();
    renderMessages(saved);
  }

  // ============================================
  // 事件绑定
  // ============================================

  function bindEvents() {
    document.getElementById('ai-btn-close').onclick = close;
    document.getElementById('ai-btn-clear').onclick = clearConversation;
    document.getElementById('ai-btn-settings').onclick = function() {
      if (window.electronAPI && window.electronAPI.openExternal) {
        // 打开设置窗口
        try {
          var settingsWin = window.open('settings.html' + (window.I18N && I18N.lang ? '?lang=' + encodeURIComponent(I18N.lang) : ''), '_blank');
        } catch(e) {}
      }
    };

    var input = document.getElementById('ai-input');
    var sendBtn = document.getElementById('ai-btn-send');
    var stopBtn = document.getElementById('ai-btn-stop');

    var _aiResizeTimer = null;
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      // 自适应高度
      clearTimeout(_aiResizeTimer);
      _aiResizeTimer = setTimeout(function() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      }, 0);
    });

    input.addEventListener('input', function() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    sendBtn.onclick = sendMessage;
    stopBtn.onclick = stopStreaming;

    // 点击外部关闭
    _overlay.addEventListener('click', function(e) {
      if (e.target === _overlay) close();
    });
  }

  // ============================================
  // 提示词加载
  // ============================================

  function loadPromptsFromDisk() {
    if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.loadPrompts) {
      window.electronAPI.ai.loadPrompts().then(function(result) {
        if (result.success) {
          _promptCache = result.prompts || {};
        }
      }).catch(function(err) {
        console.warn('[AI] 加载提示词失败:', err);
      });
    }
  }

  function resolvePrompt(aiConfig) {
    // 自定义提示词优先
    if (aiConfig.systemPrompt === 'custom' && aiConfig.customPrompt) {
      return aiConfig.customPrompt;
    }

    // 从缓存中查找
    var promptName = aiConfig.systemPrompt || 'default';
    var prompt = _promptCache[promptName];
    if (prompt && prompt.content) {
      return prompt.content;
    }

    // fallback: 极简默认提示词
    return '你是一个 Minecraft 插件开发助手。当需要创建、编辑或删除文件时，请使用以下格式标记文件操作：\n\n```file:create 相对路径/文件名\n文件内容\n```\n\n```file:edit 相对路径/文件名\n---ORIGINAL---\n需要替换的原始内容\n---UPDATED---\n替换后的新内容\n```\n\n```file:delete 相对路径/文件名\n```';
  }

  // ============================================
  // 发送消息
  // ============================================

  function getAIConfig() {
    try {
      var raw = localStorage.getItem('editorConfig');
      if (!raw) return null;
      var config = JSON.parse(raw);
      var ai = config.ai || {};
      var keys = ai.keys || [];
      if (keys.length === 0) return null;
      var model = ai.model || 'gpt-4o';
      if (model === 'custom') model = ai.customModel || 'gpt-4o';
      var endpoint = ai.endpoint || 'https://api.openai.com/v1/chat/completions';
      // 使用第一个密钥
      var apiKey = keys[0];

      // 获取系统提示词
      var systemPrompt = resolvePrompt(ai);

      // 添加上下文信息
      if (_currentFileContext) {
        systemPrompt += '\n\n当前用户正在编辑的文件: ' + _currentFileContext;
      }

      return {
        endpoint: endpoint,
        model: model,
        apiKey: apiKey,
        systemPrompt: systemPrompt,
        maxTokens: ai.maxTokens || 4096,
        temperature: ai.temperature !== undefined ? ai.temperature : 0.7,
      };
    } catch(e) { return null; }
  }

  function sendMessage() {
    if (_isStreaming) return;
    _isStreaming = true;
    var input = document.getElementById('ai-input');
    var text = input.value.trim();
    if (!text) { _isStreaming = false; return; }

    // 检查配置
    var config = getAIConfig();
    if (!config) {
      addSystemMessage('请先在设置中配置 API 密钥。');
      _isStreaming = false;
      return;
    }

    // 添加用户消息
    addUserMessage(text);
    input.value = '';
    input.style.height = 'auto';

    // 开始 AI 响应
    startAIResponse(config, text);
  }

  function startAIResponse(config, userText) {
    setStatus('思考中...');
    setSendingState(true);

    // 构建消息列表
    var messages = [];
    // 系统提示词
    messages.push({ role: 'system', content: config.systemPrompt });
    // 对话历史（取最近20条）
    var history = _messages.slice(-20);
    for (var i = 0; i < history.length; i++) {
      var m = history[i];
      // 跳过系统消息
      if (m.type === 'system') continue;
      messages.push({ role: m.role, content: m.content });
    }
    // 当前消息
    messages.push({ role: 'user', content: userText });

    // 创建 AI 消息占位
    var msgEl = addAIMessage('');

    // 设置监听
    if (window.electronAPI && window.electronAPI.ai) {
      window.electronAPI.ai.removeListeners();

      window.electronAPI.ai.onChunk(function(chunk) {
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) {
          var text = contentEl.textContent + chunk;
          contentEl.textContent = text;
          // 尝试解析文件操作
          parseFileOps(text, contentEl);
        }
        scrollToBottom();
      });

      window.electronAPI.ai.onDone(function(content) {
        _isStreaming = false;
        setStatus('就绪');
        setSendingState(false);
        // 保存到历史
        _messages.push({ role: 'assistant', content: content, id: Date.now() });
        saveMessages();
        // 最终解析文件操作
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) parseFileOps(content, contentEl);
        // 渲染文件操作
        renderFileOps();
        window.electronAPI.ai.removeListeners();
      });

      window.electronAPI.ai.onError(function(errMsg) {
        _isStreaming = false;
        setStatus('错误');
        setSendingState(false);
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) contentEl.textContent = '⚠️ ' + errMsg;
        window.electronAPI.ai.removeListeners();
      });

      // 发送请求
      window.electronAPI.ai.chat(config, messages).catch(function(err) {
        console.error('[AI] 请求失败:', err);
        _isStreaming = false;
        setStatus('错误');
        setSendingState(false);
        var contentEl = msgEl.querySelector('.ai-msg-content');
        if (contentEl) contentEl.textContent = '⚠️ 请求失败: ' + err.message;
        window.electronAPI.ai.removeListeners();
      });
    } else {
      msgEl.querySelector('.ai-msg-content').textContent = '⚠️ AI 功能不可用（electronAPI未加载）';
      _isStreaming = false;
      setStatus('错误');
      setSendingState(false);
    }
  }

  function stopStreaming() {
    _isStreaming = false;
    setStatus('已停止');
    setSendingState(false);
    if (window.electronAPI && window.electronAPI.ai) {
      window.electronAPI.ai.removeListeners();
    }
  }

  // ============================================
  // 文件操作解析
  // ============================================

  function parseFileOps(text, contentEl) {
    _fileOps = [];

    // 匹配 create 操作
    var createRegex = /```file:create\s+(\S+)\s*\n([\s\S]*?)```/g;
    var match;
    while ((match = createRegex.exec(text)) !== null) {
      _fileOps.push({ type: 'create', path: match[1].trim(), content: match[2].trim(), accepted: null });
    }

    // 匹配 edit 操作
    var editRegex = /```file:edit\s+(\S+)\s*\n---ORIGINAL---\s*\n([\s\S]*?)---UPDATED---\s*\n([\s\S]*?)```/g;
    while ((match = editRegex.exec(text)) !== null) {
      _fileOps.push({ type: 'edit', path: match[1].trim(), original: match[2].trim(), content: match[3].trim(), accepted: null });
    }

    // 匹配 delete 操作
    var deleteRegex = /```file:delete\s+(\S+)\s*```/g;
    while ((match = deleteRegex.exec(text)) !== null) {
      _fileOps.push({ type: 'delete', path: match[1].trim(), accepted: null });
    }

    renderFileOps();
  }

  function renderFileOps() {
    var container = document.getElementById('ai-file-ops');
    if (!container) return;

    var pending = _fileOps.filter(function(op) { return op.accepted === null; });
    if (pending.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    var html = '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;font-weight:600;">📁 待确认的文件操作 (' + pending.length + ')</div>';

    for (var i = 0; i < pending.length; i++) {
      var op = pending[i];
      var typeLabel = op.type === 'create' ? '创建' : op.type === 'edit' ? '编辑' : '删除';
      var typeColor = op.type === 'create' ? 'var(--color-success)' : op.type === 'edit' ? 'var(--color-warning)' : 'var(--color-error)';
      var fileName = op.path.split('/').pop();

      html += '\
<div class="ai-file-op" data-idx="' + i + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin-bottom:4px;background:var(--color-bg-tertiary);border-radius:6px;border-left:3px solid ' + typeColor + ';">\
  <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">\
    <span style="font-size:11px;font-weight:600;color:' + typeColor + ';">' + typeLabel + '</span>\
    <span style="font-size:12px;color:var(--color-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(fileName) + '</span>\
    <span style="font-size:10px;color:var(--color-text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(op.path) + '</span>\
  </div>\
  <div style="display:flex;gap:4px;flex-shrink:0;">\
    <button class="ai-op-view" data-idx="' + i + '" style="padding:3px 8px;font-size:11px;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:4px;color:var(--color-text-secondary);cursor:pointer;">查看</button>\
    <button class="ai-op-accept" data-idx="' + i + '" style="padding:3px 10px;font-size:11px;background:var(--color-success);border:none;border-radius:4px;color:#fff;cursor:pointer;">✓ 确认</button>\
    <button class="ai-op-reject" data-idx="' + i + '" style="padding:3px 10px;font-size:11px;background:var(--color-error);border:none;border-radius:4px;color:#fff;cursor:pointer;">✕ 拒绝</button>\
  </div>\
</div>';
    }

    container.innerHTML = html;

    // 绑定事件
    container.querySelectorAll('.ai-op-view').forEach(function(btn) {
      btn.onclick = function() { viewFileOp(parseInt(this.dataset.idx)); };
    });
    container.querySelectorAll('.ai-op-accept').forEach(function(btn) {
      btn.onclick = function() { acceptFileOp(parseInt(this.dataset.idx)); };
    });
    container.querySelectorAll('.ai-op-reject').forEach(function(btn) {
      btn.onclick = function() { rejectFileOp(parseInt(this.dataset.idx)); };
    });
  }

  function viewFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    var op = ops[idx];
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200002;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    var typeLabel = op.type === 'create' ? '创建' : op.type === 'edit' ? '编辑' : '删除';
    var content = '';
    if (op.type === 'create') {
      content = '<pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-all;">' + escHtml(op.content) + '</pre>';
    } else if (op.type === 'edit') {
      content = '<div style="font-size:12px;margin-bottom:6px;color:var(--color-text-secondary);">原始内容:</div><pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;border-left:3px solid var(--color-error);">' + escHtml(op.original) + '</pre><div style="font-size:12px;margin:8px 0 6px;color:var(--color-text-secondary);">修改后:</div><pre style="background:var(--color-bg-primary);padding:12px;border-radius:6px;font-size:12px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;border-left:3px solid var(--color-success);">' + escHtml(op.content) + '</pre>';
    } else {
      content = '<div style="font-size:13px;color:var(--color-text-tertiary);padding:20px;text-align:center;">此文件将被删除</div>';
    }
    modal.innerHTML = '\
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:20px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">\
  <h3 style="margin:0 0 4px;font-size:15px;">' + typeLabel + ': ' + escHtml(op.path) + '</h3>\
  ' + content + '\
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">\
    <button class="ai-op-accept" data-idx="' + idx + '" style="padding:6px 16px;font-size:12px;background:var(--color-success);border:none;border-radius:4px;color:#fff;cursor:pointer;">✓ 确认</button>\
    <button class="ai-op-reject" data-idx="' + idx + '" style="padding:6px 16px;font-size:12px;background:var(--color-error);border:none;border-radius:4px;color:#fff;cursor:pointer;">✕ 拒绝</button>\
    <button class="ai-op-close" style="padding:6px 16px;font-size:12px;background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:4px;color:var(--color-text-secondary);cursor:pointer;">关闭</button>\
  </div>\
</div>';
    document.body.appendChild(modal);
    modal.querySelector('.ai-op-close').onclick = function() { modal.remove(); };
    modal.querySelector('.ai-op-accept').onclick = function() { modal.remove(); acceptFileOp(idx); };
    modal.querySelector('.ai-op-reject').onclick = function() { modal.remove(); rejectFileOp(idx); };
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  }

  function acceptFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    var op = ops[idx];
    op.accepted = true;
    executeFileOp(op);
    renderFileOps();
  }

  function rejectFileOp(idx) {
    var ops = _fileOps.filter(function(op) { return op.accepted === null; });
    if (idx < 0 || idx >= ops.length) return;
    ops[idx].accepted = false;
    renderFileOps();
  }

  function executeFileOp(op) {
    if (!window.electronAPI) {
      addSystemMessage('❌ 文件操作失败: electronAPI 不可用');
      return;
    }

    var sepIdx = _currentFileContext ? Math.max(_currentFileContext.lastIndexOf('\\'), _currentFileContext.lastIndexOf('/')) : -1;
    var basePath = sepIdx >= 0 ? _currentFileContext.substring(0, sepIdx) : '';
    // 如果没有当前文件路径，使用项目目录
    if (!basePath) {
      addSystemMessage('⚠️ 请先打开一个文件以确定项目目录');
      return;
    }

    var fullPath = basePath + '/' + op.path;

    if (op.type === 'create') {
      window.electronAPI.writeFile(fullPath, op.content).then(function(result) {
        if (result.success) {
          addSystemMessage('✅ 已创建: ' + op.path);
        } else {
          addSystemMessage('❌ 创建失败: ' + (result.error || '未知错误'));
        }
      }).catch(function(err) { addSystemMessage('❌ 创建文件异常: ' + err.message); });
    } else if (op.type === 'edit') {
      window.electronAPI.writeFile(fullPath, op.content).then(function(result) {
        if (result.success) {
          addSystemMessage('✅ 已编辑: ' + op.path);
        } else {
          addSystemMessage('❌ 编辑失败: ' + (result.error || '未知错误'));
        }
      }).catch(function(err) { addSystemMessage('❌ 编辑文件异常: ' + err.message); });
    } else if (op.type === 'delete') {
      window.electronAPI.deleteFile(fullPath).then(function(result) {
        if (result.success) {
          addSystemMessage('✅ 已删除: ' + op.path);
        } else {
          addSystemMessage('❌ 删除失败: ' + (result.error || '未知错误'));
        }
      }).catch(function(err) { addSystemMessage('❌ 删除文件异常: ' + err.message); });
    }
  }

  // ============================================
  // 消息渲染
  // ============================================

  function addUserMessage(text) {
    _messages.push({ role: 'user', content: text, id: Date.now() });
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-user';
    div.innerHTML = '<div class="ai-msg-avatar" style="background:var(--color-primary);flex-shrink:0;">U</div><div class="ai-msg-bubble" style="background:var(--color-bg-tertiary);"><div class="ai-msg-content">' + escHtml(text) + '</div></div>';
    container.appendChild(div);
    scrollToBottom();
    saveMessages();
  }

  function addAIMessage(text) {
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-ai';
    div.innerHTML = '<div class="ai-msg-avatar" style="background:linear-gradient(135deg,#00c8ff,#7c3aed);flex-shrink:0;">AI</div><div class="ai-msg-bubble" style="background:var(--color-bg-primary);border:1px solid var(--color-border);"><div class="ai-msg-content">' + (text || '') + '</div><div class="ai-msg-ops" style="margin-top:8px;"></div></div>';
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addSystemMessage(text) {
    var container = document.getElementById('ai-messages');
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-system';
    div.style.cssText = 'text-align:center;font-size:12px;color:var(--color-text-tertiary);padding:4px 0;';
    div.textContent = text;
    container.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    var container = document.getElementById('ai-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  function renderMessages(messages) {
    var container = document.getElementById('ai-messages');
    if (!container) return;
    container.innerHTML = '';
    if (!messages || messages.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--color-text-tertiary);font-size:14px;">💡 输入你的需求，AI 将帮助你编写和修改代码</div>';
      return;
    }
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'user') {
        var div = document.createElement('div');
        div.className = 'ai-msg ai-msg-user';
        div.innerHTML = '<div class="ai-msg-avatar" style="background:var(--color-primary);flex-shrink:0;">U</div><div class="ai-msg-bubble" style="background:var(--color-bg-tertiary);"><div class="ai-msg-content">' + escHtml(m.content) + '</div></div>';
        container.appendChild(div);
      } else if (m.role === 'assistant') {
        var div = document.createElement('div');
        div.className = 'ai-msg ai-msg-ai';
        div.innerHTML = '<div class="ai-msg-avatar" style="background:linear-gradient(135deg,#00c8ff,#7c3aed);flex-shrink:0;">AI</div><div class="ai-msg-bubble" style="background:var(--color-bg-primary);border:1px solid var(--color-border);"><div class="ai-msg-content">' + escHtml(m.content) + '</div></div>';
        container.appendChild(div);
      } else if (m.type === 'system') {
        var div = document.createElement('div');
        div.style.cssText = 'text-align:center;font-size:12px;color:var(--color-text-tertiary);padding:4px 0;';
        div.textContent = m.content;
        container.appendChild(div);
      }
    }
    scrollToBottom();
  }

  // ============================================
  // 持久化
  // ============================================

  function saveMessages() {
    try {
      var toSave = _messages.slice(-50);
      localStorage.setItem('ai_chat_history', JSON.stringify(toSave));
    } catch(e) {}
  }

  function loadMessages() {
    try {
      var raw = localStorage.getItem('ai_chat_history');
      if (raw) {
        _messages = JSON.parse(raw);
        return _messages;
      }
    } catch(e) {}
    return [];
  }

  function loadHistory() {
    renderMessages(_messages || []);
  }

  function clearConversation() {
    if (!confirm('确定清除所有对话历史？')) return;
    _messages = [];
    localStorage.removeItem('ai_chat_history');
    renderMessages([]);
    _fileOps = [];
    renderFileOps();
    addSystemMessage('对话已清除');
  }

  // ============================================
  // UI 状态
  // ============================================

  function setStatus(text) {
    var el = document.getElementById('ai-status');
    if (el) el.textContent = text ? '· ' + text : '';
  }

  function setSendingState(isSending) {
    var sendBtn = document.getElementById('ai-btn-send');
    var stopBtn = document.getElementById('ai-btn-stop');
    var input = document.getElementById('ai-input');
    if (sendBtn) sendBtn.style.display = isSending ? 'none' : '';
    if (stopBtn) stopBtn.style.display = isSending ? '' : 'none';
    if (input) input.disabled = isSending;
    if (input && !isSending) input.focus();
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================
  // 初始化
  // ============================================

  return {
    open: open,
    close: close,
    setFileContext: setFileContext,
  };
})();
