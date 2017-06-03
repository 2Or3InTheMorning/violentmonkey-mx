import 'src/common/browser';
import { inject, objEncode, getUniqId, sendMessage } from './utils';
import { onNotificationClick, onNotificationClose } from './notification';
import { httpRequested } from './requests';
import { tabClosed } from './tabs';
import bridge from './content';
import webBridgeObj from './web';

(function main() {
  // Ignore XML, etc.
  if (document.documentElement.tagName.toLowerCase() !== 'html') return;

  // Avoid running repeatedly due to new `document.documentElement`
  if (window.VM) return;
  window.VM = 1;

  const badge = {
    number: 0,
    ready: false,
  };
  function updateBadge() {
    sendMessage({ cmd: 'GetBadge' });
  }
  function setBadge(tabId) {
    if (badge.ready) {
      // XXX: only scripts run in top level window are counted
      if (top === window) {
        sendMessage({
          cmd: 'SetBadge',
          data: {
            tabId,
            number: badge.number,
          },
        });
      }
    }
  }
  window.setBadge = setBadge;

  browser.__isContent = true;

  // Messages
  browser.runtime.onMessage.addListener((req, src) => {
    const handlers = {
      Command(data) {
        bridge.post({ cmd: 'Command', data });
      },
      HttpRequested: httpRequested,
      TabClosed: tabClosed,
      UpdateValues(data) {
        bridge.post({ cmd: 'UpdateValues', data });
      },
      NotificationClick: onNotificationClick,
      NotificationClose: onNotificationClose,
    };
    const handle = handlers[req.cmd];
    if (handle) handle(req.data, src);
  });

  function initWeb(webBridge, webId, contentId, props) {
    webBridge.initialize(webId, contentId, props);
    document.addEventListener('DOMContentLoaded', () => {
      webBridge.state = 1;
      webBridge.load();
    }, false);
    webBridge.checkLoad();
  }
  function initBridge() {
    const contentId = getUniqId();
    const webId = getUniqId();
    const args = [
      objEncode(webBridgeObj),
      JSON.stringify(webId),
      JSON.stringify(contentId),
      JSON.stringify(Object.getOwnPropertyNames(window)),
    ];
    inject(`(${initWeb.toString()})(${args.join(',')})`);
    bridge.initialize(contentId, webId);
    sendMessage({ cmd: 'GetInjected', data: location.href })
    .then(data => {
      bridge.forEach(data.scripts, script => {
        bridge.ids.push(script.id);
        if (script.enabled) badge.number += 1;
      });
      bridge.post({ cmd: 'LoadScripts', data });
      badge.ready = true;
      bridge.getPopup();
      updateBadge();
    });
  }
  initBridge();

  // For installation
  function checkJS() {
    if (!document.querySelector('title')) {
      // plain text
      sendMessage({
        cmd: 'ConfirmInstall',
        data: {
          code: document.body.textContent,
          url: location.href,
          from: document.referrer,
        },
      })
      .then(() => {
        if (history.length > 1) history.go(-1);
        else sendMessage({ cmd: 'TabClose' });
      });
    }
  }
  if (!(/^file:\/\/\//.test(location.href)) && /\.user\.js$/.test(location.pathname)) {
    if (document.readyState === 'complete') checkJS();
    else window.addEventListener('load', checkJS, false);
  }
}());
