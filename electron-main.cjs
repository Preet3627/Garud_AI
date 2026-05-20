const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client } = require('ssh2');
const Bonjour = require('bonjour-service').default;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
const bonjour = new Bonjour();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 900,
    vibrancy: 'under-window', // macOS native blur
    visualEffectState: 'active',
    transparent: true,
    frame: true, // Keep standard frame for simplicity, or set to false for custom
    titleBarStyle: 'hiddenInset', // Better for macOS
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#00000000', // Fully transparent
    title: 'Garud AI Robot',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile('dist/index.html');
  }
}

// --- Robot Discovery ---
ipcMain.on('start-discovery', () => {
  console.log('Starting robot discovery...');
  bonjour.find({ type: 'http' }, (service) => {
    if (service.name.toLowerCase().includes('garud')) {
      mainWindow.webContents.send('robot-discovered', service.addresses[0]);
    }
  });
});

// --- Remote Execution ---
async function runSSHCommand(config, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('close', () => {
          conn.end();
          resolve(output);
        }).on('data', (data) => output += data)
          .stderr.on('data', (data) => output += data);
      });
    }).on('error', reject).connect(config);
  });
}

ipcMain.handle('start-robot-server', async (event, config) => {
  try {
    await runSSHCommand(config, 'nohup python3 ~/garud_ai_robot/main.py > ~/robot.log 2>&1 &');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-robot-server', async (event, config) => {
  try {
    await runSSHCommand(config, 'pkill -f main.py');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
