const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const https = require('https');

let win;
let serverStarted = false;

// ── Config ──
const configFile = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch { return {}; }
}
function writeConfig(data) {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
}

// ── Louvores path resolution ──
const LOUVORES_DOWNLOAD_URL =
  'https://github.com/PedroA07/ICM-Louvores/releases/download/v1.0.0/louvores.zip';

function findLouvoresPath() {
  const cfg = readConfig();
  if (cfg.louvoresPath && fs.existsSync(cfg.louvoresPath)) return cfg.louvoresPath;

  // Downloaded via app
  const downloaded = path.join(app.getPath('userData'), 'louvores', 'Material para ensaio');
  if (fs.existsSync(downloaded)) {
    writeConfig({ louvoresPath: downloaded });
    return downloaded;
  }

  // Packaged: next to exe
  const execDir = path.dirname(app.getPath('exe'));
  const candidates = [
    path.join(execDir, 'louvores', 'Material para ensaio'),
    path.join(execDir, '..', 'louvores', 'Material para ensaio'),
    path.join(__dirname, 'louvores', 'Material para ensaio'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) { writeConfig({ louvoresPath: found }); return found; }

  return null;
}

// ── Send progress to loading window ──
function sendProgress(data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('progress', data);
  }
}

// ── HTTPS GET with redirect following ──
function httpsGetFollow(url, cb, redirects = 10) {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;
  const req = client.get(url, { headers: { 'User-Agent': 'ICM-Louvores/1.0' } }, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)
        && res.headers.location && redirects > 0) {
      res.resume();
      httpsGetFollow(res.headers.location, cb, redirects - 1);
    } else {
      cb(null, res);
    }
  });
  req.on('error', (err) => cb(err));
}

// ── Download louvores zip ──
async function downloadLouvores() {
  const destDir = path.join(app.getPath('userData'), 'louvores');
  const zipPath = path.join(app.getPath('temp'), 'louvores_icm.zip');
  fs.mkdirSync(destDir, { recursive: true });

  sendProgress({ phase: 'download', percent: 0, status: 'Conectando ao servidor…' });

  // Download
  await new Promise((resolve, reject) => {
    httpsGetFollow(LOUVORES_DOWNLOAD_URL, (err, res) => {
      if (err) return reject(err);
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} ao baixar louvores`));
      }

      const total = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;
      let lastPct = -1;

      const file = fs.createWriteStream(zipPath);

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        const pct = total ? Math.round((downloaded / total) * 100) : -1;
        if (pct !== lastPct) {
          lastPct = pct;
          const mb    = (downloaded / 1048576).toFixed(0);
          const total2 = total ? `${(total / 1048576).toFixed(0)} MB` : '?';
          sendProgress({
            phase: 'download',
            percent: pct,
            status: `Baixando louvores… ${mb} MB / ${total2}`,
          });
        }
      });

      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
      file.on('error', reject);
      res.on('error', reject);
    });
  });

  // Extract
  sendProgress({ phase: 'extract', percent: -1, status: 'Extraindo arquivos… (pode levar alguns minutos)' });
  const extract = require('extract-zip');
  await extract(zipPath, { dir: destDir });

  // Cleanup
  try { fs.unlinkSync(zipPath); } catch {}

  return path.join(destDir, 'Material para ensaio');
}

// ── Start Express server ──
function startServer(louvoresPath) {
  if (serverStarted) return;
  serverStarted = true;
  process.env.LOUVORES_PATH = louvoresPath;
  process.env.PORT = '3131';
  require('./server.js');
}

// ── Poll until server is ready ──
function waitForServer(url, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http.get(url, res => {
        if (res.statusCode < 500) resolve();
        else setTimeout(check, 400);
      }).on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 400);
      });
    }
    check();
  });
}

// ── Create window ──
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'ICM Louvores',
    backgroundColor: '#0D0304',
    icon: path.join(__dirname, 'public', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Alterar pasta dos louvores…',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              title: 'Selecione a pasta dos Louvores',
              buttonLabel: 'Usar esta pasta',
              properties: ['openDirectory'],
            });
            if (!canceled && filePaths[0]) {
              writeConfig({ louvoresPath: filePaths[0] });
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Pasta alterada',
                message: 'Reinicie o aplicativo para carregar os louvores da nova pasta.',
                buttons: ['Reiniciar agora', 'Depois'],
              }).then(({ response }) => {
                if (response === 0) { app.relaunch(); app.exit(); }
              });
            }
          }
        },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Recarregar', accelerator: 'F5', click: () => win.reload() },
        { label: 'Tela cheia', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        { label: 'Ferramentas do desenvolvedor', accelerator: 'F12', click: () => win.webContents.toggleDevTools() },
      ]
    }
  ]));

  win.loadFile(path.join(__dirname, 'public', 'loading.html'));
  win.show();
}

// ── App lifecycle ──
app.whenReady().then(async () => {
  createWindow();

  let louvoresPath = findLouvoresPath();

  if (!louvoresPath) {
    try {
      louvoresPath = await downloadLouvores();
      writeConfig({ louvoresPath });
    } catch (err) {
      // Fallback: ask user for folder
      const { response } = await dialog.showMessageBox(win, {
        type: 'error',
        title: 'Falha no download',
        message: `Não foi possível baixar os louvores automaticamente.\n\n${err.message}\n\nDeseja selecionar a pasta manualmente?`,
        buttons: ['Selecionar pasta', 'Sair'],
      });
      if (response === 1) { app.quit(); return; }

      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Selecione a pasta dos Louvores',
        buttonLabel: 'Usar esta pasta',
        properties: ['openDirectory'],
        message: 'Selecione a pasta "Material para ensaio"',
      });
      if (canceled || !filePaths[0]) { app.quit(); return; }
      louvoresPath = filePaths[0];
      writeConfig({ louvoresPath });
    }
  }

  sendProgress({ phase: 'server', percent: -1, status: 'Iniciando servidor…' });
  startServer(louvoresPath);

  waitForServer('http://localhost:3131/api/catalog')
    .then(() => {
      if (win && !win.isDestroyed()) win.loadURL('http://localhost:3131');
    })
    .catch(() => {
      dialog.showErrorBox('Erro', 'Não foi possível iniciar o servidor. Tente reiniciar o app.');
    });
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) app.quit(); });

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://localhost')) shell.openExternal(url);
    return { action: 'deny' };
  });
});
