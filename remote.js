// ============================================
// 远程模式 - WebSocket 服务器/客户端
// ============================================

const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const APP_VERSION = require('./package.json').version;

// ---- 事件回调 ----
let _onEvent = null; // 由 main.js 设置，向 renderer 发消息

function setEventHandler(fn) {
  _onEvent = fn;
}

function emit(event, data) {
  if (_onEvent) _onEvent(event, data);
}

// ---- 工具 ----
function genSecurityCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// 恒定时间字符串比较, 避免密码验证的时序侧信道
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// 文件路径校验: 必须是合理长度的字符串, 防止非字符串路径使 fs 同步抛错崩溃主进程
function isValidPath(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 4096;
}

// ============================================
// 服务器
// ============================================

let _server = null;
let _serverPassword = '';
let _serverBaseDir = process.cwd();
let _serverClients = new Map(); // clientId → { ws, ip, securityCode, approved, permission, filePerms, remoteAddr, editingFiles }
let _pendingClients = new Map(); // clientId → { ws, ip, securityCode }
let _clientIdCounter = 0;
var _allowDifferentVersions;

function getServerStatus() {
  if (!_server) return { running: false };
  const clients = [];
  for (const [id, c] of _serverClients) {
    clients.push({
      id,
      ip: c.remoteAddr,
      securityCode: c.securityCode,
      approved: c.approved,
      permission: c.permission || 'confirm',
      filePerms: c.filePerms || {},
    });
  }
  // 待确认的也加入列表
  for (const [id, c] of _pendingClients) {
    clients.push({
      id,
      ip: c.remoteAddr,
      securityCode: c.securityCode,
      approved: false,
      pending: true,
    });
  }
  return { running: true, clients, serverVersion: APP_VERSION, allowDifferentVersions: _allowDifferentVersions };
}

async function startServer(port, password, options = {}) {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { success: false, error: 'Invalid port number' };
  }
  if (_server) {
    await stopServer();
  }

  _serverPassword = password;
  _allowDifferentVersions = options.allowDifferentVersions === true;
  _serverClients.clear();
  _pendingClients.clear();

  return new Promise((resolve, reject) => {
    try {
      _server = new WebSocket.Server({ port }, () => {
        console.log(`[REMOTE] 服务器已启动，端口: ${port}`);
        emit('server:started', { port });
        resolve({ success: true });
      });

      var thisServer = _server;

      _server.on('error', (err) => {
        console.error('[REMOTE] 服务器错误:', err.message);
        emit('server:error', { message: err.message });
        // 不在此处设置 _server = null, 让 close 事件处理清理, 避免 WebSocket 服务器仍在运行但 _server 已丢失
        if (_server === thisServer) reject(err);
      });

      _server.on('close', () => {
        if (_server === thisServer) _server = null;
      });

      _server.on('connection', (ws, req) => {
        const clientId = 'client_' + (++_clientIdCounter);
        const remoteAddr = req.socket.remoteAddress || 'unknown';
        console.log(`[REMOTE] 新连接: ${clientId} from ${remoteAddr}`);

        let securityCode = '';

        const safeSend = (data) => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(data));
            }
          } catch (e) {
            console.warn('[REMOTE] 发送消息失败:', e.message);
          }
        };

        ws.on('message', (raw) => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch (e) {
            safeSend({ type: 'error', message: '无效消息格式', errorKey: 'remote.invalidMessageFormat' });
            return;
          }

          // 已认证的客户端在 _serverClients 中，待确认的在 _pendingClients 中
          if (!_serverClients.has(clientId)) {
            // ---- 认证阶段 ----
            if (msg.type === 'auth:request') {
              if (!safeEqual(msg.password, _serverPassword)) {
                safeSend({ type: 'auth:rejected', reason: '密码错误', errorKey: 'remote.wrongPassword' });
                ws.close();
                return;
              }
              // 版本检查：默认拒绝不同版本客户端
              if (msg.version && msg.version !== APP_VERSION && !_allowDifferentVersions) {
                safeSend({ type: 'auth:rejected', reason: '客户端版本 (' + msg.version + ') 与服务器版本 (' + APP_VERSION + ') 不匹配，请在设置中开启"允许不同版本"', errorKey: 'remote.versionMismatch', errorKeyParams: { client: msg.version, server: APP_VERSION } });
                ws.close();
                return;
              }
              // 生成安全码，进入待确认状态
              securityCode = genSecurityCode();
              _pendingClients.set(clientId, { ws, ip: remoteAddr, securityCode, remoteAddr });
              safeSend({ type: 'auth:challenge', securityCode });
              emit('client:joined', {
                clientId,
                ip: remoteAddr,
                securityCode,
                pending: true,
              });
              return;
            }

            safeSend({ type: 'error', message: '请先认证', errorKey: 'remote.authenticateFirst' });
            return;
          }

          // ---- 已认证 ----
          handleClientMessage(clientId, msg);
        });

        ws.on('close', () => {
          console.log(`[REMOTE] 连接断开: ${clientId}`);
          // 释放该客户端正在编辑的文件
          const leaving = _serverClients.get(clientId);
          if (leaving && leaving.editingFiles) {
            for (const fp of leaving.editingFiles) {
              broadcastToClients(clientId, { type: 'file:editing:ended', path: fp, clientId });
            }
          }
          _serverClients.delete(clientId);
          _pendingClients.delete(clientId);
          emit('client:left', { clientId });
        });

        ws.on('error', (err) => {
          console.warn(`[REMOTE] 客户端 ${clientId} 错误:`, err.message);
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function stopServer() {
  if (!_server) return;
  const server = _server;
  // 通知所有客户端
  for (const [, c] of _serverClients) {
    try {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(JSON.stringify({ type: 'server:stopped' }));
        c.ws.close();
      }
    } catch (e) {}
  }
  for (const [, c] of _pendingClients) {
    try {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(JSON.stringify({ type: 'server:stopped' }));
        c.ws.close();
      }
    } catch (e) {}
  }
  // 等待 close 真正完成, 否则立刻重启同端口会 EADDRINUSE (2s 兜底防回调悬置)
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    try {
      server.close(() => { clearTimeout(timer); resolve(); });
    } catch (e) {
      clearTimeout(timer);
      resolve();
    }
  });
  _server = null;
  _serverClients.clear();
  _pendingClients.clear();
  emit('server:stopped', {});
}

