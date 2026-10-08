"use strict";
(() => {
  const native = typeof window.wallpaperRegisterAudioListener === 'function';
  const levels = window.MORNYE_AUDIO_LEVELS;
  const source = window.MORNYE_NATIVE_AUDIO = {
    mode:native?'native':'http',frame:null,receivedAt:0,error:null,
    left:Array(64).fill(0),right:Array(64).fill(0),bands:levels?.bands,
    amplitudeVersion:'native-frequency-response-v2'
  };
  if (!native) return;
  if (!levels) { source.error='Amplitude module unavailable'; return; }
  const existingSpectrum = values => Array.from({length:48},(_,column) => {
    const start=column*64/48,end=(column+1)*64/48;
    let sum=0;
    for(let bin=Math.floor(start);bin<Math.ceil(end);bin++) sum+=values[bin]*Math.max(0,Math.min(end,bin+1)-Math.max(start,bin));
    return sum/(end-start);
  });
  function receive(audioArray) {
    if (!audioArray || audioArray.length!==128) return;
    const left=Array.from({length:64},(_,i)=>levels.amplitude(audioArray[i]));
    const right=Array.from({length:64},(_,i)=>levels.amplitude(audioArray[i+64]));
    const summary=levels.summarize(left,right);
    source.left=left;source.right=right;source.receivedAt=performance.now();
    source.frame={
      schemaVersion:1,timestampMs:Date.now(),
      status:left.some(value=>value>levels.parameters.noiseFloor)||right.some(value=>value>levels.parameters.noiseFloor)?'online':'silent',
      provider:'wallpaper-engine-native',amplitudeVersion:source.amplitudeVersion,
      fieldBasis:'unmapped-dominant-frequency-rms',
      message:'Wallpaper Engine 官方音频 · 强频段聚合与敏感映射 · 数字为0–1视觉响应',
      device:{name:'Wallpaper Engine 音频输入（接口不提供设备名称）'},
      ...summary,
      spectrumLeft:existingSpectrum(left),spectrumRight:existingSpectrum(right)
    };
  }
  try { window.wallpaperRegisterAudioListener(receive); }
  catch(error) { source.error=error instanceof Error?error.message:String(error); }
})();
