"use strict";
(() => {
  const parameters = Object.freeze({noiseFloor:.001, knee:.1, strongestFraction:.25, globalShare:.7, localShare:.3});
  const bands = Object.freeze({low:[0,16], mid:[16,40], high:[40,64]});
  const amplitude = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 0;
  const powerBuffers=new Map([16,24,64].map(length=>[length,Array(length).fill(0)]));
  // Frequency amplitudes are visualizer levels, not time-domain PCM samples.
  function dominantRms(values, start=0, end=values.length) {
    const length=end-start,powers=powerBuffers.get(length)||Array(length);
    for(let i=0;i<length;i++)powers[i]=amplitude(values[start+i])**2;
    powers.sort((a,b)=>b-a);
    const count=Math.max(1,Math.ceil(length*parameters.strongestFraction));
    let sum=0;for(let i=0;i<count;i++)sum+=powers[i]||0;
    return Math.sqrt(sum/count);
  }
  function mapResponse(value, gain=1) {
    const scaled = amplitude(value * (Number.isFinite(gain) ? Math.max(0,gain) : 1));
    const signal = Math.max(0,(scaled-parameters.noiseFloor)/(1-parameters.noiseFloor));
    return signal === 0 ? 0 : (1+parameters.knee)*signal/(signal+parameters.knee);
  }
  function summarize(left, right, output=null) {
    const stereoSpectrum=output?.stereoSpectrum||Array(64).fill(0);
    for(let i=0;i<64;i++)stereoSpectrum[i]=Math.sqrt((amplitude(left[i])**2+amplitude(right[i])**2)/2);
    const result=output||{};
    Object.assign(result,{
      leftRelativeEnergy:dominantRms(left,0,64), rightRelativeEnergy:dominantRms(right,0,64),
      lowRelativeEnergy:dominantRms(stereoSpectrum,...bands.low),
      midRelativeEnergy:dominantRms(stereoSpectrum,...bands.mid),
      highRelativeEnergy:dominantRms(stereoSpectrum,...bands.high),
      overallRelativeEnergy:dominantRms(stereoSpectrum,0,64), stereoSpectrum
    });
    return result;
  }
  function shapeTargets(stereoSpectrum, summary, gain=1, output=null) {
    const overall = mapResponse(.75*summary.overallRelativeEnergy+.25*summary.lowRelativeEnergy,gain);
    const targets=output||Array(stereoSpectrum.length);
    for(let i=0;i<stereoSpectrum.length;i++)targets[i]=parameters.globalShare*overall+parameters.localShare*mapResponse(stereoSpectrum[i],gain);
    return targets;
  }
  window.MORNYE_AUDIO_LEVELS = Object.freeze({parameters,bands,amplitude,dominantRms,mapResponse,summarize,shapeTargets});
})();
