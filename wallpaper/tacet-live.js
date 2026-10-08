"use strict";
(() => {
  const pane = document.querySelector('.native-pane[data-window="spectrum"]');
  const content = pane?.querySelector('.pane-content');
  const levels = window.MORNYE_AUDIO_LEVELS;
  if (!content || !window.TacetMarkSvg || !levels) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS,'svg');
  for (const [name,value] of Object.entries({x:0,y:0,width:650,height:117,viewBox:'0 0 650 117',overflow:'visible',role:'img'})) svg.setAttribute(name,value);
  const renderer = window.TacetMarkSvg.mount(svg,{native:true,frame:false});
  renderer.setAxis(false);
  for (const text of svg.querySelectorAll('text[font-family]')) text.style.fontFamily = text.getAttribute('font-family');
  svg.querySelector('desc').textContent = '433像素声痕静音时零振幅并收成中央水平线；整体音频能量与局部64格频谱共同带动起伏，0–1响应映射为0–37像素半高并四向镜像。频段索引分析仅来自原音频，不计入整体视觉包络。';
  content.replaceChildren(svg);
  const technical = pane.querySelector('[data-layer="technical"]');
  if (technical) technical.style.display = 'none';
  pane.querySelector('svg').setAttribute('aria-label','15声痕主频道 · 官方音频驱动');
  pane.querySelector('title').textContent = '15声痕主频道 · 433像素对称包络与频段分析';
  const item = window.SAMPLE_ASSETS.windows.find(item => item.id === 'spectrum');
  if (item) item.label = '声痕主频道';

  const native = window.MORNYE_NATIVE_AUDIO;
  const response = Array(64).fill(0), analysisSpectrum = Array(64).fill(0), zero = Array(64).fill(0);
  const noAnalysis = {peak:null,centroid:null};
  const browserBins = values => {
    if (!values?.length) return zero;
    return Array.from({length:64},(_,i) => {
      const position = i*(values.length-1)/63, lower = Math.floor(position), fraction = position-lower;
      return levels.amplitude(values[lower])*(1-fraction)+levels.amplitude(values[Math.min(values.length-1,lower+1)])*fraction;
    });
  };
  let previous = performance.now(), lastPaint = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    const settings = window.MORNYE_SETTINGS;
    if (document.hidden || settings?.paused || pane.hidden || pane.closest('.window-motion')?.hidden) { previous=now; return; }
    const fps = Math.max(1,Math.min(settings?.renderFps??60,settings?.generalFps??60));
    if (now-lastPaint < 1000/fps-.5) return;
    const elapsed = Math.min(100,Math.max(0,now-previous)); previous=now; lastPaint=now;
    const enabled = settings?.audioEnabled !== false;
    let spectrum=zero,summary=null,fresh=false;
    if (native?.mode === 'native') {
      fresh = native.receivedAt>0 && now-native.receivedAt<=2000;
      if (fresh) { summary=native.frame; spectrum=summary.stereoSpectrum; }
    } else {
      const browser = window.MORNYE_BROWSER_AUDIO;
      fresh = browser?.receivedAt>0 && now-browser.receivedAt<=2000 && Date.now()-browser.frame.timestampMs<=2000
        && ['online','silent'].includes(browser.frame.status);
      if (fresh) { summary=levels.summarize(browserBins(browser.frame.spectrumLeft),browserBins(browser.frame.spectrumRight)); spectrum=summary.stereoSpectrum; }
    }
    const targets = enabled && fresh ? levels.shapeTargets(spectrum,summary,settings?.audioGain??1) : zero;
    for (let i=0;i<64;i++) {
      const raw = enabled && fresh && spectrum[i]>levels.parameters.noiseFloor ? spectrum[i] : 0;
      const tau = targets[i]>response[i] ? 18 : 120;
      response[i] += (targets[i]-response[i])*(1-Math.exp(-elapsed/tau));
      analysisSpectrum[i] += (raw-analysisSpectrum[i])*(1-Math.exp(-elapsed/(raw>analysisSpectrum[i]?18:120)));
      if (response[i]<.0001) response[i]=0;
      if (analysisSpectrum[i]<.0001) analysisSpectrum[i]=0;
    }
    renderer.draw(response,enabled && fresh ? window.TacetMarkSvg.analyze(analysisSpectrum) : noAnalysis);
    pane.dataset.audioState = !enabled ? 'off' : !fresh ? 'waiting' : analysisSpectrum.some(value => value>levels.parameters.noiseFloor) ? 'live' : 'silent';
  }
  requestAnimationFrame(animate);
})();
