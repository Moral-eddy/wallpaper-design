"use strict";
(() => {
  const NS='http://www.w3.org/2000/svg';
  const anchors=window.TacetEnvelopeTrace.quarter;
  const slopes=anchors.slice(1).map((p,i)=>(p[1]-anchors[i][1])/(p[0]-anchors[i][0]));
  const tangent=i=>{
    if(i===0)return slopes[0];
    if(i===anchors.length-1)return slopes[slopes.length-1];
    const a=slopes[i-1],b=slopes[i];
    return a*b<=0?0:2*a*b/(a+b);
  };
  const silhouette=x=>{
    if(x<=0)return anchors[0][1];
    if(x>=1)return 0;
    let lower=0,upper=anchors.length-1;
    while(upper-lower>1){const mid=(lower+upper)>>1;if(anchors[mid][0]<=x)lower=mid;else upper=mid;}
    const a=anchors[lower],b=anchors[upper],dx=b[0]-a[0],t=(x-a[0])/dx;
    const ma=a[2]?slopes[lower]:tangent(lower),mb=b[2]?slopes[lower]:tangent(upper);
    return Math.max(0,(2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*dx*ma+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*dx*mb);
  };
  const knots=[...new Set([...Array.from({length:385},(_,i)=>i/384),...anchors.map(a=>a[0])])].sort((a,b)=>a-b);
  const cusps=new Set(anchors.filter(a=>a[2]).map(a=>a[0]));
  const responseAt=(values,x)=>{
    const position=Math.max(0,Math.min(63,x*64)),lower=Math.floor(position),fraction=position-lower;
    const a=values[lower]||0,b=values[Math.min(63,lower+1)]||0;
    return Math.max(0,Math.min(1,a+(b-a)*fraction));
  };
  const node=(name,attributes={},text)=>{
    const item=document.createElementNS(NS,name);
    for(const [key,value]of Object.entries(attributes))item.setAttribute(key,value);
    if(text!==undefined)item.textContent=text;
    return item;
  };
  const number=x=>x.toFixed(3);
  const analyze=values=>{
    let total=0,weighted=0,peakPower=0,peak=null;
    for(let i=0;i<64;i++){
      const amplitude=Math.max(0,Math.min(1,Number(values[i])||0)),power=amplitude*amplitude;
      total+=power;weighted+=i*power;
      if(power>peakPower){peakPower=power;peak=i;}
    }
    return {peak:total>1e-8?peak:null,centroid:total>1e-8?weighted/total:null};
  };
  let sequence=0;
  function mount(svg,options={}){
    const native=options.native===true;
    const width=native?650:Math.max(280,options.width||980),height=native?117:options.height||300;
    const centerX=width/2,centerY=native?75:height/2;
    const halfSpan=native?216.5:width*(216.5/650);
    const amplitudeTop=native?38:height*.06,amplitudeBottom=native?112:height*.94;
    const maxHeight=Math.min(centerY-amplitudeTop,amplitudeBottom-centerY);
    const prefix='tacet-compact-'+ ++sequence;
    svg.replaceChildren();
    svg.setAttribute('viewBox',options.detail?'223 36 204 78':`0 0 ${width} ${height}`);
    svg.append(node('title',{},options.detail?'已确认声痕形态 · 矢量放大':native?'15号窗 · 433像素声痕与分析装饰':'居中声痕与两侧频段分析'));
    svg.append(node('desc',{},'保留用户确认的截图包络形态。650×117窗内声痕宽433像素，峰值索引与能量加权谱心在两侧显示0至63的频段位置，静音显示空值。当前独立浏览器为模拟输入。'));
    const defs=node('defs');
    const glow=node('filter',{id:prefix+'-glow',x:'-20%',y:'-100%',width:'140%',height:'300%'});
    glow.append(node('feGaussianBlur',{stdDeviation:native?.65:1.1}));defs.append(glow);
    const gradient=node('linearGradient',{id:prefix+'-ink',x1:0,y1:-maxHeight,x2:0,y2:0,gradientUnits:'userSpaceOnUse'});
    gradient.append(node('stop',{offset:0,'stop-color':'#edfaff'}),node('stop',{offset:1,'stop-color':'#96dfee'}));defs.append(gradient);
    const contour=node('path',{id:prefix+'-contour'}),area=node('path',{id:prefix+'-area'}),ghost=node('path',{id:prefix+'-ghost'});
    defs.append(contour,area,ghost);svg.append(defs);
    const guides=node('g',{fill:'none',stroke:'#537785','stroke-width':.55,opacity:.3});
    guides.append(node('path',{d:`M${centerX} ${native?37:12}V${native?113:height-12}`}));
    svg.append(guides);
    const body=node('g',{transform:`translate(${centerX} ${centerY})`});
    body.append(node('path',{d:`M${-halfSpan} 0H${halfSpan}`,fill:'none',stroke:'#79bacb','stroke-width':.35,opacity:.18}));
    for(const sign of [-1,1]){
      const x=sign*(halfSpan+3);
      body.append(node('path',{d:`M${x} -5V5M${x} 0h${sign*3}`,fill:'none',stroke:'#638997','stroke-width':.6,opacity:.38}));
    }
    const transforms=['scale(1 1)','scale(-1 1)','scale(1 -1)','scale(-1 -1)'];
    const layers=[
      {path:'ghost',fill:'none',stroke:'#a5e2ec','stroke-width':native?.36:.5,opacity:.08},
      {path:'area',fill:`url(#${prefix}-ink)`,stroke:'none',opacity:.045},
      {path:'contour',fill:'none',stroke:'#a3e7f2','stroke-width':native?1.65:2.3,opacity:.25,filter:`url(#${prefix}-glow)`},
      {path:'contour',fill:'none',stroke:`url(#${prefix}-ink)`,'stroke-width':native?.8:1.1,opacity:.96,'stroke-linejoin':'round'}
    ];
    for(const layer of layers){
      const {path,...attributes}=layer,group=node('g',attributes);
      for(const transform of transforms)group.append(node('use',{href:`#${prefix}-${path}`,transform}));
      body.append(group);
    }
    svg.append(body);
    if(native&&!options.detail){
      if(options.frame!==false)svg.append(node('path',{d:'M20 1H1V20M630 1H649V20M630 116H649V97M20 116H1V97',fill:'none',stroke:'#a3ddeb','stroke-width':1.2,opacity:.8}));
      svg.append(node('text',{x:21,y:25,fill:'#cae7f1','font-family':'Rajdhani,Microsoft YaHei,sans-serif','font-size':13,'font-weight':600,'letter-spacing':1.5},'TACET RESONANCE'));
      svg.append(node('text',{x:628,y:25,fill:'#adcddc','text-anchor':'end','font-family':'Oxanium,sans-serif','font-size':10},'15'));
      svg.append(node('path',{d:'M21 35H629',fill:'none',stroke:'#517f92','stroke-width':.55,opacity:.4}));
      svg.append(node('text',{x:325,y:25,fill:'#718f9e','text-anchor':'middle','font-family':'Rajdhani,Microsoft YaHei,sans-serif','font-size':11,'letter-spacing':1},'64 × 2 / MIRROR'));
    }
    const analysisFields=[];
    if(!options.detail&&(native||width>=540)){
      const offset=native?21:16,slot=native?72:Math.min(112,(width/2-halfSpan)-32);
      const labelY=centerY-(native?24:34),valueY=centerY-(native?7:6),rulerY=centerY+(native?9:17),footerY=centerY+(native?28:38);
      const labelStyle={fill:'#8aaebb','font-family':'Rajdhani,Microsoft YaHei,sans-serif','font-size':11,'font-weight':500,'letter-spacing':.8};
      for(const [name,x,label] of [['peak',offset,'PEAK BIN'],['centroid',width-offset-slot,'CENTROID']]){
        const group=node('g',{'aria-label':name==='peak'?'峰值频段索引':'能量加权谱心索引'});
        group.append(node('text',{x,y:labelY,...labelStyle},label));
        const value=node('text',{x,y:valueY,fill:'#bcdce7','font-family':'Oxanium,sans-serif','font-size':native?17:23,'font-weight':500,style:'font-variant-numeric:tabular-nums'},'—');
        group.append(value);
        const ruler=node('g',{fill:'none',stroke:'#537b8b','stroke-width':.6,opacity:.6});
        ruler.append(node('path',{d:`M${x} ${rulerY}H${x+slot}`}));
        for(let i=0;i<=8;i++){
          const tickX=x+slot*i/8,tickHeight=i%4===0?5:3;
          ruler.append(node('path',{d:`M${tickX} ${rulerY-tickHeight/2}V${rulerY+tickHeight/2}`}));
        }
        group.append(ruler);
        const marker=node('path',{fill:'none',stroke:'#b3e5ef','stroke-width':1.4,visibility:'hidden'});group.append(marker);
        group.append(node('text',{x,y:footerY,...labelStyle,fill:'#587e90'},'00 — 63'));
        const separatorX=name==='peak'?centerX-halfSpan-12:centerX+halfSpan+12;
        group.append(node('path',{d:`M${separatorX} ${centerY-25}V${centerY-11}M${separatorX} ${centerY+11}V${centerY+25}`,fill:'none',stroke:'#476879','stroke-width':.5,opacity:.45}));
        svg.append(group);analysisFields.push({name,x,slot,value,marker,rulerY});
      }
    }
    // Map normalized audio response to the full available height; zero is the center line.
    // No static amplitude offset.
    const visualLevel=amplitude=>Math.max(0,Math.min(1,amplitude));
    function quarter(values){
      const points=knots.map(x=>({x:x*halfSpan,y:x===1?0:-maxHeight*visualLevel(responseAt(values,x))*silhouette(x),cusp:cusps.has(x)}));
      const segmentSlopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x));
      const smooth=i=>{
        if(i===0)return segmentSlopes[0];
        if(i===points.length-1)return segmentSlopes[segmentSlopes.length-1];
        const a=segmentSlopes[i-1],b=segmentSlopes[i];
        return a*b<=0?0:2*a*b/(a+b);
      };
      let d=`M${number(points[0].x)} ${number(points[0].y)}`;
      for(let i=0;i<points.length-1;i++){
        const a=points[i],b=points[i+1],dx=(b.x-a.x)/3;
        const ma=a.cusp?segmentSlopes[i]:smooth(i),mb=b.cusp?segmentSlopes[i]:smooth(i+1);
        d+=`C${number(a.x+dx)} ${number(a.y+ma*dx)} ${number(b.x-dx)} ${number(b.y-mb*dx)} ${number(b.x)} ${number(b.y)}`;
      }
      return d;
    }
    ghost.setAttribute('d',quarter(Array(64).fill(0)));
    const draw=(values,metrics=analyze(values))=>{
      const d=quarter(values);contour.setAttribute('d',d);area.setAttribute('d',d+'L0 0Z');
      for(const field of analysisFields){
        const position=metrics[field.name];
        field.value.textContent=position===null?'—':field.name==='peak'?String(position).padStart(2,'0'):position.toFixed(1).padStart(4,'0');
        field.marker.setAttribute('visibility',position===null?'hidden':'visible');
        if(position!==null){const markerX=field.x+field.slot*position/63;field.marker.setAttribute('d',`M${markerX} ${field.rulerY-4}V${field.rulerY+4}`);}
      }
    };
    draw(Array(64).fill(0));
    return {draw,setAxis:show=>guides.setAttribute('visibility',show?'visible':'hidden')};
  }
  window.TacetMarkSvg={mount,silhouette,anchors,analyze};
})();
