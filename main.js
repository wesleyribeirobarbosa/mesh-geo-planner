const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    // Carrega o build do React
    mainWindow.loadFile(path.join(__dirname, 'client', 'build', 'index.html'));

    mainWindow.on('closed', function () {
        mainWindow = null;
        if (backendProcess) backendProcess.kill();
    });
}

app.on('ready', () => {
    // Inicia o backend Node.js como processo filho
    backendProcess = spawn('node', ['api.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
    });

    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
    if (backendProcess) backendProcess.kill();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
}); 