function confirmClient(clientId) {
  const pending = _pendingClients.get(clientId);
  if (!pending) return { success: false, reason: '未找到待确认的客户端' };

  _pendingClients.delete(clientId);
  const permission = 'confirm'; // 默认：更改需确认
  _serverClients.set(clientId, {
    ws: pending.ws,
    ip: pending.ip,
    securityCode: pending.securityCode,
    remoteAddr: pending.remoteAddr,
    approved: true,
    permission,
    filePerms: {},
    editingFiles: new Set(),
  });

  try {
    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify({
        type: 'auth:approved',
        permissions: { level: permission, files: {} },
      }));
    }
  } catch (e) {}

  emit('client:approved', { clientId, permission });
  return { success: true };
}

function rejectClient(clientId) {
  const pending = _pendingClients.get(clientId);
  if (!pending) return { success: false, reason: '未找到待确认的客户端' };

  _pendingClients.delete(clientId);
  try {
    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify({ type: 'auth:rejected', reason: '管理员拒绝了连接请求', errorKey: 'remote.connectionRejectedByAdmin' }));
      pending.ws.close();
    }
  } catch (e) {}
  emit('client:rejected', { clientId });
  return { success: true };
}

function setClientPermission(clientId, permission) {
  const client = _serverClients.get(clientId);
  if (!client) return { success: false, reason: '未找到客户端' };
  client.permission = permission;
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'permission:update',
        permissions: { level: permission, files: client.filePerms || {} },
      }));
    }
  } catch (e) {}
  emit('client:permission-changed', { clientId, permission });
  return { success: true };
}

function setClientFilePermission(clientId, filePath, filePermission) {
  const client = _serverClients.get(clientId);
  if (!client) return { success: false, reason: '未找到客户端' };
  if (!client.filePerms) client.filePerms = {};
  client.filePerms[filePath] = filePermission;
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'permission:update',
        permissions: { level: client.permission, files: client.filePerms },
      }));
    }
  } catch (e) {}
  return { success: true };
}

