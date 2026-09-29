const { contextBridge, ipcRenderer } = require('electron');

// 最简单的preload脚本 - 只暴露一个测试API
try {
  console.log('[PRELOAD] Preload script starting...');

  // 先测试基本的暴露
  contextBridge.exposeInMainWorld('testAPI', {
    test: () => 'Test API working'
  });

  console.log('[PRELOAD] testAPI exposed successfully');

  // 然后暴露完整的electronAPI
  const api = {
    // 对话框
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

    // 文件系统操作
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),

    // 应用路径
    getAppPath: () => ipcRenderer.invoke('app:getPath'),

    // 文件操作
    copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
    deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),

    // CraftEngine 工程根回溯
    ce: {
      resolveProjectRoot: (filePath) => ipcRenderer.invoke('ce:resolveProjectRoot', filePath),
    },

    // Minecraft 资源索引 (补全 / 预览)
    mc: {
      scanAssets: (root) => ipcRenderer.invoke('mc:scanAssets', root),
      scanNamespace: (nsDir, namespace) => ipcRenderer.invoke('mc:scanNamespace', nsDir, namespace),
      readSoundEvents: (nsDir, langName) => ipcRenderer.invoke('mc:readSoundEvents', nsDir, langName),
      readBinary: (filePath) => ipcRenderer.invoke('mc:readBinary', filePath),
      readText: (filePath) => ipcRenderer.invoke('mc:readText', filePath),
      detectRoots: () => ipcRenderer.invoke('mc:detectRoots'),
    },

    // 系统字体列表
    listFonts: () => ipcRenderer.invoke('fonts:list'),

    // 配置检查 (Checks → Debug) 独立窗口
    checks: {
      open: (payload) => ipcRenderer.invoke('checks:open', payload),
      update: (payload) => ipcRenderer.invoke('checks:update', payload),
      getData: () => ipcRenderer.invoke('checks:data'),
      requestRescan: () => ipcRenderer.invoke('checks:requestRescan'),
      gotoIssue: (issue) => ipcRenderer.invoke('checks:gotoIssue', issue),
      // 单订阅: 重复调用先移除旧 listener, 避免累积
      onUpdate: (callback) => {
        if (api.checks.__updateListener) ipcRenderer.removeListener('checks:update', api.checks.__updateListener);
        api.checks.__updateListener = (event, payload) => callback(payload);
        ipcRenderer.on('checks:update', api.checks.__updateListener);
      },
      onRescan: (callback) => {
        if (api.checks.__rescanListener) ipcRenderer.removeListener('checks:rescan', api.checks.__rescanListener);
        api.checks.__rescanListener = () => callback();
        ipcRenderer.on('checks:rescan', api.checks.__rescanListener);
      },
      onGoto: (callback) => {
        if (api.checks.__gotoListener) ipcRenderer.removeListener('checks:goto', api.checks.__gotoListener);
        api.checks.__gotoListener = (event, issue) => callback(issue);
        ipcRenderer.on('checks:goto', api.checks.__gotoListener);
      },
    },
  };

  // Window controls
  api.minimize = () => ipcRenderer.send('window:minimize');
  api.maximize = () => ipcRenderer.send('window:maximize');
  api.close = () => ipcRenderer.send('window:close');
  api.openDevTools = () => ipcRenderer.send('window:openDevTools');
  api.toggleDevTools = () => ipcRenderer.send('window:toggleDevTools');
  api.isMaximized = () => ipcRenderer.invoke('window:isMaximized');
  api.appVersion = ipcRenderer.sendSync('app:getVersionSync');
  api.openExternal = (url) => ipcRenderer.invoke('shell:openExternal', url);

  // 远程模式
  api.remote = {
    // 服务器
    startServer: (opts) => ipcRenderer.invoke('remote:startServer', opts),
    stopServer: () => ipcRenderer.invoke('remote:stopServer'),
    getServerStatus: () => ipcRenderer.invoke('remote:getServerStatus'),
    confirmClient: (opts) => ipcRenderer.invoke('remote:confirmClient', opts),
    rejectClient: (opts) => ipcRenderer.invoke('remote:rejectClient', opts),
    setClientPermission: (opts) => ipcRenderer.invoke('remote:setClientPermission', opts),
    setClientFilePermission: (opts) => ipcRenderer.invoke('remote:setClientFilePermission', opts),
    disconnectClient: (opts) => ipcRenderer.invoke('remote:disconnectClient', opts),
    disconnectAll: () => ipcRenderer.invoke('remote:disconnectAll'),
    applyApprovedWrite: (opts) => ipcRenderer.invoke('remote:applyApprovedWrite', opts),
    notifyFileChangeRejected: (opts) => ipcRenderer.invoke('remote:notifyFileChangeRejected', opts),
    applyApprovedDelete: (opts) => ipcRenderer.invoke('remote:applyApprovedDelete', opts),
    notifyFileDeleteRejected: (opts) => ipcRenderer.invoke('remote:notifyFileDeleteRejected', opts),
    // 客户端
    connectToServer: (opts) => ipcRenderer.invoke('remote:connectToServer', opts),
    disconnectFromServer: () => ipcRenderer.invoke('remote:disconnectFromServer'),
    getClientStatus: () => ipcRenderer.invoke('remote:getClientStatus'),
    requestFileRead: (opts) => ipcRenderer.invoke('remote:requestFileRead', opts),
    requestFileWrite: (opts) => ipcRenderer.invoke('remote:requestFileWrite', opts),
    requestFileList: (opts) => ipcRenderer.invoke('remote:requestFileList', opts),
    requestFileDelete: (opts) => ipcRenderer.invoke('remote:requestFileDelete', opts),
    notifyEditingStart: (opts) => ipcRenderer.invoke('remote:notifyEditingStart', opts),
    notifyEditingEnd: (opts) => ipcRenderer.invoke('remote:notifyEditingEnd', opts),
    requestEditingList: () => ipcRenderer.invoke('remote:requestEditingList'),
    // 事件监听 (单订阅: 重复调用先移除旧 listener, 避免累积)
    onEvent: (callback) => {
      if (api.remote.__eventListener) ipcRenderer.removeListener('remote:event', api.remote.__eventListener);
      api.remote.__eventListener = (event, type, data) => callback(type, data);
      ipcRenderer.on('remote:event', api.remote.__eventListener);
    },
    removeEventListeners: () => {
      ipcRenderer.removeAllListeners('remote:event');
      api.remote.__eventListener = null;
    },
  };

  // AI 制作 (onChunk/onDone/onError 均单订阅)
  api.ai = {
    getUserDataPath: function() { return ipcRenderer.invoke('ai:getUserDataPath'); },
    loadPrompts: function() { return ipcRenderer.invoke('ai:loadPrompts'); },
    saveUserPrompt: function(name, content) { return ipcRenderer.invoke('ai:saveUserPrompt', name, content); },
    deleteUserPrompt: function(name) { return ipcRenderer.invoke('ai:deleteUserPrompt', name); },
    chat: function(config, messages) {
      return ipcRenderer.invoke('ai:chat', {
        endpoint: config.endpoint,
        model: config.model,
        apiKey: config.apiKey,
        messages: messages,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      });
    },
    onChunk: function(callback) {
      if (api.ai.__chunkListener) ipcRenderer.removeListener('ai:chunk', api.ai.__chunkListener);
      api.ai.__chunkListener = function(event, chunk) { callback(chunk); };
      ipcRenderer.on('ai:chunk', api.ai.__chunkListener);
    },
    onDone: function(callback) {
      if (api.ai.__doneListener) ipcRenderer.removeListener('ai:done', api.ai.__doneListener);
      api.ai.__doneListener = function(event, content) { callback(content); };
      ipcRenderer.on('ai:done', api.ai.__doneListener);
    },
    onError: function(callback) {
      if (api.ai.__errorListener) ipcRenderer.removeListener('ai:error', api.ai.__errorListener);
      api.ai.__errorListener = function(event, errMsg) { callback(errMsg); };
      ipcRenderer.on('ai:error', api.ai.__errorListener);
    },
    removeListeners: function() {
      ipcRenderer.removeAllListeners('ai:chunk');
      ipcRenderer.removeAllListeners('ai:done');
      ipcRenderer.removeAllListeners('ai:error');
      api.ai.__chunkListener = null;
      api.ai.__doneListener = null;
      api.ai.__errorListener = null;
    },
  };

  contextBridge.exposeInMainWorld('electronAPI', api);

  console.log('[PRELOAD] electronAPI exposed with methods:', Object.keys(api));
  console.log('[PRELOAD] Preload script completed');
} catch (error) {
  console.error('[PRELOAD] ERROR in preload script:', error);
  console.error('[PRELOAD] Error stack:', error.stack);
}