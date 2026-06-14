const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPipecatBridgeStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('pipecat-bridge-status', handler);
    return () => ipcRenderer.removeListener('pipecat-bridge-status', handler);
  },
  // Discovery
  onRobotDiscovered: (callback) => ipcRenderer.on('robot-discovered', (event, ip) => callback(ip)),
  startDiscovery: () => ipcRenderer.send('start-discovery'),

  // Deployment & Execution
  deployToRobot: (config) => ipcRenderer.invoke('deploy-to-robot', config),
  startRobotServer: (config) => ipcRenderer.invoke('start-robot-server', config),
  stopRobotServer: (config) => ipcRenderer.invoke('stop-robot-server', config),

  // Computer Use
  openPath: (target) => ipcRenderer.invoke('open-path', target),
  openApplication: (appName) => ipcRenderer.invoke('open-application', appName),
  activateApplication: (appName) => ipcRenderer.invoke('activate-application', appName),
  listApplications: () => ipcRenderer.invoke('list-applications'),
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  listSystemVoices: () => ipcRenderer.invoke('tts-list-voices'),
  speakText: (payload) => ipcRenderer.invoke('tts-speak', payload),
  stopTts: () => ipcRenderer.invoke('tts-stop'),
  getPipecatStatus: (payload) => ipcRenderer.invoke('pipecat-status', payload),
  startPipecatBridge: (payload) => ipcRenderer.invoke('pipecat-start', payload),
  stopPipecatBridge: () => ipcRenderer.invoke('pipecat-stop'),
  transcribePipecatAudio: (payload) => ipcRenderer.invoke('pipecat-transcribe', payload),
  synthesizePipecatSpeech: (payload) => ipcRenderer.invoke('pipecat-synthesize', payload),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getScreenState: () => ipcRenderer.invoke('get-screen-state'),
  mouseClick: (payload) => ipcRenderer.invoke('mouse-click', payload),
  typeText: (text) => ipcRenderer.invoke('type-text', text),
  pressKey: (key) => ipcRenderer.invoke('press-key', key),
  listDirectory: (path) => ipcRenderer.invoke('list-directory', path),
  checkCameraPermissions: () => ipcRenderer.invoke('check-camera-permissions'),
  verifyIdentity: (reason) => ipcRenderer.invoke('verify-identity', reason),
});