function disconnectClient(clientId) {
  const client = _serverClients.get(clientId);
  if (client) {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'disconnected', reason: '管理员断开了连接', errorKey: 'remote.disconnectedByAdmin' }));
        client.ws.close();
      }
    } catch (e) {}
    _serverClients.delete(clientId);
  }
  const pending = _pendingClients.get(clientId);
  if (pending) {
    try {
      if (pending.ws.readyState === WebSocket.OPEN) {
        pending.ws.send(JSON.stringify({ type: 'disconnected', reason: '管理员断开了连接' }));
        pending.ws.close();
      }
    } catch (e) {}
    _pendingClients.delete(clientId);
  }
  emit('client:left', { clientId });
}

function disconnectAll() {
  const ids = [..._serverClients.keys(), ..._pendingClients.keys()];
  for (const id of ids) {
    disconnectClient(id);
  }
}

// 处理来自已认证客户端的消息
function handleClientMessage(clientId, msg) {
  const client = _serverClients.get(clientId);
  if (!client) {
    emit('server:error', { message: `未知客户端 ${clientId} 发送消息` });
    return;
  }

  switch (msg.type) {
    case 'file:read': {
      readClientFile(clientId, client, msg);
      break;
    }
    case 'file:write': {
      writeClientFile(clientId, client, msg);
      break;
    }
    case 'file:list': {
      listClientFiles(clientId, client, msg);
      break;
    }
    case 'file:delete': {
      deleteClientFile(clientId, client, msg);
      break;
    }
    case 'file:editing:start': {
      // 客户端开始编辑某个文件
      if (!isValidPath(msg.path)) {
        safeSendTo(client, { type: 'error', message: '无效路径', errorKey: 'remote.invalidPath' });
        return;
      }
      if (!client.editingFiles) client.editingFiles = new Set();
      client.editingFiles.add(msg.path);
      // 通知所有其他客户端
      broadcastToClients(clientId, { type: 'file:editing:started', path: msg.path, clientId });
      break;
    }
    case 'file:editing:end': {
      // 客户端结束编辑某个文件
      if (!isValidPath(msg.path)) {
        safeSendTo(client, { type: 'error', message: '无效路径', errorKey: 'remote.invalidPath' });
        return;
      }
      if (client.editingFiles) client.editingFiles.delete(msg.path);
      broadcastToClients(clientId, { type: 'file:editing:ended', path: msg.path, clientId });
      break;
    }
    case 'file:editing:list': {
      // 返回当前正在编辑的文件列表
      const editingMap = {};
      for (const [cid, c] of _serverClients) {
        if (c.editingFiles) {
          for (const fp of c.editingFiles) {
            editingMap[fp] = cid;
          }
        }
      }
      safeSendTo(client, { type: 'file:editing:list:result', editing: editingMap });
      break;
    }
    case 'ping': {
      safeSendTo(client, { type: 'pong' });
      break;
    }
    default:
      safeSendTo(client, { type: 'error', message: `未知消息类型: ${msg.type}`, errorKey: 'remote.unknownMessageType', errorKeyParams: { type: msg.type } });
  }
}

function broadcastToClients(senderClientId, data) {
  var clients = Array.from(_serverClients);
  for (const [cid, c] of clients) {
    if (cid !== senderClientId) {
      safeSendTo(c, data);
    }
  }
}

function safeSendTo(client, data) {
  try {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  } catch (e) {}
}

function readClientFile(clientId, client, msg) {
  const filePath = msg.path;
  if (!isValidPath(filePath)) {
    safeSendTo(client, { type: 'file:read:result', path: '', success: false, error: '无效路径', errorKey: 'remote.invalidPath' });
    return;
  }
  // 路径沙箱: 拒绝逃逸 _serverBaseDir 的路径
  const resolvedPath = path.resolve(_serverBaseDir, filePath);
  if (resolvedPath.indexOf(_serverBaseDir + path.sep) !== 0 && resolvedPath !== _serverBaseDir) {
    safeSendTo(client, { type: 'file:read:result', path: filePath, success: false, error: '路径不允许', errorKey: 'remote.pathNotAllowed' });
    return;
  }
  // 权限检查
  const filePerm = checkFilePermission(client, filePath);
  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:read:result', path: filePath, success: false, error: '无权限读取此文件', errorKey: 'remote.noReadPermission' });
    return;
  }
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      safeSendTo(client, { type: 'file:read:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:read:result', path: filePath, success: true, content });
  });
}

