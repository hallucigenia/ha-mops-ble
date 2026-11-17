import {tone,projectHistory,curve,fills} from './history.mjs';
export {tone,projectHistory,curve,fills};
export const HOUR=3600000;
export function present(entity){return !!entity&&!entity.attributes?.restored&&!['unknown','unavailable',''].includes(entity.state);}
export function number(entity,unit,min=0,max=65535){
  const raw=entity?.state,value=typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;
  const unitValue=entity?.attributes?.unit_of_measurement;
  const actual=typeof unitValue==='string'?unitValue.replaceAll('µ','μ'):null;
  return present(entity)&&actual===unit&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
}
export function flag(entity){return present(entity)&&['on','off'].includes(entity.state)?entity.state==='on':null;}
export function currentModel(states,config,connected=true,now=Date.now()){
  const periodic=flag(states[config.periodic_entity]),setting=states[config.interval_entity];
  const interval=present(setting)&&/^\d+ min$/.test(setting.state)?Number(setting.state.split(' ')[0]):null;
  const stamp=states[config.measured_entity],parsed=present(stamp)?Date.parse(stamp.state):NaN,measured=Number.isFinite(parsed)?parsed:null;
  // Match the integration's actual-sample lifetime, not repeated BLE reports.
  const ttl=Math.max(180,(periodic&&interval!==null?interval:1)*60+90)*1000;
  const fresh=connected&&measured!==null&&now-measured>=-60000&&now-measured<=ttl;
  const raw=number(states[config.entity],'μg/m³'),value=fresh?raw:null;
  const status=!connected?'disconnected':measured===null?'waiting':!fresh?'stale':raw===null?'unavailable':'';
  return {value,measured,fresh,available:value!==null,connected,periodic,interval,ttl,status,
    battery:connected?number(states[config.battery_entity],'%',0,100):null,charging:connected?flag(states[config.charging_entity]):null,
    canPeriodic:connected&&periodic!==null,canInterval:connected&&periodic===true&&present(setting),
    options:present(setting)&&Array.isArray(setting.attributes?.options)?setting.attributes.options.filter(option=>/^\d+ min$/.test(option)):[]};
}
export function decodeHistory(groups,config){
  if(!Array.isArray(groups)||groups.some(rows=>!Array.isArray(rows)))throw Error('Invalid history response');
  const records=id=>(groups.find(rows=>rows[0]?.entity_id===id)||[]).map(row=>({...row,received:Date.parse(row.last_updated||row.last_changed)})).filter(row=>Number.isFinite(row.received)).sort((a,b)=>a.received-b.received);
  const values=records(config.entity),stamps=records(config.measured_entity),points=new Map();
  if(!stamps.length)return values.map(row=>({at:row.received,value:number(row,'μg/m³')}));
  let cursor=-1;
  for(const row of stamps){
    // Both native sensor events come from the same coordinator update. Allow
    // a small scheduling offset, then place each sample at the device timestamp.
    while(cursor+1<values.length&&values[cursor+1].received<=row.received+100)cursor++;
    const at=present(row)?Date.parse(row.state):NaN,value=cursor>=0?number(values[cursor],'μg/m³'):null;
    if(!Number.isFinite(at)||at>row.received+60000)points.set(row.received,null);
    else if(value!==null)points.set(at,value);
    else points.set(row.received,null);
  }
  for(const row of values)if(number(row,'μg/m³')===null)points.set(row.received,null);
  return [...points].map(([at,value])=>({at,value})).sort((a,b)=>a.at-b.at);
}
export function historyModel(recorded,current,hours,now=Date.now(),options={}){
  const points=new Map(recorded.map(point=>[point.at,point.value]));
  if(current.available&&current.measured<=now)points.set(current.measured,current.value);
  const selected=[...points].map(([at,value])=>({at,value})).filter(point=>point.at>=now-hours*HOUR&&point.at<=now).sort((a,b)=>a.at-b.at);
  if(!selected.some(point=>Number.isFinite(point.value)))return null;
  return projectHistory(selected,now-hours*HOUR,now,options);
}
