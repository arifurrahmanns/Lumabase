"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      electron.ipcRenderer.on(channel, listener);
      return () => electron.ipcRenderer.removeListener(channel, listener);
    }
  }
});