function writeClientFile(clientId, client, msg) {
  const filePath = msg.path;
  if (!isValidPath(filePath) || typeof msg.content !== 'string') {
    safeSendTo(client, { type: 'file:write:result', path: '', success: false, error: '无效路径或内容', errorKey: 'remote.invalidPath' });
    return;
  }
  // 路径沙箱: 拒绝逃逸 _serverBaseDir 的路径
  const resolvedPath = path.resolve(_serverBaseDir, filePath);
  if (resolvedPath.indexOf(_serverBaseDir + path.sep) !== 0 && resolvedPath !== _serverBaseDir) {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: '路径不允许', errorKey: 'remote.pathNotAllowed' });
    return;
  }
  const filePerm = checkFilePermission(client, filePath);

  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: '无权限编辑此文件', errorKey: 'remote.noEditPermission' });
    return;
  }

  if (client.permission === 'guest') {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: '访客模式，无编辑权限', errorKey: 'remote.guestNoEditPermission' });
    return;
  }

  if (client.permission === 'confirm' || filePerm === 'confirm') {
    // 需要管理员确认
    emit('file:change:request', {
      clientId,
      ip: client.remoteAddr,
      path: filePath,
      content: msg.content,
    });
    safeSendTo(client, { type: 'file:write:pending', path: filePath });
    return;
  }

  // 直接写入
  fs.writeFile(filePath, msg.content, 'utf-8', (err) => {
    if (err) {
      safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
    emit('file:change:applied', { clientId, path: filePath });
  });
}

function listClientFiles(clientId, client, msg) {
  const dirPath = msg.path;
  if (!isValidPath(dirPath)) {
    safeSendTo(client, { type: 'file:list:result', path: '', success: false, error: '无效路径', errorKey: 'remote.invalidPath' });
    return;
  }
  // 路径沙箱: 拒绝逃逸 _serverBaseDir 的路径
  const resolvedDir = path.resolve(_serverBaseDir, dirPath);
  if (resolvedDir.indexOf(_serverBaseDir + path.sep) !== 0 && resolvedDir !== _serverBaseDir) {
    safeSendTo(client, { type: 'file:list:result', path: dirPath, success: false, error: '路径不允许', errorKey: 'remote.pathNotAllowed' });
    return;
  }
  // 目录列举同样受文件权限约束
  const filePerm = checkFilePermission(client, dirPath);
  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:list:result', path: dirPath, success: false, error: '无权限浏览此目录', errorKey: 'remote.noReadPermission' });
    return;
  }

  // Windows 下根目录 "/" 转换为列出盘符
  if (dirPath === '/' && process.platform === 'win32') {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = letter + ':\\';
      try {
        if (fs.existsSync(drivePath)) {
          drives.push({ name: letter + ':', isDirectory: true, path: drivePath });
        }
      } catch (e) {}
    }
    safeSendTo(client, { type: 'file:list:result', path: '/', success: true, files: drives });
    return;
  }

  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      safeSendTo(client, { type: 'file:list:result', path: dirPath, success: false, error: err.message });
      return;
    }
    const files = entries.map(function(e) {
      var isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) {
        try { var stat = fs.statSync(path.join(dirPath, e.name)); isDir = stat.isDirectory(); } catch(e) {}
      }
      return { name: e.name, isDirectory: isDir, path: path.join(dirPath, e.name) };
    });
    safeSendTo(client, { type: 'file:list:result', path: dirPath, success: true, files });
  });
}

