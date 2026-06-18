import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
});
