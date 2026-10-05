"use strict";
(() => {
  const NS = "http://www.w3.org/2000/svg", $ = id => document.getElementById(id);
  const panes = new Map([...document.querySelectorAll('.native-pane')].map(node => [node.dataset.window, node]));
  // Keep the approved anchors, while distinguishing firmware CPU temperature
  // from HWiNFO's explicitly named CPU Package measurement.
  for (const node of document.querySelectorAll('[data-field="cpu.packageTemperatureC"]')) node.dataset.field = 'cpu.temperatureC';
  for (const node of document.querySelectorAll('[data-field="history.cpuPackageTemperature"]')) node.dataset.field = 'history.cpuTemperature';
  for (const node of document.querySelectorAll('[data-dot="history.cpuPackageTemperature"]')) node.dataset.dot = 'history.cpuTemperature';
  const cpuTemperatureLabel = [...panes.get('cpu').querySelectorAll('text')].find(node => node.textContent === 'CPU PACKAGE');
  const measure = document.createElement('canvas').getContext('2d');
  const historyFields = {
    'cpu-trend': 'cpuTotalPercent', 'gpu-trend': 'gpuLoadPercent', 'ram-trend': 'memoryUsedBytes'
  };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = (value, digits = 0) => finite(value) ? value.toFixed(digits) : '—';
  const get = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);
  const element = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  let snapshot = null, info = null, busy = false, connected = false;
  let lastReply = 0, fontsReady = false, timer = null, connectionMessage = false;
  const bytes = (value, rate = false) => {
    if (!finite(value)) return ['—', rate ? 'B/s' : 'B'];
    const units = rate ? ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'] : ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0, n = value;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return [number(n, i === 0 ? 0 : n < 10 ? 2 : 1), units[i]];
  };

  function typeset(node, value) {
    if (node.dataset.value === value && node.dataset.fontReady === String(fontsReady)) return;
    let size = Number(node.dataset.baseSize || node.getAttribute('font-size'));
    const budget = Number(node.dataset.fitBudget || Infinity);
    const widthsFor = current => {
      measure.font = `600 ${current}px "Oxanium"`;
      const cell = Math.max(...[...'0123456789'].map(char => measure.measureText(char).width));
      return [...value].map(char => /\d/.test(char) ? cell : Math.max(current * .16, measure.measureText(char).width));
    };
    let widths = widthsFor(size), total = widths.reduce((sum, width) => sum + width, 0);
    if (total > budget) { size = Math.floor(size * budget / total * 100) / 100; widths = widthsFor(size); }
    total = widths.reduce((sum, width) => sum + width, 0);
    const anchor = node.getAttribute('text-anchor'), x = Number(node.getAttribute('x'));
    let left = x - (anchor === 'end' ? total : anchor === 'middle' ? total / 2 : 0);
    node.replaceChildren();
    node.setAttribute('font-size', size);
    node.dataset.fittedSize = size;
    node.dataset.value = value;
    node.dataset.fontReady = String(fontsReady);
    [...value].forEach((char, index) => {
      const span = element('tspan', {x: left + widths[index] / 2, 'text-anchor': 'middle'});
      span.textContent = char; node.append(span); left += widths[index];
    });
  }

  function setText(node, value) {
    if (node.classList.contains('numeric-value')) typeset(node, value);
    else if (node.textContent !== value) node.textContent = value;
  }
  function fresh() {
    return connected && snapshot?.timestampMs && Date.now() - snapshot.timestampMs <= 4000 && performance.now() - lastReply <= 4000;
  }
  function values(data) {
    const result = {};
    for (const node of document.querySelectorAll('.native-readouts text[data-field]')) {
      const field = node.dataset.field;
      if (field.startsWith('clock.') || field.startsWith('audio.')) continue;
      let value = get(data, field);
      let text;
      if (/Bytes$/.test(field) && !field.startsWith('network.')) {
        text = number(finite(value) ? value / 2 ** 30 : null, 1);
        if (field.endsWith('totalBytes') || field === 'gpu.memoryTotalBytes') text = `/ ${text} GiB`;
      } else if (field.startsWith('network.')) {
        const rate = field.endsWith('PerSecond');
        const [formatted, unit] = bytes(value, rate); text = formatted;
        const key = field.includes('download') ? 'downloadUnit' : field.includes('upload') ? 'uploadUnit' : field.includes('Received') ? 'receivedUnit' : 'sentUnit';
        result[key] = unit;
      } else if (field === 'memory.usedPercent') text = finite(value) ? `${number(value, 1)}%` : '—';
      else text = number(value, field.startsWith('audio.') ? 2 : 0);
      setText(node, text);
    }
    result.vramPercent = finite(data?.gpu?.memoryUsedPercent) ? `${number(data.gpu.memoryUsedPercent, 1)}%` : '—';
    return result;
  }

  function historyRange(field, rows) {
    const valid = rows.map(row => row[field]).filter(finite);
    if (field === 'memoryUsedBytes') {
      const values = valid.map(v => v / 2 ** 30);
      if (!values.length) return [0, finite(snapshot?.memory?.totalBytes) ? snapshot.memory.totalBytes / 2 ** 30 : 1];
      const low = Math.min(...values), high = Math.max(...values);
      const margin = Math.max(.2, (high - low) * .15);
      return [Math.max(0, low - margin), high + margin];
    }
    if (field.startsWith('network')) return [0, Math.max(1024, ...valid) * 1.1];
    return field === 'cpuTemperature' ? [20, 110] : [0, 100];
  }
  function curves(rows) {
    const end = snapshot?.timestampMs || Date.now();
    for (const path of document.querySelectorAll('path[data-field^="history."]')) {
      const field = path.dataset.field.slice(8);
      const [x, y, w, h, fixedMin, fixedMax] = JSON.parse(path.dataset.box);
      const [min, max] = fixedMax === null ? historyRange(field, rows) : [fixedMin, fixedMax];
      let d = '', previousTime = null, endpoint = null;
      for (const row of rows) {
        const raw = row[field], value = field === 'memoryUsedBytes' && finite(raw) ? raw / 2 ** 30 : raw;
        if (!finite(value) || !finite(row.timestampMs) || row.timestampMs < end - 60000) { previousTime = null; endpoint = null; continue; }
        const px = x + w * Math.max(0, Math.min(1, (row.timestampMs - (end - 60000)) / 60000));
        const py = y + h - h * Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min)));
        d += `${previousTime !== null && row.timestampMs - previousTime <= 2500 ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`;
        previousTime = row.timestampMs; endpoint = [px, py];
      }
      path.setAttribute('d', d);
      const dot = path.parentElement.querySelector(`circle[data-dot="${path.dataset.field}"]`);
      if (dot) {
        dot.setAttribute('visibility', endpoint && end - previousTime < 2500 ? 'visible' : 'hidden');
        if (endpoint) { dot.setAttribute('cx', endpoint[0]); dot.setAttribute('cy', endpoint[1]); }
      }
      const pane = path.closest('.native-pane');
      for (const node of pane.querySelectorAll('[data-live="scaleMax"]')) node.textContent = number(max, field === 'memoryUsedBytes' ? 1 : 0);
      for (const node of pane.querySelectorAll('[data-live="scaleMin"]')) node.textContent = number(min, field === 'memoryUsedBytes' ? 1 : 0);
    }
  }

  function logicalBars(data) {
    const group = panes.get('threads').querySelector('.logical-bars');
    const count = data?.cpu?.logicalCount || 0;
    if (Number(group.dataset.count) !== count || group.dataset.count === undefined) {
      group.replaceChildren(); group.dataset.count = count;
      const spacing = (410 - 44) / Math.max(1, count);
      for (let i = 0; i < count; i++) {
        group.append(element('rect', {x: 22 + i * spacing, y: 91, width: spacing * .59, height: 54, fill: '#8cdef0', opacity: .08}));
        const bar = element('rect', {x: 22 + i * spacing, y: 145, width: spacing * .59, height: 0, fill: '#8cdef0', opacity: .75, 'data-processor': i});
        group.append(bar);
      }
    }
    for (const rect of group.querySelectorAll('[data-processor]')) {
      const value = data?.cpu?.logicalPercent?.[Number(rect.dataset.processor)];
      const height = finite(value) ? 54 * Math.max(0, Math.min(1, value / 100)) : 0;
      rect.setAttribute('height', height); rect.setAttribute('y', 145 - height);
    }
    panes.get('threads').querySelector('[data-live="logicalLast"]').textContent = count ? String(count - 1) : '—';
  }

  function providerStatus(identifier, data) {
    const key = identifier.startsWith('cpu') || identifier === 'threads' ? 'cpu' : identifier.startsWith('ram') ? 'memory' : identifier.startsWith('gpu') || identifier === 'vram' ? 'gpu' : 'network';
    const status = data?.[key]?.status;
    return status === 'online' || status === 'partial' ? '' : status === 'warming' ? 'WARMING UP' : connected ? 'SOURCE OFFLINE' : 'DATA OFFLINE';
  }
  function render() {
    const isFresh = fresh(), data = isFresh ? snapshot : null;
    const rows = isFresh && Array.isArray(snapshot.history) ? snapshot.history : [];
    const formatted = values(data);
    for (const [identifier, pane] of panes) {
      for (const node of pane.querySelectorAll('[data-live]')) {
        const key = node.dataset.live;
        if (key in formatted) node.textContent = formatted[key];
        if (key === 'providerStatus') node.textContent = isFresh ? providerStatus(identifier, data) : 'DATA OFFLINE';
        if (key === 'temperatureSummary') {
          const temperatures = rows.map(row => row.cpuTemperature).filter(finite);
          node.textContent = finite(data?.cpu?.temperatureC) && temperatures.length ? `PEAK ${number(Math.max(...temperatures))} °C` : data?.cpu?.temperatureProvider?.status === 'stale' ? 'SENSOR STALE' : 'SENSOR OFFLINE';
        }
        if (key === 'trendSummary') {
          const field = historyFields[identifier], valid = rows.map(row => row[field]).filter(finite);
          const current = field === 'cpuTotalPercent' ? data?.cpu?.totalPercent : field === 'gpuLoadPercent' ? data?.gpu?.loadPercent : data?.memory?.usedBytes;
          node.textContent = !valid.length ? isFresh ? 'COLLECTING' : 'DATA OFFLINE' : identifier === 'ram-trend' ? `${number(Math.min(...valid) / 2 ** 30, 1)}–${number(Math.max(...valid) / 2 ** 30, 1)} GiB` : `NOW ${number(current)}%  /  PEAK ${number(Math.max(...valid))}%`;
        }
      }
    }
    for (const rect of document.querySelectorAll('[data-gauge]')) {
      const value = get(data, rect.dataset.gauge);
      rect.setAttribute('width', finite(value) ? Number(rect.dataset.maxWidth) * Math.max(0, Math.min(1, value / 100)) : 0);
    }
    logicalBars(data); curves(rows);
    const age = snapshot?.timestampMs ? Math.max(0, (Date.now() - snapshot.timestampMs) / 1000) : null;
    $('data-state').textContent = isFresh ? '本机数据 · 每秒采集' : connected && snapshot?.status === 'warming' ? '采集器预热中' : '本机接口未连接 / 数据已过期';
    $('data-state').dataset.state = isFresh ? 'online' : 'offline';
    $('sample-time').textContent = isFresh ? `最近采样 ${new Date(snapshot.timestampMs).toLocaleTimeString('zh-CN', {hour12: false})} · ${rows.length}条有效时间记录` : age !== null ? `最近数据 ${Math.floor(age)}秒前` : '等待本机采集器';
    $('gpu-provider').textContent = data?.gpu?.name ? `${data.gpu.name} · ${data.gpu.source}` : 'NVIDIA GPU 等待驱动接口';
    const sensor = data?.cpu?.temperatureProvider;
    const temperatureSource = data?.cpu?.temperatureSource || 'hwinfo_csv';
    const hwinfo = data?.cpu?.temperatureSources?.hwinfo_csv;
    $('temperature-state').textContent = sensor?.message || 'CPU 温度未连接';
    $('temperature-detail').textContent = sensor?.sensor || (temperatureSource === 'alienware_wmi' ? '请按 Alienware Command Center 的显示确认 CPU 对应的温度编号。' : 'HWiNFO 日志需要持续记录；可切换到完成一次管理员安装后的 Alienware 来源。');
    if (document.activeElement !== $('temperature-source')) $('temperature-source').value = temperatureSource;
    if (cpuTemperatureLabel) cpuTemperatureLabel.textContent = temperatureSource === 'alienware_wmi' ? 'CPU TEMP' : 'CPU PACKAGE';
    const network = data?.network;
    $('network-note').textContent = network?.adapter ? `${network.adapter} · 会话从采集器启动 / 切换网卡时累计` : '网卡等待连接';
    syncOptions($('adapter-select'), network?.availableAdapters || [], item => item.name, item => `${item.name}${item.isUp ? '' : '（未连接）'}`, network?.adapter);
    syncOptions($('temperature-select'), hwinfo?.availableSensors || [], item => item, item => item, hwinfo?.sensor);
    $('temperature-select-row').hidden = temperatureSource !== 'hwinfo_csv' || !(hwinfo?.availableSensors?.length > 1);
    $('hwinfo-log-section').hidden = temperatureSource !== 'hwinfo_csv';
    $('awcc-temperature-row').hidden = temperatureSource !== 'alienware_wmi';
    const alienware = data?.alienware;
    syncOptions($('awcc-temperature-select'), alienware?.sensors || [], item => item.key, item => `${item.label} · ${number(item.valueC)} °C`, temperatureSource === 'alienware_wmi' ? sensor?.sensorKey : null);
    // A source is assigned by the user, never inferred from similar readings.
    if (document.activeElement !== $('awcc-temperature-select') && !sensor?.sensorKey) $('awcc-temperature-select').value = '';
    renderAlienware(alienware, temperatureSource === 'alienware_wmi' ? sensor?.sensorKey : null);
    $('interface-status').textContent = isFresh ? '实时接口已连接' : '等待本机采集接口';
    document.body.dataset.dataInitialized = 'true';
    clock();
  }

  function renderAlienware(data, cpuKey) {
    $('awcc-state').textContent = cpuKey && ['online', 'partial'].includes(data?.status) ? `CPU 已使用你选择的 ${cpuKey}；其他编号与风扇位置待你确认` : data?.message || 'Alienware 采集尚未启用：需要一次管理员安装';
    const rows = [];
    for (const item of data?.sensors || []) rows.push([`温度 ${item.key}`, `${number(item.valueC)} °C`, item.key === cpuKey ? 'CPU · 你已选定' : '归属待你确认']);
    for (const item of data?.fans || []) rows.push([`风扇 ${item.key}`, `${number(item.rpm)} RPM`, item.relatedTemperatureKeys?.length ? `关联温度 ${item.relatedTemperatureKeys.join(' / ')}` : '归属待你确认']);
    const signature = JSON.stringify(rows);
    if ($('awcc-readings').dataset.signature === signature) return;
    $('awcc-readings').dataset.signature = signature;
    $('awcc-readings').replaceChildren();
    for (const values of rows) {
      const row = document.createElement('tr');
      for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      $('awcc-readings').append(row);
    }
    $('awcc-table').hidden = !rows.length;
  }

  function syncOptions(select, items, key, label, selected) {
    if (document.activeElement === select) return;
    const signature = JSON.stringify(items);
    if (select.dataset.signature !== signature) {
      select.replaceChildren();
      if (select.id === 'awcc-temperature-select' && items.length) { const option = document.createElement('option'); option.textContent = '请确认 CPU 归属后选择'; option.value = ''; select.append(option); }
      if (!items.length) { const option = document.createElement('option'); option.textContent = '等待接口'; option.value = ''; select.append(option); }
      for (const item of items) { const option = document.createElement('option'); option.value = key(item); option.textContent = label(item); select.append(option); }
      select.dataset.signature = signature;
    }
    if (selected) select.value = selected;
    select.disabled = !items.length;
  }
  function clock() {
    const date = new Date(), pad = n => String(n).padStart(2, '0');
    const strings = {clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`, date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`};
    for (const id of ['clock', 'date']) for (const node of panes.get(id).querySelectorAll('text[data-field="clock.localDateTime"]')) setText(node, strings[id]);
  }
  async function poll() {
    if (busy || document.hidden || window.MORNYE_SETTINGS?.paused) return;
    busy = true;
    const pollStarted = performance.now();
    try {
      const response = await window.wallpaperFetch('/api/v1/snapshot', {cache: 'no-store', signal: AbortSignal.timeout(3000)});
      if (!response.ok) throw new Error('本机接口不可用');
      const next = await response.json();
      if (next.schemaVersion !== 1) throw new Error('接口版本不匹配');
      snapshot = next; connected = true; lastReply = performance.now();
      if (connectionMessage) { $('config-message').textContent = ''; connectionMessage = false; }
    } catch (error) {
      connected = false;
      connectionMessage = true;
      $('config-message').textContent = error.name === 'TimeoutError' ? '本机接口响应超时，页面正在重连' : '请启动此版本的本机采集器，页面会自动重连';
    } finally {
      busy = false; render(); clearTimeout(timer); timer = setTimeout(poll, connected ? Math.max(0, (window.MORNYE_SETTINGS?.hardwarePollMs??250) - (performance.now() - pollStarted)) : 1000);
    }
  }
  async function configure(value) {
    try {
      const response = await window.wallpaperFetch('/api/v1/config', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value), signal: AbortSignal.timeout(3000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '配置未保存');
      connectionMessage = false;
      $('config-message').textContent = value.adapter ? '已切换网卡；网络历史与会话累计重新开始' : 'CPU 温度来源已保存；温度历史重新累计';
      clearTimeout(timer); await poll();
    } catch (error) { $('config-message').textContent = error.message; }
  }
  $('adapter-select').addEventListener('change', event => configure({adapter: event.target.value}));
  $('temperature-select').addEventListener('change', event => configure({temperatureSensor: event.target.value}));
  $('temperature-source').addEventListener('change', event => configure({temperatureSource: event.target.value}));
  $('awcc-temperature-select').addEventListener('change', event => { if (event.target.value) configure({temperatureSource: 'alienware_wmi', awccTemperatureSensor: event.target.value}); });
  document.addEventListener('mornye-settings-change', () => {clearTimeout(timer);if (!busy) poll();});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(timer); poll(); } });
  document.fonts.ready.then(() => { fontsReady = true; render(); });
  window.wallpaperFetch('/api/v1/info', {cache: 'no-store'}).then(response => response.json()).then(value => {
    info = value; $('sensor-log-path').textContent = info.sensorLogPath; $('api-address').textContent = `http://127.0.0.1:64582/api/v1/snapshot`;
    $('startup-state').textContent = info.startup?.installed ? '采集器已登记登录自启动 · 固定网址 127.0.0.1:64582 · 重启表现待你人眼检验' : '采集器登录自启动尚未登记';
  }).catch(() => { $('sensor-log-path').textContent = 'sensor-input/HWiNFO.csv（当前版本目录）'; });
  render(); poll();
  setInterval(() => { if (!fresh()) render(); clock(); }, 1000);
})();