function deleteClientFile(clientId, client, msg) {
  const filePath = msg.path;
  if (!isValidPath(filePath)) {
    safeSendTo(client, { type: 'file:delete:result', path: '', success: false, error: '无效路径', errorKey: 'remote.invalidPath' });
    return;
  }
  // 路径沙箱: 拒绝逃逸 _serverBaseDir 的路径
  const resolvedPath = path.resolve(_serverBaseDir, filePath);
  if (resolvedPath.indexOf(_serverBaseDir + path.sep) !== 0 && resolvedPath !== _serverBaseDir) {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: '路径不允许', errorKey: 'remote.pathNotAllowed' });
    return;
  }
  const filePerm = checkFilePermission(client, filePath);

  if (filePerm === 'none') {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: '无权限删除此文件', errorKey: 'remote.noDeletePermission' });
    return;
  }

  if (client.permission === 'guest') {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: '访客模式，无删除权限', errorKey: 'remote.guestNoDeletePermission' });
    return;
  }

  if (client.permission === 'confirm' || filePerm === 'confirm') {
    // 需要管理员确认
    emit('file:delete:request', {
      clientId,
      ip: client.remoteAddr,
      path: filePath,
    });
    safeSendTo(client, { type: 'file:delete:pending', path: filePath });
    return;
  }

  // 直接删除 (移入系统回收站; shell 仅在 Electron 主进程可用, 独立 Node 环境回退为永久删除)
  const finishDelete = (err) => {
    if (err) {
      safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: err.message });
      return;
    }
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: true });
    emit('file:delete:applied', { clientId, path: filePath });
  };
  try {
    const { shell } = require('electron');
    // trashItem 需要绝对路径: 用已通过沙箱校验的 resolvedPath
    shell.trashItem(resolvedPath).then(() => finishDelete(null), finishDelete);
  } catch (e) {
    fs.unlink(resolvedPath, finishDelete);
  }
}

function checkFilePermission(client, filePath) {
  if (!client.filePerms || typeof filePath !== 'string') return null;
  // Windows 文件系统大小写不敏感, 归一化后再匹配, 避免管理员授权 C:\Foo 客户端请求 c:\foo 失配
  const fold = process.platform === 'win32' ? s => s.toLowerCase() : s => s;
  const normPath = fold(filePath.replace(/\\/g, '/'));
  // 按目录匹配 (两侧统一斜杠; 目录前缀需以 / 结尾, 避免 C:\foo 误匹配 C:\foobar)
  for (const [pattern, perm] of Object.entries(client.filePerms)) {
    const normPattern = fold(String(pattern).replace(/\\/g, '/').replace(/\/+$/, ''));
    if (normPath === normPattern) return perm;
    if (normPath.startsWith(normPattern + '/')) return perm;
  }
  return null; // 继承客户端级别权限
}

// 管理员直接写入文件（批准更改）
function applyApprovedWrite(clientId, filePath, content) {
  if (!isValidPath(filePath) || typeof content !== 'string') {
    emit('server:error', { message: '批准写入参数无效' });
    return;
  }
  fs.writeFile(filePath, content, 'utf-8', (err) => {
    if (err) {
      emit('server:error', { message: `批准写入失败: ${err.message}` });
      return;
    }
    // 通知对应客户端
    const client = _serverClients.get(clientId);
    if (client) {
      safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
    }
    emit('file:change:applied', { clientId, path: filePath });
  });
}

// 管理员批准删除文件
function applyApprovedDelete(clientId, filePath) {
  if (!isValidPath(filePath)) {
    emit('server:error', { message: '批准删除路径无效' });
    return;
  }
  const finishApprovedDelete = (err) => {
    if (err) {
      emit('server:error', { message: `批准删除失败: ${err.message}` });
      return;
    }
    const client = _serverClients.get(clientId);
    if (client) {
      safeSendTo(client, { type: 'file:delete:result', path: filePath, success: true });
    }
    emit('file:delete:applied', { clientId, path: filePath });
  };
  // 移入回收站 (shell 仅在 Electron 主进程可用, 独立 Node 环境回退为永久删除)
  // trashItem 需要绝对路径: 与删除沙箱一致地对 _serverBaseDir 解析
  const absPath = path.resolve(_serverBaseDir, filePath);
  try {
    const { shell } = require('electron');
    shell.trashItem(absPath).then(() => finishApprovedDelete(null), finishApprovedDelete);
  } catch (e) {
    fs.unlink(absPath, finishApprovedDelete);
  }
}

