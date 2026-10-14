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
  const summary={stereoSpectrum:Array(64).fill(0)},spectrumLeft=Array(48).fill(0),spectrumRight=Array(48).fill(0);
  const existingSpectrum = (values,output) => {for(let column=0;column<48;column++){
    const start=column*64/48,end=(column+1)*64/48;
    let sum=0;
    for(let bin=Math.floor(start);bin<Math.ceil(end);bin++) sum+=values[bin]*Math.max(0,Math.min(end,bin+1)-Math.max(start,bin));
    output[column]=sum/(end-start);
  }return output;};
  function receive(audioArray) {
    if (!audioArray || audioArray.length!==128) return;
    if(window.MORNYE_SETTINGS?.paused||window.MORNYE_SETTINGS?.audioEnabled===false||(typeof document!=='undefined'&&document.hidden))return;
    const left=source.left,right=source.right;
    for(let i=0;i<64;i++){left[i]=levels.amplitude(audioArray[i]);right[i]=levels.amplitude(audioArray[i+64]);}
    levels.summarize(left,right,summary);
    source.left=left;source.right=right;source.receivedAt=performance.now();
    const frame=source.frame||(source.frame={});
    Object.assign(frame,{
      schemaVersion:1,timestampMs:Date.now(),
      status:left.some(value=>value>levels.parameters.noiseFloor)||right.some(value=>value>levels.parameters.noiseFloor)?'online':'silent',
      provider:'wallpaper-engine-native',amplitudeVersion:source.amplitudeVersion,
      fieldBasis:'unmapped-dominant-frequency-rms',
      message:'Wallpaper Engine 官方音频 · 强频段聚合与敏感映射 · 数字为0–1视觉响应',
      device:{name:'Wallpaper Engine 音频输入（接口不提供设备名称）'},
      ...summary,
      spectrumLeft:existingSpectrum(left,spectrumLeft),spectrumRight:existingSpectrum(right,spectrumRight)
    });
  }
  try { window.wallpaperRegisterAudioListener(receive); }
  catch(error) { source.error=error instanceof Error?error.message:String(error); }
})();
