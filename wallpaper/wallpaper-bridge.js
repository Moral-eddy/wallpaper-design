"use strict";
window.WALLPAPER_LOCAL_MODE = true;
(() => {
  const configuration = window.WALLPAPER_TELEMETRY;
  const allowed = new Set(["/api/v1/snapshot", "/api/v1/audio", "/api/v1/info"]);
  window.wallpaperFetch = (path, options = {}) => {
    if (!allowed.has(path) || (options.method ?? "GET").toUpperCase() !== "GET") {
      return Promise.reject(new Error("壁纸只读取数据；请在采集器配置页修改来源"));
    }
    if (!configuration?.key) {
      return Promise.reject(new Error("请先运行 setup-telemetry.ps1 生成读取配置"));
    }
    const base = new URL(configuration.base);
    if (base.protocol !== "http:" || base.hostname !== "127.0.0.1") {
      return Promise.reject(new Error("采集器必须使用本地回环地址"));
    }
    const headers = new Headers(options.headers);
    headers.set("X-Wallpaper-Read-Key", configuration.key);
    return fetch(base.origin + path, {...options, method: "GET", headers, mode: "cors", credentials: "omit"});
  };
})();
