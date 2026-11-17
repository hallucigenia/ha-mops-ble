import test from 'node:test';
import assert from 'node:assert/strict';
import {currentModel,decodeHistory,historyModel,HOUR} from '../src/model.mjs';
import {tone,curve} from '../src/history.mjs';
import {powerModel} from '../src/power.mjs';
import {language,translate,translationKeys} from '../src/i18n.mjs';
import {demoConfig} from '../demo/fixtures.mjs';
import {bundle} from '../build.mjs';
const now=Date.UTC(2020,0,1),config=demoConfig();
const entity=(state,attributes={})=>({state:String(state),attributes,last_updated:new Date(now).toISOString()});
function states(){return{
  [config.entity]:entity(0,{unit_of_measurement:'μg/m³'}),[config.measured_entity]:entity(new Date(now-120000).toISOString()),
  [config.periodic_entity]:entity('on'),[config.interval_entity]:entity('10 min',{options:['10 min','30 min']}),
  [config.battery_entity]:entity(0,{unit_of_measurement:'%'}),[config.charging_entity]:entity('off'),
};}
test('Zero is valid, and only the actual sample timestamp grants freshness',()=>{
  const s=states();assert.equal(currentModel(s,config,true,now).value,0);assert.equal(currentModel(s,config,true,now).battery,0);
  s[config.measured_entity].state=new Date(now-14*60000).toISOString();s[config.entity].last_updated=new Date(now).toISOString();
  assert.equal(currentModel(s,config,true,now).value,null);s[config.interval_entity].state='60 min';assert.equal(currentModel(s,config,true,now).value,0);
  s[config.periodic_entity].state='off';assert.equal(currentModel(s,config,true,now).value,null);
});
test('Invalid, restored, wrong-unit, future and disconnected samples stay unavailable',()=>{
  for(const raw of ['', 'unknown','unavailable',-1,65536,'NaN']){const s=states();s[config.entity].state=String(raw);assert.equal(currentModel(s,config,true,now).value,null);}
  const s=states();s[config.entity].attributes.restored=true;assert.equal(currentModel(s,config,true,now).value,null);delete s[config.entity].attributes.restored;
  s[config.entity].attributes.unit_of_measurement='mg/m³';assert.equal(currentModel(s,config,true,now).value,null);
  s[config.entity].attributes.unit_of_measurement=123;assert.equal(currentModel(s,config,true,now).value,null);
  s[config.entity].attributes.unit_of_measurement='μg/m³';s[config.measured_entity].state=new Date(now+120000).toISOString();assert.equal(currentModel(s,config,true,now).value,null);
  const offline=currentModel(states(),config,false,now);assert.equal(offline.value,null);assert.equal(offline.battery,null);assert.equal(offline.charging,null);assert(!offline.canPeriodic);
});
test('Both Unicode micro symbols are accepted without accepting a different unit',()=>{
  const s=states();s[config.entity].attributes.unit_of_measurement='µg/m³';assert.equal(currentModel(s,config,true,now).value,0);
});
test('Missing or unavailable entities degrade without a fabricated setting or charge state',()=>{
  const s=states();delete s[config.battery_entity];delete s[config.charging_entity];s[config.periodic_entity].state='unavailable';
  const m=currentModel(s,config,true,now);assert.equal(m.value,0);assert.equal(m.battery,null);assert.equal(m.charging,null);assert(!m.canPeriodic);assert(!m.canInterval);
  s[config.periodic_entity].state='on';s[config.interval_entity].attributes.restored=true;assert(!currentModel(s,config,true,now).canInterval);
});
const row=(id,state,received,attributes={})=>({entity_id:id,state:String(state),last_updated:new Date(received).toISOString(),attributes});
test('History uses actual sample times, removes repeated samples and preserves explicit gaps',()=>{
  const pm=[row(config.entity,0,now-600000,{unit_of_measurement:'μg/m³'}),row(config.entity,'unavailable',now-400000,{unit_of_measurement:'μg/m³'}),row(config.entity,12,now-1000,{unit_of_measurement:'μg/m³'})];
  const stamps=[row(config.measured_entity,new Date(now-620000).toISOString(),now-600000),row(config.measured_entity,new Date(now-620000).toISOString(),now-590000),row(config.measured_entity,'unavailable',now-400000),row(config.measured_entity,new Date(now-2000).toISOString(),now-1000)];
  const points=decodeHistory([pm,stamps],config);assert.deepEqual(points.filter(p=>p.value!==null),[{at:now-620000,value:0},{at:now-2000,value:12}]);
  const model=historyModel(points,{available:false},6,now);assert.equal(model.min,0);assert.equal(model.max,12);assert.equal((curve(model.points).match(/M/g)||[]).length,2);assert(model.points.at(-1).x<360);
});
test('History fallback uses recorded time only when no timestamp history is present',()=>{
  const pm=[row(config.entity,8,now-600000,{unit_of_measurement:'μg/m³'})];
  assert.deepEqual(decodeHistory([pm],config),[{at:now-600000,value:8}]);
  assert.throws(()=>decodeHistory([null],config),/Invalid history/);
});
test('A single measurement is not stretched across the time window',()=>{
  const current={available:true,measured:now-HOUR,value:5},model=historyModel([],current,6,now);
  assert.equal(model.points.length,1);assert.equal(model.points[0].at,current.measured);assert.equal(historyModel([],current,.5,now),null);
});
test('Concentration buffers keep color and cadence from oscillating',()=>{
  let band=tone(34);for(const value of [36,34,37]){band=tone(value,band);assert.equal(band,'sage');}
  assert.equal(tone(38,band),'ochre');assert.equal(tone(33,'ochre'),'ochre');assert.equal(tone(31,'ochre'),'sage');assert.equal(tone(78,'ochre'),'clay');assert.equal(tone(74,'clay'),'clay');assert.equal(tone(71,'clay'),'ochre');assert.equal(tone(null,band),'inactive');
});
test('Battery fill, low charge and unknown states retain their actual meaning',()=>{
  assert.equal(powerModel(0,false).fill,0);assert.equal(powerModel(0,false).state,'critical');assert.equal(powerModel(20,false).state,'low');
  assert.equal(powerModel(9,true).state,'charging');assert.equal(powerModel(100,false).state,'full');assert.equal(powerModel(50,null).state,'unknown');
  assert.equal(powerModel(101,false).value,null);assert.equal(powerModel(null,false).percentage,'—');
  assert.match(powerModel(50,true,'zh-Hans').label,/正在充电/);
});
test('Language follows HA, explicit overrides work, and translation keys match',()=>{
  assert.equal(language({}, {locale:{language:'zh-CN'}}),'zh-Hans');assert.equal(language({language:'en'},{locale:{language:'zh-CN'}}),'en');
  assert.equal(language({},{}),'en');assert.deepEqual(translationKeys.en,translationKeys['zh-Hans']);
  assert.equal(translate('en','every',{count:30}),'Every 30 minutes');
});
test('The distributable is deterministic and has no demo adapters or external imports',async()=>{
  const a=await bundle();assert.equal(a,await bundle());assert(!/^import /m.test(a));assert(!a.includes('demoHass'));
  assert(!a.includes('callApi(\'POST\''));assert(a.includes('data:image/png;base64,'));
});
