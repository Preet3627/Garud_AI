const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  clipboard,
  desktopCapturer,
  systemPreferences,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { exec, execFile, spawn } = require('child_process');
const { Client } = require('ssh2');
const Bonjour = require('bonjour-service').default;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
const bonjour = new Bonjour();
let activeSpeechProcess = null;
let pipecatBridgeProcess = null;
let pipecatBridgePort = null;
let pipecatBridgeStartPromise = null;
let pipecatBridgeLogs = [];

function getPipecatScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'pipecat_bridge.py');
  }
  return path.join(__dirname, 'pipecat_bridge.py');
}

function resolvePipecatPythonPath(requestedPath = '') {
  const trimmed = String(requestedPath || '').trim();
  if (trimmed) {
    return trimmed;
  }

  const bundledPath = '/Users/sandipkumarpatel/Developer/Projects/pipecat/.venv/bin/python';
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return 'python3';
}

function resolvePipecatRepoPath(requestedPath = '') {
  const trimmed = String(requestedPath || '').trim();
  if (trimmed) {
    return trimmed;
  }

  return '/Users/sandipkumarpatel/Developer/Projects/pipecat';
}

function stopPipecatBridge() {
  if (pipecatBridgeProcess) {
    try {
      pipecatBridgeProcess.kill('SIGTERM');
    } catch {}
  }

  pipecatBridgeProcess = null;
  pipecatBridgePort = null;
  pipecatBridgeStartPromise = null;
}

