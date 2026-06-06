// background.js — service worker, routes messages between popup and content script

let popupPort = null;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'popup') {
    popupPort = port;
    port.onDisconnect.addListener(() => { popupPort = null; });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender) => {
  // Forward content script messages to popup
  if (['STATUS', 'PROGRESS', 'DONE', 'ERROR'].includes(msg.type)) {
    if (popupPort) popupPort.postMessage(msg);
  }
});
