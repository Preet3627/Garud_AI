const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Discovery
  onRobotDiscovered: (callback) => ipcRenderer.on('robot-discovered', (event, ip) => callback(ip)),
  startDiscovery: () => ipcRenderer.send('start-discovery'),

  // Deployment & Execution
  deployToRobot: (config) => ipcRenderer.invoke('deploy-to-robot', config),
  startRobotServer: (config) => ipcRenderer.invoke('start-robot-server', config),
  stopRobotServer: (config) => ipcRenderer.invoke('stop-robot-server', config),
});
