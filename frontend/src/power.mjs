import {translate} from './i18n.mjs';
export function powerModel(battery,charging,locale='en'){
  const value=typeof battery==='number'&&Number.isFinite(battery)&&battery>=0&&battery<=100?battery:null;
  const charge=typeof charging==='boolean'?charging:null;
  const state=charge===true?'charging':value===null||charge===null?'unknown':value<=10?'critical':value<=20?'low':value===100?'full':'normal';
  const percentage=value===null?'—':Math.round(value)+'%';
  const t=(key,values)=>translate(locale,key,values);
  const mode=t(charge===true?'chargeOn':charge===false?'chargeOff':'chargeUnknown');
  const warning=charge===false&&value!==null?(value<=10?t('critical'):value<=20?t('low'):''):'';
  return {state,value,charging:charge,percentage,fill:value===null?0:16.5*value/100,label:[value===null?t('batteryUnknown'):t('batteryValue',{value:percentage}),mode,warning].filter(Boolean).join(' · ')};
}
export function powerMarkup(){
  return `<svg class="power-icon" viewBox="0 0 28 18" aria-hidden="true">
    <defs><clipPath id="power-filled"><rect class="battery-mask" x="4.25" y="5.25" width="6.6" height="7.5" rx=".65"/></clipPath><linearGradient id="power-sheen"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".5" stop-color="white" stop-opacity=".95"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>
    <rect class="battery-outline" x="2.25" y="3.25" width="21" height="11.5" rx="2.1"/><path class="battery-terminal" d="M25.25 6.75v4.5"/>
    <rect class="battery-level" x="4.25" y="5.25" width="6.6" height="7.5" rx=".65"/>
    <g clip-path="url(#power-filled)"><rect class="battery-sheen" x="-8" y="5.25" width="9" height="7.5" fill="url(#power-sheen)"/></g>
    <path class="battery-bolt" d="m14.5 4.8-5 5h3l-1.4 3.4 5.2-5.3h-3.1Z" hidden/>
  </svg><span class="power-percentage" aria-hidden="true">—</span>`;
}
export function updatePower(element,battery,charging,locale='en'){
  const model=powerModel(battery,charging,locale);
  element.dataset.powerState=model.state;element.setAttribute('aria-label',model.label+' · '+translate(locale,'deviceInfo'));element.title=model.label;
  element.querySelector('.power-percentage').textContent=model.percentage;
  for(const selector of ['.battery-level','.battery-mask'])element.querySelector(selector).setAttribute('width',String(model.fill));
  element.querySelector('.battery-bolt').toggleAttribute('hidden',model.charging!==true);
  return model;
}