// 管理员拒绝删除文件
function notifyFileDeleteRejected(clientId, filePath, reason, errorKey) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:delete:result', path: filePath, success: false, error: reason || '管理员拒绝了删除请求', errorKey: errorKey || 'remote.deleteRejectedByAdmin' });
  }
}

// ============================================
// 客户端
// ============================================

let _client = null;
let _clientInfo = null;

function getClientStatus() {
  if (!_client || _client.readyState === WebSocket.CLOSED || _client.readyState === WebSocket.CLOSING) {
    return { connected: false };
  }
  return {
    connected: true,
    state: _client.readyState === WebSocket.OPEN ? 'open' :
           _client.readyState === WebSocket.CONNECTING ? 'connecting' : 'closing',
    serverInfo: _clientInfo,
  };
}

async function connectToServer(host, port, password, version) {
  if (_client) {
    await disconnectFromServer();
  }

  const url = `ws://${host}:${port}`;
  _clientInfo = { host, port };

  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url);
      let authTimeout = setTimeout(() => {
        if (_client && (_client.readyState === WebSocket.OPEN || _client.readyState === WebSocket.CONNECTING)) {
          emit('client:error', { message: '认证超时', errorKey: 'remote.authTimeout' });
          ws.close();
          _client = null;
        }
      }, 10000);

      ws.on('open', () => {
        console.log(`[REMOTE] 已连接到服务器 ${url}`);
        _client = ws;
        // 发送认证请求（含版本信息）
        const authMsg = { type: 'auth:request', password };
        if (version) authMsg.version = version;
        ws.send(JSON.stringify(authMsg));
        emit('client:connecting', { host, port });
      });

      // 统一消息处理（不在外部重复注册）
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (e) {
          emit('client:error', { message: '无效消息格式', errorKey: 'remote.invalidMessageFormat' });
          return;
        }

        // 认证阶段消息
        if (msg.type === 'auth:challenge') {
          clearTimeout(authTimeout);
          emit('client:auth:challenge', { securityCode: msg.securityCode });
          resolve({ stage: 'challenge', securityCode: msg.securityCode });
          return;
        }
        if (msg.type === 'auth:rejected') {
          clearTimeout(authTimeout);
          const rejectErr = new Error(msg.reason || '认证被拒绝');
          rejectErr.errorKey = msg.errorKey || 'remote.authRejected';
          emit('client:error', { message: msg.reason || '认证被拒绝', errorKey: rejectErr.errorKey });
          ws.close();
          _client = null;
          reject(rejectErr);
          return;
        }
        if (msg.type === 'auth:approved') {
          clearTimeout(authTimeout);
          emit('client:auth:approved', { permissions: msg.permissions });
          resolve({ stage: 'approved', permissions: msg.permissions });
          return;
        }

        // 认证后的常规消息
        var action = handleServerMessage(ws, msg);
        if (action === 'disconnect') _client = null;
      });

      ws.on('close', () => {
        console.log('[REMOTE] 与服务器的连接已断开');
        clearTimeout(authTimeout);
        _client = null;
        emit('client:disconnected', {});
        reject(new Error('连接已断开'));
      });

      ws.on('error', (err) => {
        console.error('[REMOTE] 客户端连接错误:', err.message);
        clearTimeout(authTimeout);
        emit('client:error', { message: err.message });
        _client = null;
        reject(new Error(err.message));
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function disconnectFromServer() {
  if (_client) {
    try {
      if (_client.readyState === WebSocket.OPEN) {
        _client.send(JSON.stringify({ type: 'disconnect' }));
        _client.close();
      }
    } catch (e) {}
    _client = null;
    _clientInfo = null;
    emit('client:disconnected', {});
  }
}

// 客户端：发送文件读取请求
function requestFileRead(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:read', path: filePath }));
  }
}

// 客户端：发送文件写入请求
function requestFileWrite(filePath, content) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:write', path: filePath, content }));
  }
}

// 客户端：发送文件列表请求
function requestFileList(dirPath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:list', path: dirPath }));
  }
}

// 客户端：发送文件删除请求
function requestFileDelete(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:delete', path: filePath }));
  }
}

