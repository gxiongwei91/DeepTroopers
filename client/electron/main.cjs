const { app, BrowserWindow, dialog } = require('electron');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = app.getAppPath();
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

let staticServer;

function createStaticServer() {
  return http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let filePath = path.resolve(root, relativePath);
      const relativeToRoot = path.relative(root, filePath);
      if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      let info = await fs.stat(filePath);
      if (info.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        info = await fs.stat(filePath);
      }

      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        'Content-Length': info.size,
        'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(content);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

async function startStaticServer() {
  staticServer = createStaticServer();
  await new Promise((resolve, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', resolve);
  });
  const address = staticServer.address();
  return `http://127.0.0.1:${address.port}/`;
}

async function createWindow() {
  const url = await startStaticServer();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b100f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Prototype failed to load (${code}): ${description}`);
  });
  await window.loadURL(url);
}

app.whenReady().then(createWindow).catch(async error => {
  console.error(error);
  await dialog.showMessageBox({
    type: 'error',
    title: 'DeepTroopers 启动失败',
    message: '无法启动本地游戏窗口。',
    detail: error.message
  });
  app.quit();
});

app.on('window-all-closed', () => {
  staticServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => staticServer?.close());
