"use strict";
(() => {
  const report = message => {
    const node = document.getElementById("wallpaper-error");
    if (node) {node.textContent = message; node.hidden = false;}
  };
  window.addEventListener("error", event => {
    if (event.target instanceof HTMLElement && event.target !== window) {
      const name = event.target.getAttribute("src") || event.target.getAttribute("href") || event.target.tagName;
      // Telemetry is optional. Missing installation-specific configuration
      // leaves the scene available and the live values offline.
      if (name === "telemetry-config.local.js") return;
      report(`素材加载失败：${name}`);
    } else if (event.message) {report(`壁纸脚本异常：${event.message}`);}
  }, true);
})();