// 客户端：通知服务器开始编辑文件
function notifyEditingStart(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:start', path: filePath }));
  }
}

// 客户端：通知服务器结束编辑文件
function notifyEditingEnd(filePath) {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:end', path: filePath }));
  }
}

// 客户端：请求正在编辑的文件列表
function requestEditingList() {
  if (_client && _client.readyState === WebSocket.OPEN) {
    _client.send(JSON.stringify({ type: 'file:editing:list' }));
  }
}

// 处理来自服务器的消息
function handleServerMessage(ws, msg) {
  switch (msg.type) {
    case 'auth:approved':
      emit('client:auth:approved', { permissions: msg.permissions });
      break;
    case 'auth:rejected':
      emit('client:error', { message: msg.reason || '认证被拒绝', errorKey: msg.errorKey || 'remote.authRejected' });
      ws.close();
      return 'disconnect';
    case 'auth:challenge':
      emit('client:auth:challenge', { securityCode: msg.securityCode });
      break;
    case 'permission:update':
      emit('client:permission:updated', { permissions: msg.permissions });
      break;
    case 'file:read:result':
      emit('client:file:read', { path: msg.path, success: msg.success, content: msg.content, error: msg.error, errorKey: msg.errorKey, errorKeyParams: msg.errorKeyParams });
      break;
    case 'file:write:result':
      emit('client:file:write:result', { path: msg.path, success: msg.success, error: msg.error, errorKey: msg.errorKey, errorKeyParams: msg.errorKeyParams });
      break;
    case 'file:write:pending':
      emit('client:file:write:pending', { path: msg.path });
      break;
    case 'file:list:result':
      emit('client:file:list', { path: msg.path, success: msg.success, files: msg.files, error: msg.error, errorKey: msg.errorKey, errorKeyParams: msg.errorKeyParams });
      break;
    case 'file:delete:result':
      emit('client:file:delete:result', { path: msg.path, success: msg.success, error: msg.error, errorKey: msg.errorKey, errorKeyParams: msg.errorKeyParams });
      break;
    case 'file:delete:pending':
      emit('client:file:delete:pending', { path: msg.path });
      break;
    case 'file:editing:started':
      emit('client:file:editing:started', { path: msg.path, clientId: msg.clientId });
      break;
    case 'file:editing:ended':
      emit('client:file:editing:ended', { path: msg.path, clientId: msg.clientId });
      break;
    case 'file:editing:list:result':
      emit('client:file:editing:list:result', { editing: msg.editing });
      break;
    case 'server:stopped':
      emit('client:server:stopped', {});
      break;
    case 'disconnected':
      emit('client:disconnected', { reason: msg.reason, errorKey: msg.errorKey });
      break;
    case 'pong':
      emit('client:pong', {});
      break;
    case 'error':
      emit('client:error', { message: msg.message, errorKey: msg.errorKey, errorKeyParams: msg.errorKeyParams });
      break;
    default:
      console.warn('[REMOTE] 未知服务器消息:', msg.type);
  }
}

// 发送文件变更结果到客户端（管理员批准后）
function notifyFileChangeApproved(clientId, filePath) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: true });
  }
}

// 发送文件变更被拒绝
function notifyFileChangeRejected(clientId, filePath, reason, errorKey) {
  const client = _serverClients.get(clientId);
  if (client) {
    safeSendTo(client, { type: 'file:write:result', path: filePath, success: false, error: reason || '更改被管理员拒绝', errorKey: errorKey || 'remote.changeRejectedByAdmin' });
  }
}

module.exports = {
  setEventHandler,
  // 服务器
  startServer,
  stopServer,
  getServerStatus,
  confirmClient,
  rejectClient,
  setClientPermission,
  setClientFilePermission,
  disconnectClient,
  disconnectAll,
  applyApprovedWrite,
  notifyFileChangeApproved,
  notifyFileChangeRejected,
  applyApprovedDelete,
  notifyFileDeleteRejected,
  // 客户端
  connectToServer,
  disconnectFromServer,
  getClientStatus,
  requestFileRead,
  requestFileWrite,
  requestFileList,
  requestFileDelete,
  notifyEditingStart,
  notifyEditingEnd,
  requestEditingList,
};
