const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  quitApp: () => ipcRenderer.invoke("app:quit"),
});
