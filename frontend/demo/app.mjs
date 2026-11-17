import {demoConfig,demoHass} from './fixtures.mjs';
await customElements.whenDefined('mops-air-card');
const scenarios={normal:{},clean:{value:6},raised:{value:88},charging:{charging:true},zero:{value:0,battery:0},stale:{age:900},offline:{connected:false,battery:null,charging:null},empty:{history:false}};
const root=document.querySelector('#cards'),first=document.createElement('mops-air-card');root.append(first);
const config=demoConfig();
function update(){
  const lang=document.querySelector('#language').value,dark=document.querySelector('#theme').value==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.lang=lang;
  document.querySelector('#demo-note').textContent=lang==='en'?'Example data. Settings only change this preview.':'全部为示例数据，设置仅在当前预览中生效。';
  const hass=demoHass(config,{...scenarios[document.querySelector('#scenario').value],lang,dark});
  first.setConfig({...config,language:lang});hass.onChange=()=>{first.hass=hass;};
  // Explicitly refresh synthetic history when switching example scenarios.
  first._lastHistoryAt=0;first.hass=hass;window.demo={card:first,hass,config,demoConfig,demoHass};
  const second=root.querySelector('[data-second]');if(second){const cfg=demoConfig('second');second.setConfig({...cfg,name:'MOPS 2',language:lang});second.hass=demoHass(cfg,{value:52,lang,dark});}
}
for(const id of ['language','theme','scenario'])document.querySelector('#'+id).addEventListener('change',update);
document.querySelector('#second').addEventListener('click',event=>{
  const previous=root.querySelector('[data-second]');if(previous)previous.remove();else{const card=document.createElement('mops-air-card');card.dataset.second='';root.append(card);}
  event.currentTarget.setAttribute('aria-pressed',String(!previous));update();
});
update();
