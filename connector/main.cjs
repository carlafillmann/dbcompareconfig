const { app, Menu, Tray, dialog, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const siteUrl = 'https://dbcompareconf.web.app';
const apiUrl = 'http://127.0.0.1:3333/api/health';
let apiProcess;
let tray;
let startedByConnector = false;

function isApiAvailable() {
  return new Promise(resolve => {
    const request = http.get(apiUrl, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(1500, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function apiEntry() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'connector', 'server', 'index.js')
    : path.join(__dirname, 'server', 'index.js');
}

function updateTray(online) {
  if (!tray) return;
  tray.setToolTip(online ? 'DBCompare Connector — API local ativa' : 'DBCompare Connector — iniciando API local');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: online ? 'API local ativa (127.0.0.1:3333)' : 'Iniciando API local…', enabled: false },
    { type: 'separator' },
    { label: 'Abrir DBCompare', click: () => shell.openExternal(siteUrl) },
    { label: 'Reiniciar API local', click: restartApi },
    { type: 'separator' },
    { label: 'Sair do Connector', click: () => app.quit() },
  ]));
}

function startApi() {
  const log = fs.createWriteStream(path.join(app.getPath('userData'), 'api.log'), { flags: 'a' });
  apiProcess = fork(apiEntry(), [], {
    cwd: path.dirname(apiEntry()),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '3333', ELECTRON_RUN_AS_NODE: '1' },
    silent: true,
  });
  startedByConnector = true;
  apiProcess.stdout?.pipe(log);
  apiProcess.stderr?.pipe(log);
  apiProcess.on('exit', code => {
    apiProcess = undefined;
    if (!app.isQuitting && code !== 0) {
      updateTray(false);
      dialog.showErrorBox('DBCompare Connector', 'A API local foi encerrada inesperadamente. Consulte o arquivo api.log na pasta de dados do aplicativo.');
    }
  });
}

async function ensureApi() {
  updateTray(false);
  if (!(await isApiAvailable())) startApi();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await isApiAvailable()) return updateTray(true);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  updateTray(false);
  dialog.showErrorBox('DBCompare Connector', 'Não foi possível iniciar a API local. Consulte o arquivo api.log na pasta de dados do aplicativo.');
}

async function restartApi() {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = undefined;
  }
  await ensureApi();
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) return app.quit();
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  tray = new Tray(path.join(__dirname, '..', 'assets', 'under-construction.png'));
  tray.on('double-click', () => shell.openExternal(siteUrl));
  await ensureApi();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (startedByConnector && apiProcess) apiProcess.kill();
});