async function pingPipecatBridge(port) {
  if (!port) {
    return null;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) {
      throw new Error(`Bridge health check failed with ${response.status}`);
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function ensurePipecatBridge(config = {}) {
  const repoPath = resolvePipecatRepoPath(config.repoPath);
  const pythonPath = resolvePipecatPythonPath(config.pythonPath);
  const scriptPath = getPipecatScriptPath();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Pipecat bridge script not found at ${scriptPath}`);
  }

  if (!fs.existsSync(repoPath)) {
    throw new Error(`Pipecat repository not found at ${repoPath}`);
  }

  if (pipecatBridgeProcess && pipecatBridgePort) {
    const health = await pingPipecatBridge(pipecatBridgePort);
    if (health) {
      return { port: pipecatBridgePort, health, repoPath, pythonPath, scriptPath };
    }
    stopPipecatBridge();
  }

  if (pipecatBridgeStartPromise) {
    return pipecatBridgeStartPromise;
  }

  pipecatBridgeStartPromise = new Promise((resolve, reject) => {
    let settled = false;
    pipecatBridgeLogs = [];

    const bridgeProcess = spawn(
      pythonPath,
      [scriptPath, 'serve', '--repo-path', repoPath, '--port', '0'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const finalizeReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      pipecatBridgeStartPromise = null;
      stopPipecatBridge();
      reject(error);
    };

    const readyTimeout = setTimeout(() => {
      finalizeReject(new Error(`Timed out starting Pipecat bridge. ${pipecatBridgeLogs.slice(-5).join(' | ')}`));
    }, 15000);

    pipecatBridgeProcess = bridgeProcess;

    const stdout = readline.createInterface({ input: bridgeProcess.stdout });
    stdout.on('line', async (line) => {
      pipecatBridgeLogs.push(line);

      try {
        const payload = JSON.parse(line);
        if (payload.event === 'ready' && payload.port) {
          pipecatBridgePort = payload.port;
          const health = await pingPipecatBridge(pipecatBridgePort);
          if (!health) {
            clearTimeout(readyTimeout);
            finalizeReject(new Error('Pipecat bridge started but did not pass health checks.'));
            return;
          }

          if (!settled) {
            settled = true;
            clearTimeout(readyTimeout);
            pipecatBridgeStartPromise = null;
            resolve({ port: pipecatBridgePort, health, repoPath, pythonPath, scriptPath });
          }
        }
      } catch {}
    });

    bridgeProcess.stderr.on('data', (chunk) => {
      pipecatBridgeLogs.push(String(chunk).trim());
    });

    bridgeProcess.once('error', (error) => {
      clearTimeout(readyTimeout);
      finalizeReject(error);
    });

    bridgeProcess.once('exit', (code, signal) => {
      clearTimeout(readyTimeout);
      if (pipecatBridgeProcess === bridgeProcess) {
        pipecatBridgeProcess = null;
        pipecatBridgePort = null;
      }
      if (!settled) {
        finalizeReject(
          new Error(`Pipecat bridge exited before becoming ready (${signal || code || 'unknown'}). ${pipecatBridgeLogs.slice(-5).join(' | ')}`)
        );
      }
    });
  });

  return pipecatBridgeStartPromise;
}

async function callPipecatBridge(route, config = {}, payload = {}) {
  const { port } = await ensurePipecatBridge(config);
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || `Pipecat bridge request failed with ${response.status}`);
  }

  return body;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 900,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: true,
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#00000000',
    title: 'Garud AI Robot',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile('dist/index.html');
  }
}

function runExec(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout,
        stderr,
        error: error ? error.message : null,
      });
    });
  });
}

function runExecFile(file, args = []) {
  return new Promise((resolve) => {
    execFile(file, args, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout,
        stderr,
        error: error ? error.message : null,
      });
    });
  });
}

function stopSystemSpeech() {
  if (!activeSpeechProcess) {
    return false;
  }

  try {
    activeSpeechProcess.kill('SIGTERM');
  } catch {}

  activeSpeechProcess = null;
  return true;
}

async function listSystemVoices() {
  if (process.platform !== 'darwin') {
    return [];
  }

  const result = await runExecFile('say', ['-v', '?']);
  if (!result.success) {
    throw new Error(result.error || result.stderr || 'Could not list system voices');
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#\s+(.*)$/);
      if (!match) {
        return null;
      }

      return {
        name: match[1].trim(),
        locale: match[2].trim(),
        sample: match[3].trim(),
      };
    })
    .filter(Boolean);
}

async function runAppleScript(script) {
  const result = await runExecFile('osascript', ['-e', script]);
  if (!result.success) {
    throw new Error(result.error || result.stderr || 'AppleScript execution failed');
  }
  return result.stdout.trim();
}

async function runSwiftAutomation(payload) {
  const script = `
import Foundation
import CoreGraphics

guard let payloadArg = CommandLine.arguments.last,
      let payloadData = payloadArg.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
      let action = payload["action"] as? String else {
  fputs("Invalid payload\\n", stderr)
  exit(1)
}

func mouseButton(_ value: String) -> CGMouseButton {
  value == "right" ? .right : .left
}

func mouseDownType(_ value: String) -> CGEventType {
  value == "right" ? .rightMouseDown : .leftMouseDown
}

func mouseUpType(_ value: String) -> CGEventType {
  value == "right" ? .rightMouseUp : .leftMouseUp
}

switch action {
case "mouseClick":
  let x = (payload["x"] as? NSNumber)?.doubleValue ?? 0
  let y = (payload["y"] as? NSNumber)?.doubleValue ?? 0
  let buttonName = payload["button"] as? String ?? "left"
  let clickCount = max((payload["clickCount"] as? NSNumber)?.intValue ?? 1, 1)
  let point = CGPoint(x: x, y: y)
  let button = mouseButton(buttonName)

  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: button)?.post(tap: .cghidEventTap)

  for _ in 0..<clickCount {
    let down = CGEvent(mouseEventSource: nil, mouseType: mouseDownType(buttonName), mouseCursorPosition: point, mouseButton: button)
    let up = CGEvent(mouseEventSource: nil, mouseType: mouseUpType(buttonName), mouseCursorPosition: point, mouseButton: button)
    down?.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
    up?.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
  }
  print("{\\"success\\":true}")
case "keyPress":
  let key = (payload["key"] as? String ?? "").lowercased()
  let mapping: [String: CGKeyCode] = [
    "return": 36,
    "enter": 36,
    "tab": 48,
    "space": 49,
    "delete": 51,
    "escape": 53,
    "esc": 53,
    "left": 123,
    "right": 124,
    "down": 125,
    "up": 126
  ]

  guard let code = mapping[key] else {
    fputs("Unsupported key\\n", stderr)
    exit(1)
  }

  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)?.post(tap: .cghidEventTap)
  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)?.post(tap: .cghidEventTap)
  print("{\\"success\\":true}")
default:
  fputs("Unsupported action\\n", stderr)
  exit(1)
}
`;

  const result = await runExecFile('swift', ['-e', script, '--', JSON.stringify(payload)]);
  if (!result.success) {
    throw new Error(result.error || result.stderr || 'Swift automation failed');
  }
  return result.stdout.trim();
}

async function listInstalledApplications() {
  const appDirectories = [
    '/Applications',
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
  ];
  const seen = new Set();
  const apps = [];

  for (const directory of appDirectories) {
    if (!fs.existsSync(directory)) {
      continue;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
        continue;
      }

      const name = entry.name.replace(/\.app$/, '');
      if (seen.has(name)) {
        continue;
      }

      seen.add(name);
      apps.push({
        name,
        path: path.join(directory, entry.name),
      });
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

async function getScreenState() {
  const displays = screen.getAllDisplays();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });

  return {
    displays: displays.map((display) => ({
      id: display.id,
      label: display.label || `Display ${display.id}`,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      bounds: display.bounds,
      workArea: display.workArea,
    })),
    previews: sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnail: source.thumbnail.toDataURL(),
    })),
  };
}

ipcMain.handle('open-path', async (_event, target) => {
  try {
    if (target.startsWith('http')) {
      await shell.openExternal(target);
    } else {
      await shell.openPath(target);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-application', async (_event, appName) => {
  try {
    const result = await runExecFile('open', ['-a', appName]);
    if (!result.success) {
      throw new Error(result.error || result.stderr || `Could not open ${appName}`);
    }
    return { success: true, appName };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('activate-application', async (_event, appName) => {
  try {
    await runAppleScript(`tell application "${String(appName).replace(/"/g, '\\"')}" to activate`);
    return { success: true, appName };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-applications', async () => {
  try {
    const applications = await listInstalledApplications();
    return { success: true, applications };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

const COMMAND_RISK_TIERS = {
  LOW: ['ls', 'pwd', 'date', 'echo', 'whoami', 'uptime'],
  MEDIUM: ['mkdir', 'touch', 'cp', 'mv', 'cat', 'grep', 'find', 'open'],
  HIGH: ['rm', 'sudo', 'chmod', 'chown', 'ssh', 'curl', 'wget', 'kill', 'pkill', 'format', 'dd'],
};

function getCommandRisk(command) {
  const baseCmd = command.trim().split(' ')[0].toLowerCase();
  if (
    COMMAND_RISK_TIERS.HIGH.includes(baseCmd) ||
    command.includes('|') ||
    command.includes('>') ||
    command.includes('&')
  ) {
    return 'HIGH';
  }
  if (COMMAND_RISK_TIERS.MEDIUM.includes(baseCmd)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

async function verifyUserIdentity(reason) {
  if (process.platform === 'darwin') {
    try {
      const canPrompt = systemPreferences.canPromptTouchID();
      if (canPrompt) {
        await systemPreferences.promptTouchID(reason);
        return true;
      }
    } catch (error) {
      console.log('Touch ID failed or unavailable, falling back to OS dialog');
    }
  }

  return true;
}

ipcMain.handle('execute-command', async (_event, command) => {
  const risk = getCommandRisk(command);

  if (risk === 'HIGH') {
    const verified = await verifyUserIdentity(`Approve high-risk command: ${command}`);
    if (!verified) {
      return { success: false, error: 'User denied authentication' };
    }
  }

  const finalCommand =
    process.platform === 'win32' && risk === 'HIGH'
      ? `powershell -Command "Start-Process cmd -ArgumentList '/c ${command}' -Verb RunAs"`
      : command;

  const result = await runExec(finalCommand);
  return {
    ...result,
    risk,
  };
});

async function checkCameraPermissions() {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('camera');
    if (status !== 'granted') {
      await systemPreferences.askForMediaAccess('camera');
    }
  }
}

ipcMain.handle('read-clipboard', async () => clipboard.readText());

ipcMain.handle('write-clipboard', async (_event, text) => {
  clipboard.writeText(text);
  return { success: true };
});

ipcMain.handle('tts-list-voices', async () => {
  try {
    const voices = await listSystemVoices();
    return { success: true, voices };
  } catch (error) {
    return { success: false, error: error.message, voices: [] };
  }
});

ipcMain.handle('tts-stop', async () => {
  const stopped = stopSystemSpeech();
  return { success: true, stopped };
});

ipcMain.handle('pipecat-status', async (_event, config = {}) => {
  const repoPath = resolvePipecatRepoPath(config.repoPath);
  const pythonPath = resolvePipecatPythonPath(config.pythonPath);
  const scriptPath = getPipecatScriptPath();

  const running = Boolean(pipecatBridgeProcess && pipecatBridgePort);
  const health = running ? await pingPipecatBridge(pipecatBridgePort) : null;

  return {
    success: true,
    running: Boolean(health),
    port: health ? pipecatBridgePort : null,
    repoPath,
    pythonPath,
    scriptPath,
    health,
    logs: pipecatBridgeLogs.slice(-10),
  };
});

ipcMain.handle('pipecat-start', async (_event, config = {}) => {
  try {
    const state = await ensurePipecatBridge(config);
    return {
      success: true,
      running: true,
      port: state.port,
      repoPath: state.repoPath,
      pythonPath: state.pythonPath,
      scriptPath: state.scriptPath,
      health: state.health,
    };
  } catch (error) {
    return { success: false, error: error.message, logs: pipecatBridgeLogs.slice(-10) };
  }
});

ipcMain.handle('pipecat-stop', async () => {
  stopPipecatBridge();
  return { success: true };
});

ipcMain.handle('pipecat-transcribe', async (_event, payload = {}) => {
  try {
    const config = {
      repoPath: payload.repoPath,
      pythonPath: payload.pythonPath,
    };
    const result = await callPipecatBridge('/transcribe', config, payload);
    return result;
  } catch (error) {
    return { success: false, error: error.message, logs: pipecatBridgeLogs.slice(-10) };
  }
});

ipcMain.handle('pipecat-synthesize', async (_event, payload = {}) => {
  try {
    const config = {
      repoPath: payload.repoPath,
      pythonPath: payload.pythonPath,
    };
    const result = await callPipecatBridge('/synthesize', config, payload);
    return result;
  } catch (error) {
    return { success: false, error: error.message, logs: pipecatBridgeLogs.slice(-10) };
  }
});

ipcMain.handle('tts-speak', async (_event, payload = {}) => {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'System TTS is currently implemented for macOS only.' };
  }

  const text = String(payload.text || '').trim();
  const voice = String(payload.voice || '').trim();
  const rate = Number(payload.rate);

  if (!text) {
    return { success: true, skipped: true };
  }

  stopSystemSpeech();

  return new Promise((resolve) => {
    const args = [];

    if (voice) {
      args.push('-v', voice);
    }

    if (Number.isFinite(rate) && rate > 0) {
      args.push('-r', String(Math.round(rate)));
    }

    args.push(text);

    const speechProcess = spawn('say', args, { stdio: 'ignore' });
    activeSpeechProcess = speechProcess;

    speechProcess.once('error', (error) => {
      if (activeSpeechProcess === speechProcess) {
        activeSpeechProcess = null;
      }
      resolve({ success: false, error: error.message || 'System speech failed to start.' });
    });

    speechProcess.once('exit', (code, signal) => {
      if (activeSpeechProcess === speechProcess) {
        activeSpeechProcess = null;
      }

      if (signal === 'SIGTERM') {
        resolve({ success: true, stopped: true });
        return;
      }

      if (code === 0) {
        resolve({ success: true });
        return;
      }

      resolve({ success: false, error: `System speech exited with code ${code ?? 'unknown'}.` });
    });
  });
});

