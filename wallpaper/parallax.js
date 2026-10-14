"use strict";
(() => {
  const stage=document.getElementById("stage"),target=document.getElementById("target-scene");
  if(!stage||!target)return;
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  const world=document.createElement("div");
  world.id="parallax-world";world.className="parallax-world";
  while(target.firstChild)world.append(target.firstChild);
  target.append(world);
  let clientX=0,clientY=0,inside=false,retainedX=0,retainedY=0,amount=0,painted="";
  const motion={x:0,y:0,track,leave,step,reset};
  window.MORNYE_PARALLAX=motion;
  const clamp=value=>Math.max(-1,Math.min(1,value));
  function allowed(){
    const settings=window.MORNYE_SETTINGS;
    return settings?.parallaxEnabled===true&&!reduced.matches&&stage.dataset.editorEnabled!=="true"&&stage.dataset.reference!=="true"&&stage.dataset.view==="scene";
  }
  function track(event){
    if(event.pointerType==="touch"||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    clientX=event.clientX;clientY=event.clientY;inside=true;
  }
  function leave(){
    inside=false;
    if(window.MORNYE_SETTINGS?.parallaxReturn!==false){retainedX=0;retainedY=0;}
  }
  function paint(){
    // Padding bounds every intermediate translation, including enable/disable easing.
    // This is construction math, not a pixel comparison or visual acceptance test.
    const zoom=1+2*Math.max(12*amount/3440,7*amount/1440);
    const transform=amount===0&&motion.x===0&&motion.y===0?"":`matrix(${zoom},0,0,${zoom},${1720*(1-zoom)-10*motion.x},${720*(1-zoom)-5*motion.y})`;
    if(transform!==painted){world.style.transform=transform;painted=transform;}
  }
  function reset(){
    inside=false;retainedX=0;retainedY=0;amount=0;motion.x=0;motion.y=0;paint();
  }
  function step(dt){
    const settings=window.MORNYE_SETTINGS;
    if(!settings||settings.paused||document.hidden)return;
    if(reduced.matches||stage.dataset.view!=="scene"||stage.dataset.editorEnabled==="true"||stage.dataset.reference==="true"){reset();return;}
    let nx=retainedX,ny=retainedY;
    if(inside){
      // Use the fixed outer fitted scene, never the moving scene's coordinates.
      const rect=target.getBoundingClientRect();
      if(rect.width>0&&rect.height>0){
        nx=clamp((clientX-rect.left)/rect.width*2-1);
        ny=clamp((clientY-rect.top)/rect.height*2-1);
        retainedX=nx;retainedY=ny;
      }
    }else if(settings.parallaxReturn!==false){nx=0;ny=0;retainedX=0;retainedY=0;}
    const strength=allowed()?Math.max(0,Math.min(2,settings.parallaxStrength)):0;
    const response=Math.max(100,Math.min(800,settings.parallaxResponseMs))/1000;
    const easing=1-Math.exp(-Math.max(0,Math.min(.12,dt))/response);
    amount+=(strength-amount)*easing;
    motion.x+=(nx*strength-motion.x)*easing;
    motion.y+=(ny*strength-motion.y)*easing;
    if(Math.abs(strength-amount)<.0001)amount=strength;
    if(Math.abs(nx*strength-motion.x)<.0001)motion.x=nx*strength;
    if(Math.abs(ny*strength-motion.y)<.0001)motion.y=ny*strength;
    // Rounding at convergence cannot allow translation beyond the padded amount.
    motion.x=Math.max(-amount,Math.min(amount,motion.x));
    motion.y=Math.max(-amount,Math.min(amount,motion.y));
    paint();
  }
  document.addEventListener("mornye-settings-change",()=>{
    if(window.MORNYE_SETTINGS?.paused){leave();return;}
    if(reduced.matches){reset();return;}
    if(!window.MORNYE_SETTINGS?.parallaxEnabled){inside=false;retainedX=0;retainedY=0;}
  });
  stage.addEventListener("view-change",reset);
  stage.addEventListener("layout-update",reset);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)reset();});
  window.addEventListener("blur",leave);
  window.addEventListener("pagehide",reset);
  reduced.addEventListener("change",reset);
})();
