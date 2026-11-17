// Entirely invented measurements and relative times. No captured HA state.
export function demoConfig(prefix='demo'){
  return {type:'custom:mops-air-card',name:'MOPS',entity:'sensor.'+prefix+'_pm25',measured_entity:'sensor.'+prefix+'_measured',
    battery_entity:'sensor.'+prefix+'_battery',charging_entity:'binary_sensor.'+prefix+'_charging',
    periodic_entity:'switch.'+prefix+'_periodic',interval_entity:'select.'+prefix+'_interval'};
}
export function demoHass(config,{value=24,battery=64,charging=false,age=120,connected=true,history=true,lang='en',dark=false}={}){
  const now=Date.now(),entity=(state,attributes={})=>({state:String(state),attributes,last_updated:new Date(now).toISOString()});
  const states={
    [config.entity]:entity(value??'unavailable',{unit_of_measurement:'μg/m³'}),
    [config.measured_entity]:entity(new Date(now-age*1000).toISOString()),
    [config.battery_entity]:entity(battery??'unknown',{unit_of_measurement:'%'}),
    [config.charging_entity]:entity(charging===null?'unknown':charging?'on':'off'),
    [config.periodic_entity]:entity('on'),[config.interval_entity]:entity('10 min',{options:['10 min','15 min','30 min','60 min','90 min','120 min']}),
  };
  for(const[id,state]of Object.entries(states))state.entity_id=id;
  const connection=new EventTarget();connection.connected=connected;
  const pm=[],measured=[];
  for(let index=0;index<144;index++){
    const at=now-age*1000-(143-index)*600000,received=at+1000;
    const sample=index>=118&&index<=120?'unavailable':Math.max(0,Math.round((value??24)+Math.sin(index*.19)*6+Math.sin(index*.047)*4));
    const row=(id,state,attributes={})=>({entity_id:id,state:String(state),attributes,last_updated:new Date(received).toISOString()});
    pm.push(row(config.entity,index===143&&value!==null?value:sample,{unit_of_measurement:'μg/m³'}));
    measured.push(row(config.measured_entity,sample==='unavailable'?'unavailable':new Date(at).toISOString()));
  }
  const hass={states,locale:{language:lang},themes:{darkMode:dark},config:{time_zone:'UTC'},connection,calls:[],historyMode:'ready',serviceMode:'confirm',
    async callApi(method,path){
      hass.calls.push({method,path});
      if(hass.historyMode==='error')throw Error('Synthetic history failure');
      return history?[pm,measured]:[];
    },
    async callService(domain,service,data){
      hass.calls.push({domain,service,data});
      if(hass.serviceMode==='error')throw Error('Synthetic service failure');
      if(hass.serviceMode==='confirm'){
        const state=states[data.entity_id];state.state=domain==='select'?data.option:service==='turn_on'?'on':'off';
        state.last_updated=new Date(Math.max(Date.now(),Date.parse(state.last_updated)+1)).toISOString();hass.onChange?.();
      }
    },
  };
  return hass;
}
