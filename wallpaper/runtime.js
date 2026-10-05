"use strict";
(() => {
  const A=window.SAMPLE_ASSETS, $=id=>document.getElementById(id);
  const stage=$("stage"), target=$("target-scene"), mapping=A.targetMapping;
  let view="scene";
  const matrix=m=>`matrix3d(${[m[0][0],m[1][0],0,m[2][0],m[0][1],m[1][1],0,m[2][1],0,0,1,0,m[0][2],m[1][2],0,m[2][2]].join(",")})`;
  const sources=new Map(A.panes.map(item=>[item.id,item.svg]));
  const parser=new DOMParser();
  for(const item of A.windows){
    const root=document.createElement("div");root.className="native-pane";root.dataset.window=item.id;root.hidden=item.editorVisible===false;
    const [w,h]=item.localPaneSize;
    Object.assign(root.style,{width:`${w}px`,height:`${h}px`,zIndex:String(item.stackIndex+1),transform:matrix(item.localToCanvasHomography)});
    const pane=document.importNode(parser.parseFromString(sources.get(item.id),"image/svg+xml").documentElement,true);
    const layers=[...pane.children].filter(node=>node.localName==="svg");
    for(const [index,name] of ["glass","frame-glow","technical"].entries())if(layers[index])layers[index].dataset.layer=name;
    const content=pane.querySelector(".pane-content");if(content){content.classList.add("native-readouts");content.dataset.layer="content-active";}
    root.append(pane);$("window-stack").append(root);
  }
  const s=mapping.uniformScale,[tx,ty]=mapping.translate;
  $("scene").style.transform=`matrix(${s},0,0,${s},${tx},${ty})`;
  $("float-enabled").checked=A.acceptedMotion.floatEnabled;
  $("hover-enabled").checked=A.acceptedMotion.hoverEnabled;
  $("float-strength").value=A.acceptedMotion.floatStrength;

  function cropForView(){
    if(view!=="cpu"&&view!=="gpu")return [0,0,3440,1440];
    const item=A.windows.find(item=>item.id===view);
    const q=item.outerQuad.map(([x,y])=>[x*s+tx,y*s+ty]);
    const margin=100;
    const x=Math.max(0,Math.min(...q.map(p=>p[0]))-margin);
    const y=Math.max(0,Math.min(...q.map(p=>p[1]))-margin);
    const right=Math.min(3440,Math.max(...q.map(p=>p[0]))+margin);
    const bottom=Math.min(1440,Math.max(...q.map(p=>p[1]))+margin);
    return [x,y,right-x,bottom-y];
  }
  function resize(){
    if(document.body.dataset.wallpaper==="true"){
      const width=stage.clientWidth,height=stage.clientHeight;
      if(width<=0||height<=0)return;
      const scale=(window.MORNYE_SETTINGS?.fitMode==="cover"?Math.max:Math.min)(width/3440,height/1440);
      stage.style.aspectRatio="auto";
      target.style.transform=`matrix(${scale},0,0,${scale},${(width-3440*scale)/2},${(height-1440*scale)/2})`;
      return;
    }
    const [x,y,w,h]=cropForView();
    stage.classList.toggle("pixel-view",view==="pixels");
    stage.style.aspectRatio=view==="pixels"?"auto":`${w} / ${h}`;
    let scale=view==="pixels"?1:stage.clientWidth/w;
    let padX=0,padY=0;
    if(document.fullscreenElement===stage&&view!=="pixels"){
      scale=Math.min(stage.clientWidth/w,stage.clientHeight/h);
      padX=(stage.clientWidth-w*scale)/2;padY=(stage.clientHeight-h*scale)/2;
    }
    target.style.transform=`matrix(${scale},0,0,${scale},${padX-x*scale},${padY-y*scale})`;
  }
  function setView(next){
    view=next;stage.dataset.view=view;
    stage.scrollLeft=0;stage.scrollTop=0;
    for(const button of document.querySelectorAll("[data-view]"))button.setAttribute("aria-pressed",String(button.dataset.view===view));
    $("view-note").textContent=view==="pixels"?"100% CSS像素显示，可滚动查看。可拖动窗口；方向键微调位置。":view==="scene"?"默认显示14个悬浮窗，07/08固定隐藏。":`${view.toUpperCase()}局部：鼠标移入窗体，观察停稳与局部提亮；移开后恢复浮动。`;
    resize();stage.dispatchEvent(new CustomEvent("view-change",{detail:{view,reference:false}}));
  }
  for(const button of document.querySelectorAll("[data-view]"))button.addEventListener("click",()=>setView(button.dataset.view));
  $("reset-motion").addEventListener("click",()=>{
    $("float-enabled").checked=A.acceptedMotion.floatEnabled;
    $("hover-enabled").checked=A.acceptedMotion.hoverEnabled;
    $("float-strength").value=A.acceptedMotion.floatStrength;
    $("float-enabled").dispatchEvent(new Event("change"));
    $("hover-enabled").dispatchEvent(new Event("change"));
    $("float-strength").dispatchEvent(new Event("input"));
  });
  $("fullscreen").addEventListener("click",()=>{
    stage.requestFullscreen().catch(()=>{$("view-note").textContent="当前浏览器未提供全屏；可以使用100%像素视图。";});
  });
  stage.addEventListener("fit-change",resize);
  document.addEventListener("fullscreenchange",resize);
  new ResizeObserver(resize).observe(stage);
  setView("scene");
})();
