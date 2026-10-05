"use strict";
(() => {
  const A=window.SAMPLE_ASSETS, $=id=>document.getElementById(id), NS="http://www.w3.org/2000/svg";
  const stage=$("stage"), stack=$("window-stack"), reduce=matchMedia("(prefers-reduced-motion: reduce)");
  if(!A||!stage||!stack)return;
  const sceneWidth=A.nativeSize[0], sceneHeight=A.nativeSize[1];
  const owners=[];
  let pointer=null, focused=null, active=null, masks=null, elapsed=0, last=0, frame=0;

  function multiply(a,b){return a.map(row=>b[0].map((_,j)=>row.reduce((sum,value,k)=>sum+value*b[k][j],0)));}
  function inverse(m){
    const [[a,b,c],[d,e,f],[g,h,i]]=m;
    const out=[[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a*i-c*g,c*d-a*f],[d*h-e*g,b*g-a*h,a*e-b*d]];
    const determinant=a*out[0][0]+b*out[1][0]+c*out[2][0];
    if(Math.abs(determinant)<1e-12)throw Error("Non-invertible pane homography");
    return out.map(row=>row.map(v=>v/determinant));
  }
  function translation(x,y){return [[1,0,x],[0,1,y],[0,0,1]];}
  function project(m,p){
    const denominator=m[2][0]*p[0]+m[2][1]*p[1]+m[2][2];
    return [(m[0][0]*p[0]+m[0][1]*p[1]+m[0][2])/denominator,(m[1][0]*p[0]+m[1][1]*p[1]+m[1][2])/denominator];
  }
  function cssMatrix(m){
    return `matrix3d(${[m[0][0],m[1][0],0,m[2][0],m[0][1],m[1][1],0,m[2][1],0,0,1,0,m[0][2],m[1][2],0,m[2][2]].join(",")})`;
  }
  function svg(name,attrs){const node=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));return node;}

  // Convert a small scene-space amplitude to local plane directions. The actual
  // movement still runs through H * T_local, preserving each common plane.
  function setBase(owner,H){
    owner.H=H;owner.invH=inverse(H);owner.plane.style.transform=cssMatrix(H);
    const [w,h]=owner.item.localPaneSize, center=[w/2,h/2];
    const p=project(H,center), pu=project(H,[center[0]+1,center[1]]), pv=project(H,[center[0],center[1]+1]);
    const a=pu[0]-p[0], b=pv[0]-p[0], c=pu[1]-p[1], d=pv[1]-p[1], det=a*d-b*c;
    owner.axisX=[d/det,-c/det];owner.axisY=[-b/det,a/det];
  }

  function createOwner(item,index){
    const content=stack.querySelector(`[data-window="${item.id}"]`);
    if(!content)throw Error(`Missing pane: ${item.id}`);
    const root=document.createElement("div");root.className="window-motion";root.dataset.window=item.id;
    root.style.zIndex=String(item.stackIndex+1);root.dataset.motion="floating";root.hidden=item.editorVisible===false;
    content.before(root);root.append(content);
    const [w,h]=item.localPaneSize;
    const plane=document.createElement("div");plane.className="hover-plane";
    Object.assign(plane.style,{width:`${w}px`,height:`${h}px`});root.append(plane);
    const hit=document.createElement("button");hit.className="window-hit";hit.type="button";
    hit.setAttribute("aria-label",`聚焦窗口：${item.label}`);hit.dataset.window=item.id;plane.append(hit);
    const rim=svg("svg",{width:w,height:h,viewBox:`0 0 ${w} ${h}`,"aria-hidden":"true"});rim.classList.add("interaction-rim");
    const defs=svg("defs",{}), gradient=svg("radialGradient",{id:`hover-light-${item.id}`,gradientUnits:"userSpaceOnUse",cx:w/2,cy:h/2,r:Math.min(115,Math.max(50,w*.3))});
    gradient.append(svg("stop",{offset:0,"stop-color":"#b9f4ff","stop-opacity":.09}),svg("stop",{offset:1,"stop-color":"#b9f4ff","stop-opacity":0}));defs.append(gradient);
    const glow=svg("filter",{id:`hover-glow-${item.id}`,x:"-30%",y:"-30%",width:"160%",height:"160%"});
    glow.append(svg("feGaussianBlur",{in:"SourceGraphic",stdDeviation:.9}));defs.append(glow);rim.append(defs);
    rim.append(svg("rect",{x:1,y:1,width:w-2,height:h-2,fill:`url(#hover-light-${item.id})`}));
    const outline=svg("rect",{x:1,y:1,width:w-2,height:h-2,rx:1,fill:"none",stroke:"#aceddc","stroke-opacity":.52,"stroke-width":1.1});
    const halo=outline.cloneNode(true);halo.setAttribute("filter",`url(#hover-glow-${item.id})`);halo.setAttribute("stroke-width",2);rim.append(halo,outline);
    const length=Math.min(17,h*.15);
    const corners=svg("path",{d:`M1 ${length}V1H${length} M${w-length} 1H${w-1}V${length} M${w-1} ${h-length}V${h-1}H${w-length} M${length} ${h-1}H1V${h-length}`,fill:"none",stroke:"#d5faff","stroke-width":1.7,"stroke-opacity":.86});
    rim.append(corners);plane.append(rim);
    const amplitude=item.id==="gpu"?[.35,1.25]:item.depth==="back"?[.5,1.5]:item.depth==="middle"?[.8,2.4]:[1.1,3.6];
    const owner={item,root,plane,hit,rim,gradient,amplitude,index,current:[0,0],previous:[0,0],hold:[0,0],weight:0,returning:false};
    setBase(owner,item.localToCanvasHomography);
    hit.addEventListener("focus",()=>{if(hit.matches(":focus-visible")){focused=owner;chooseActive(owner);}});
    hit.addEventListener("blur",()=>{if(focused===owner){focused=null;chooseActive(pointer?hitAt(pointer):null);}});
    return owner;
  }
  A.windows.forEach((item,index)=>owners.push(createOwner(item,index)));

  function canInteract(){return stage.dataset.editorEnabled!=="true"&&stage.dataset.reference!=="true"&&stage.dataset.view!=="plane"&&$("hover-enabled").checked;}
  function canFloat(){return stage.dataset.editorEnabled!=="true"&&stage.dataset.reference!=="true"&&stage.dataset.view!=="plane"&&$("float-enabled").checked&&!reduce.matches;}

  function covered(p){
    // Alpha belongs to the original character/foreground, never a rectangular
    // image box. Opaque hand and table pixels block focus; clear PNG areas do not.
    if(!masks)return true;
    const x=Math.floor(p[0]),y=Math.floor(p[1]);
    if(x<0||y<0||x>=sceneWidth||y>=sceneHeight)return true;
    const i=(y*sceneWidth+x)*4+3;
    return masks.some(mask=>mask[i]>16);
  }
  function localPoint(owner,p){const base=project(owner.invH,p);return [base[0]-owner.current[0],base[1]-owner.current[1]];}
  function hitAt(p){
    if(!canInteract()||covered(p))return null;
    // Later panes retain their original dominance, even where glass is clear.
    for(const owner of [...owners].sort((a,b)=>b.item.stackIndex-a.item.stackIndex)){
      if(owner.item.editorVisible===false)continue;
      const [w,h]=owner.item.localPaneSize, q=localPoint(owner,p);
      if(q[0]>=0&&q[1]>=0&&q[0]<=w&&q[1]<=h)return owner;
    }
    return null;
  }
  function chooseActive(next){
    if(!canInteract())next=null;
    if(next===active)return;
    if(active){active.returning=true;active.root.classList.remove("is-active");active.root.dataset.hover="false";}
    active=next;
    if(active){
      // A tiny continuation of the last velocity provides a soft stop rather
      // than a visible snap to the original layout. Data updates are untouched.
      active.hold=active.current.map((value,i)=>value+(value-active.previous[i])*2);
      active.root.classList.add("is-active");active.root.dataset.hover="true";active.returning=false;
    }
    updateStatus();
  }
  function updateStatus(){
    let label;
    if(stage.dataset.editorEnabled==="true")label="布局编辑中 · 浮动暂停";
    else if(stage.dataset.reference==="true")label="原静态版对照";
    else if(stage.dataset.view==="plane")label="正视文字 · 切回场景体验浮动与悬停";
    else if(active)label=`${active.item.id.toUpperCase()} · 停稳阅读`;
    else label=canFloat()?"轻浮动中 · 移到窗上试试":reduce.matches?"系统减少动态 · 悬停仍可提亮":"窗体静止 · 悬停仍可提亮";
    if(!canInteract()&&stage.dataset.reference!=="true"&&stage.dataset.view!=="plane")label=canFloat()?"轻浮动中 · 悬停响应已关闭":"窗体静止 · 悬停响应已关闭";
    if($("motion-status").textContent!==label)$("motion-status").textContent=label;
    $("float-strength-output").value=`${Number($("float-strength").value).toFixed(1)}×`;
  }

  function pointerPoint(event){
    // The canonical scene rect already includes the target mapping, responsive
    // view scaling and pixel-view scroll. Input follows that exact same map.
    const rect=$("scene").getBoundingClientRect(),scale=rect.width/sceneWidth;
    return [(event.clientX-rect.left)/scale,(event.clientY-rect.top)/scale];
  }
  stage.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch")return;
    pointer=pointerPoint(event);chooseActive(focused||hitAt(pointer));
    if(active){const q=localPoint(active,pointer);active.gradient.setAttribute("cx",q[0]);active.gradient.setAttribute("cy",q[1]);}
  });
  stage.addEventListener("pointerleave",()=>{pointer=null;chooseActive(focused);});
  stage.addEventListener("pointercancel",()=>{pointer=null;chooseActive(focused);});
  function refresh(){
    const unavailable=stage.dataset.reference==="true"||stage.dataset.view==="plane";
    $("motion-controls").disabled=unavailable;
    for(const owner of owners)owner.hit.disabled=unavailable||!$("hover-enabled").checked;
    if(!canInteract()){pointer=null;focused=null;chooseActive(null);}
    updateStatus();
  }
  document.addEventListener("mornye-settings-change",()=>{if(active&&active.item.editorVisible===false)chooseActive(null);last=0;refresh();});
  stage.addEventListener("view-change",()=>{pointer=null;focused=null;chooseActive(null);refresh();});
  stage.addEventListener("attachment-change",event=>{
    const owner=owners.find(o=>o.item.id==="gpu");
    setBase(owner,multiply(translation(event.detail.offset,0),owner.item.localToCanvasHomography));
    pointer=null;focused=null;chooseActive(null);
  });
  $("float-enabled").addEventListener("change",refresh);
  $("hover-enabled").addEventListener("change",refresh);
  $("float-strength").addEventListener("input",updateStatus);
  reduce.addEventListener("change",refresh);
  document.addEventListener("visibilitychange",()=>{last=0;if(document.hidden){pointer=null;focused=null;chooseActive(null);}});

  function idle(owner){
    if(!canFloat())return [0,0];
    const strength=Number($("float-strength").value), phase=owner.index*2.399963, period=7.4+(owner.index%5)*.75;
    const start=Math.min(1,elapsed/2.4), ramp=start*start*(3-2*start);
    const x=Math.sin(elapsed*2*Math.PI/(period*1.23)+phase+.6)*owner.amplitude[0]*strength*ramp;
    const y=Math.sin(elapsed*2*Math.PI/period+phase)*owner.amplitude[1]*strength*ramp;
    return [owner.axisX[0]*x+owner.axisY[0]*y,owner.axisX[1]*x+owner.axisY[1]*y];
  }
  function animate(now){
    requestAnimationFrame(animate);
    if(document.hidden||window.MORNYE_SETTINGS?.paused||now-frame<1000/Math.min(window.MORNYE_SETTINGS?.renderFps??60,window.MORNYE_SETTINGS?.generalFps??60)-.5)return;
    frame=now;
    const dt=last?Math.min(.12,(now-last)/1000):1/30;last=now;elapsed+=dt;
    if(pointer&&!focused)chooseActive(hitAt(pointer));
    for(const owner of owners){
      if(owner.item.editorVisible===false)continue;
      const held=owner===active, target=held?owner.hold:idle(owner), smoothing=1-Math.exp(-dt/(held?.065:owner.returning?.18:.14));
      owner.previous=[...owner.current];
      owner.current=owner.current.map((value,i)=>Math.abs(target[i]-value)<.0001?target[i]:value+(target[i]-value)*smoothing);
      owner.weight+=(Number(held)-owner.weight)*(1-Math.exp(-dt/(held?.065:.14)));
      if(Math.abs(owner.weight-Number(held))<.001)owner.weight=Number(held);
      const distance=Math.hypot(...owner.current.map((v,i)=>v-target[i]));
      if(owner.returning&&distance<.07)owner.returning=false;
      const state=held?(distance<.025&&owner.weight>.98?"held":"settling"):owner.returning?"returning":canFloat()?"floating":"still";
      if(owner.root.dataset.motion!==state)owner.root.dataset.motion=state;
      // Every native SVG pane, including its readouts, shares this delta.
      // The equilibrium and the existing H * T_local floating path are retained.
      const delta=multiply(multiply(owner.H,translation(...owner.current)),owner.invH), transform=cssMatrix(delta);
      if(owner.root.style.transform!==transform)owner.root.style.transform=transform;
      owner.root.style.setProperty("--pane-boost",String(1+.10*owner.weight));
      owner.root.style.setProperty("--frame-boost",String(1+.24*owner.weight));
      owner.root.style.setProperty("--text-boost",String(1+.08*owner.weight));
      owner.rim.style.opacity=String(owner.weight);
    }
  }

  stage.addEventListener("layout-update",()=>{
    pointer=null;focused=null;chooseActive(null);
    for(const owner of owners){
      setBase(owner,owner.item.localToCanvasHomography);
      owner.root.style.zIndex=String(owner.item.stackIndex+1);
      owner.root.hidden=owner.item.editorVisible===false;
      owner.current=[0,0];owner.previous=[0,0];owner.hold=[0,0];
      owner.root.style.transform=cssMatrix([[1,0,0],[0,1,0],[0,0,1]]);
    }
    refresh();
  });

  // This composition uses the supplied unified still scene. Panes are placed
  // around its figure; no obsolete D character or foreground alpha is reused.
  masks=[];
  stage.dataset.occlusion="placement-around-unified-still";
  refresh();requestAnimationFrame(animate);
})();
