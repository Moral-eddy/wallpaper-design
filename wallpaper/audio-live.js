"use strict";
(() => {
  const NS = 'http://www.w3.org/2000/svg', $ = id => document.getElementById(id);
  const identifiers = ['stereo', 'bands'];
  const panes = new Map(identifiers.map(id => [id, document.querySelector(`.native-pane[data-window="${id}"]`)]));
  const energyFields = ['leftRelativeEnergy', 'rightRelativeEnergy', 'lowRelativeEnergy', 'midRelativeEnergy', 'highRelativeEnergy'];
  for (const item of window.SAMPLE_ASSETS.windows) {
    if (identifiers.includes(item.id)) item.label = item.label.replace('（音频待接入）', '');
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const element = (name, attributes) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const response = value => !finite(value) ? 0 : window.MORNYE_NATIVE_AUDIO?.mode==='native'
    ? window.MORNYE_AUDIO_LEVELS.mapResponse(value,window.MORNYE_SETTINGS?.audioGain??1)
    : Math.max(0,Math.min(1,value*(window.MORNYE_SETTINGS?.audioGain??1)));
  const bars = [], gauges = [], readouts = [], statuses = [];
  const display = {left: Array(48).fill(0), right: Array(48).fill(0), energy: Object.fromEntries(energyFields.map(field => [field, 0]))};
  let frame = null, connected = false, lastReply = 0, pollTimer = null, busy = false, previousTick = performance.now();

  for (const [id, pane] of panes) {
    const content = pane.querySelector('.pane-content');
    const status = [...content.querySelectorAll('text')].find(node => node.getAttribute('y') === '31');
    statuses.push(status);
    for (const node of content.querySelectorAll('text[data-field^="audio."]')) readouts.push([node, node.dataset.field.slice(6)]);
    pane.querySelector('title').textContent = `${id === 'spectrum' ? '左右声道频谱' : id === 'stereo' ? '左右声道相对响应' : '低中高频相对响应'} · 系统播放声音`;
    const originalLabel = pane.querySelector('svg').getAttribute('aria-label') || id;
    pane.querySelector('svg').setAttribute('aria-label', originalLabel.replace('，音频待接入', '，系统播放声音'));
    if (id === 'spectrum') {
      const group = element('g', {'class': 'live-audio-spectrum'});
      const spacing = 604 / 48;
      for (let i = 0; i < 48; i++) {
        const pair = [];
        for (const [channel, color] of ['#8cdef0', '#d5f4ff'].entries()) {
          const bar = element('rect', {x: 23 + i * spacing + channel * spacing * .37, y: 97,
            width: spacing * .3, height: 0, fill: color, opacity: channel ? .85 : .76});
          group.append(bar); pair.push(bar);
        }
        bars.push(pair);
      }
      content.append(group);
      const legend = element('text', {x: 325, y: 111, 'text-anchor': 'middle', 'font-size': 9,
        fill: '#b5d9e9', style: 'font-family:Rajdhani,Segoe UI,sans-serif;font-weight:500'});
      legend.textContent = 'L · R'; content.append(legend);
    } else {
      const fields = id === 'stereo' ? energyFields.slice(0, 2) : energyFields.slice(2);
      const tracks = [...content.querySelectorAll('rect')].filter(node => node.getAttribute('opacity') === '0.12');
      tracks.forEach((track, index) => {
        const attributes = {x: track.getAttribute('x'), y: track.getAttribute('y'), height: track.getAttribute('height'),
          width: 0, fill: '#8cdef0', opacity: .9};
        const fill = element('rect', attributes);
        content.insertBefore(fill, track.nextSibling);
        gauges.push({node: fill, field: fields[index], width: Number(track.getAttribute('width'))});
      });
    }
  }

  const nativeSource = window.MORNYE_NATIVE_AUDIO;
  const usesNativeAudio = nativeSource?.mode === 'native';

  function fresh() {
    if (usesNativeAudio) {
      frame = nativeSource.frame;
      connected = nativeSource.receivedAt > 0;
      lastReply = nativeSource.receivedAt;
    }
    return window.MORNYE_SETTINGS?.audioEnabled!==false && connected && frame?.timestampMs && Date.now() - frame.timestampMs <= 2000 && performance.now() - lastReply <= 2000;
  }

  function animate(now) {
    if(document.hidden||window.MORNYE_SETTINGS?.paused||now-previousTick<1000/Math.min(window.MORNYE_SETTINGS?.renderFps??60,window.MORNYE_SETTINGS?.generalFps??60)-.5){requestAnimationFrame(animate);return;}
    const elapsed = Math.min(100, Math.max(0, now - previousTick)); previousTick = now;
    const current = fresh() ? frame : null;
    const active = current && ['online', 'silent'].includes(current.status);
    const smooth = (old, target) => {
      const milliseconds = target > old ? 18 : 140;
      const value = old + (target - old) * (1 - Math.exp(-elapsed / milliseconds));
      return value < .0001 ? 0 : value;
    };
    for (let i = 0; i < bars.length; i++) {
      display.left[i] = smooth(display.left[i], active ? response(current.spectrumLeft?.[i]) : 0);
      display.right[i] = smooth(display.right[i], active ? response(current.spectrumRight?.[i]) : 0);
      for (let channel = 0; channel < 2; channel++) {
        const height = 48 * (channel ? display.right[i] : display.left[i]);
        bars[i][channel].setAttribute('height', height.toFixed(2));
        bars[i][channel].setAttribute('y', (97 - height).toFixed(2));
      }
    }
    for (const field of energyFields) display.energy[field] = smooth(display.energy[field], active ? response(current[field]) : 0);
    for (const gauge of gauges) gauge.node.setAttribute('width', (gauge.width * display.energy[gauge.field]).toFixed(2));
    for (const [node, field] of readouts) {
      const text = active && finite(current[field]) ? display.energy[field].toFixed(2) : '—';
      if (node.textContent !== text) node.textContent = text;
    }
    const label = window.MORNYE_SETTINGS?.audioEnabled===false ? 'AUDIO OFF' : active ? current.status === 'silent' ? 'SILENT' : 'AUDIO LIVE' : current?.status === 'warming' ? 'CONNECTING' : 'AUDIO OFFLINE';
    for (const node of statuses) if (node && node.textContent !== label) node.textContent = label;
    const summary = window.MORNYE_SETTINGS?.audioEnabled===false ? '音频响应已关闭' : active ? current.status === 'silent' ? '系统播放已连接 · 当前静音' : '系统播放声音 · AUDIO LIVE' : current?.status === 'warming' ? '正在连接播放设备' : '音频等待连接 · AUDIO OFFLINE';
    if ($('audio-summary').textContent !== summary) $('audio-summary').textContent = summary;
    const message = current?.message || (usesNativeAudio ? nativeSource.error ? '官方音频监听注册失败：' + nativeSource.error : connected ? '官方音频回调暂停，等待恢复' : '等待 Wallpaper Engine 官方音频回调' : connected ? '音频数据已过期，正在重新连接' : '等待本机音频采集接口');
    if ($('audio-source-state').textContent !== message) $('audio-source-state').textContent = message;
    const device = current?.device?.name || (usesNativeAudio ? 'Wallpaper Engine 音频输入（接口不提供设备名称）' : '等待 Windows 默认播放设备');
    if ($('audio-device-name').textContent !== device) $('audio-device-name').textContent = device;
    requestAnimationFrame(animate);
  }

  async function pollAudio() {
    if (usesNativeAudio || busy || document.hidden || window.MORNYE_SETTINGS?.paused || window.MORNYE_SETTINGS?.audioEnabled===false) return;
    busy = true;
    try {
      const result = await window.wallpaperFetch('/api/v1/audio', {cache: 'no-store', signal: AbortSignal.timeout(1500)});
      if (!result.ok) throw new Error('音频接口暂不可用');
      const next = await result.json();
      if (next.schemaVersion !== 1) throw new Error('音频接口版本不匹配');
      frame = next; connected = true; lastReply = performance.now();
      window.MORNYE_BROWSER_AUDIO = {frame:next, receivedAt:lastReply};
    } catch (_) { connected = false; }
    finally {
      busy = false;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(pollAudio, connected ? (window.MORNYE_SETTINGS?.audioPollMs??33) : 1000);
    }
  }
  document.addEventListener('mornye-settings-change', () => {clearTimeout(pollTimer);if (!busy) pollAudio();});
  document.addEventListener('visibilitychange', () => {
    clearTimeout(pollTimer);
    if (!document.hidden) pollAudio();
  });
  requestAnimationFrame(animate);
  pollAudio();
})();
