const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../configure.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element() {
  return {value:'',textContent:'',hidden:false,disabled:false,children:[],listeners:{},dataset:{},
          replaceChildren(){this.children=[];},append(node){this.children.push(node);},
          addEventListener(name,callback){this.listeners[name]=callback;}};
}
const elements = Object.fromEntries(['adapter','source','csv','awcc','csv-row','awcc-row','message','source-help','save-status'].map(id=>[id,element()]));
let snapshot={network:{adapter:'Demo',availableAdapters:[{name:'Demo'}]},
              cpu:{temperatureSource:'hwinfo_csv',temperatureSources:{hwinfo_csv:{availableSensors:[]}},
                   temperatureProvider:{message:'CSV missing'}},alienware:{sensors:[]}};
const context={document:{activeElement:null,getElementById:id=>elements[id],createElement:()=>element()},
               setInterval:()=>{},fetch:async (url,options)=>{
                 if(options?.method==='POST'){
                   const data=JSON.parse(options.body);
                   if(data.temperatureSource){snapshot.cpu.temperatureSource=data.temperatureSource;snapshot.cpu.temperatureProvider.message='Export missing';}
                   return {ok:true,json:async()=>({status:'configured'})};
                 }
                 return {ok:true,json:async()=>snapshot};
               }};
vm.createContext(context);
vm.runInContext(script,context,{filename:'configure.html script'});
(async()=>{
  await context.refresh();
  assert.equal(elements['csv-row'].hidden,false);
  assert.equal(elements['awcc-row'].hidden,true);
  elements.source.value='alienware_wmi';
  await elements.source.listeners.change({target:elements.source});
  await new Promise(resolve=>setImmediate(resolve));
  await context.refresh();
  assert.equal(elements['csv-row'].hidden,true);
  assert.equal(elements['awcc-row'].hidden,false);
  assert.equal(elements.awcc.disabled,true);
  assert.equal(elements.message.textContent,'Export missing');
  assert.ok(elements['save-status'].textContent.includes('已保存'));
  assert.ok(elements['source-help'].textContent.includes('选择 Alienware 导出'));
  snapshot.alienware.sensors=[{key:'0x01',valueC:65}];
  snapshot.cpu.temperatureProvider={message:'Choose CPU sensor',sensorKey:null};
  await context.refresh();
  assert.equal(elements.awcc.disabled,false);
  assert.equal(elements.awcc.children[1].value,'0x01');
  assert.equal(elements.message.textContent,'Choose CPU sensor');
  assert.ok(html.includes('[hidden]{display:none!important}'));
  console.log('Source-page logic checks completed; no visual acceptance performed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