ipcMain.handle('take-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
    throw new Error('No screen sources found');
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('get-screen-state', async () => {
  try {
    return await getScreenState();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mouse-click', async (_event, payload) => {
  try {
    await runSwiftAutomation({ action: 'mouseClick', ...payload });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('type-text', async (_event, text) => {
  try {
    const escapedText = String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    await runAppleScript(`tell application "System Events" to keystroke "${escapedText}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('press-key', async (_event, key) => {
  try {
    const normalized = String(key).trim().toLowerCase();
    const combo = normalized.split('+').map((part) => part.trim()).filter(Boolean);

    if (combo.length > 1) {
      const modifiers = combo.slice(0, -1);
      const finalKey = combo[combo.length - 1];
      const modifierTokens = modifiers
        .map((modifier) => {
          if (modifier === 'cmd' || modifier === 'command') return 'command down';
          if (modifier === 'ctrl' || modifier === 'control') return 'control down';
          if (modifier === 'opt' || modifier === 'option' || modifier === 'alt') return 'option down';
          if (modifier === 'shift') return 'shift down';
          return null;
        })
        .filter(Boolean);

      const quotedKey = finalKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await runAppleScript(
        `tell application "System Events" to keystroke "${quotedKey}" using {${modifierTokens.join(', ')}}`
      );
      return { success: true };
    }

    await runSwiftAutomation({ action: 'keyPress', key: normalized });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-identity', async (_event, reason) => verifyUserIdentity(reason));

ipcMain.handle('check-camera-permissions', async () => {
  await checkCameraPermissions();
  return { success: true };
});

ipcMain.handle('list-directory', async (_event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.on('start-discovery', () => {
  console.log('Starting robot discovery...');
  bonjour.find({ type: 'http' }, (service) => {
    if (service.name.toLowerCase().includes('garud')) {
      mainWindow.webContents.send('robot-discovered', service.addresses[0]);
    }
  });
});

async function runSSHCommand(config, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let output = '';
          stream
            .on('close', () => {
              conn.end();
              resolve(output);
            })
            .on('data', (data) => {
              output += data;
            })
            .stderr.on('data', (data) => {
              output += data;
            });
        });
      })
      .on('error', reject)
      .connect(config);
  });
}

ipcMain.handle('start-robot-server', async (_event, config) => {
  try {
    await runSSHCommand(config, 'nohup python3 ~/garud_ai_robot/main.py > ~/robot.log 2>&1 &');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-robot-server', async (_event, config) => {
  try {
    await runSSHCommand(config, 'pkill -f main.py');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopSystemSpeech();
  stopPipecatBridge();
  if (process.platform !== 'darwin') app.quit();
});
