"use strict";
(() => {
  const parameters = Object.freeze({noiseFloor:.001, knee:.1, strongestFraction:.25, globalShare:.7, localShare:.3});
  const bands = Object.freeze({low:[0,16], mid:[16,40], high:[40,64]});
  const amplitude = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 0;
  // Frequency amplitudes are visualizer levels, not time-domain PCM samples.
  function dominantRms(values, start=0, end=values.length) {
    const powers = Array.from({length:end-start}, (_, i) => amplitude(values[start+i]) ** 2).sort((a,b) => b-a);
    const count = Math.max(1, Math.ceil(powers.length * parameters.strongestFraction));
    return Math.sqrt(powers.slice(0,count).reduce((sum,power) => sum+power,0) / count);
  }
  function mapResponse(value, gain=1) {
    const scaled = amplitude(value * (Number.isFinite(gain) ? Math.max(0,gain) : 1));
    const signal = Math.max(0,(scaled-parameters.noiseFloor)/(1-parameters.noiseFloor));
    return signal === 0 ? 0 : (1+parameters.knee)*signal/(signal+parameters.knee);
  }
  function summarize(left, right) {
    const stereoSpectrum = Array.from({length:64}, (_, i) => Math.sqrt((amplitude(left[i])**2+amplitude(right[i])**2)/2));
    return {
      leftRelativeEnergy:dominantRms(left,0,64), rightRelativeEnergy:dominantRms(right,0,64),
      lowRelativeEnergy:dominantRms(stereoSpectrum,...bands.low),
      midRelativeEnergy:dominantRms(stereoSpectrum,...bands.mid),
      highRelativeEnergy:dominantRms(stereoSpectrum,...bands.high),
      overallRelativeEnergy:dominantRms(stereoSpectrum,0,64), stereoSpectrum
    };
  }
  function shapeTargets(stereoSpectrum, summary, gain=1) {
    const overall = mapResponse(.75*summary.overallRelativeEnergy+.25*summary.lowRelativeEnergy,gain);
    return stereoSpectrum.map(value => parameters.globalShare*overall+parameters.localShare*mapResponse(value,gain));
  }
  window.MORNYE_AUDIO_LEVELS = Object.freeze({parameters,bands,amplitude,dominantRms,mapResponse,summarize,shapeTargets});
})();
