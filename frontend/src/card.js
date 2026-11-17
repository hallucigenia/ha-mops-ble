import {currentModel,decodeHistory,historyModel,present,HOUR} from './model.mjs';
import {tone,curve,fills} from './history.mjs';
import {createRingBreathing,ringMarkup} from './ring.mjs';
import {powerMarkup,updatePower} from './power.mjs';
import {language,translate} from './i18n.mjs';
// STYLE, TEMPLATE and VERSION are supplied by the dependency-free build.
class MopsAirCard extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});
    this._history=[];this._observed=new Map();this._historyState='pending';this._historyVersion=0;
    this._period=6;this._expanded=false;this._visible=true;this._connected=true;this._generation=0;
    this._lastSample=null;this._tone=null;this._feedback='';this._pending=null;
    this._visibility=()=>{this._motion();if(!document.hidden)this._tick();};
    this._disconnected=()=>{this._connected=false;this._generation++;this._loading=false;this._render(true);};
    this._reconnected=()=>{this._connected=true;this._lastHistoryAt=0;this._tick();};
    this._reduce=()=>{this._render(true);this._motion();};
  }
  setConfig(config){
    const domains={entity:'sensor',measured_entity:'sensor',battery_entity:'sensor',charging_entity:'binary_sensor',periodic_entity:'switch',interval_entity:'select'};
    for(const[key,domain]of Object.entries(domains)){
      if(typeof config?.[key]!=='string'||!new RegExp('^'+domain+'\\.[a-z0-9_]+$').test(config[key]))
        throw Error('MOPS: configure '+key+' with a '+domain+' entity from the same monitor');
    }
    if(config.language&&!['auto','en','zh-Hans'].includes(config.language))throw Error('MOPS: language must be auto, en, or zh-Hans');
    for(const key of ['name','location'])if(config[key]!==undefined&&typeof config[key]!=='string')throw Error('MOPS: '+key+' must be text');
    const binding=Object.keys(domains).map(key=>config[key]).join('|');
    if(binding!==this._binding){
      this._generation++;this._loading=false;this._history=[];this._observed.clear();this._historyState='pending';
      this._lastHistoryAt=0;this._lastSample=this._selectedAt=null;this._tone=null;this._pending=null;this._feedback='';clearTimeout(this._controlTimer);
    }
    this._binding=binding;this._config={...config,name:config.name?.trim()||'MOPS',location:config.location?.trim()||''};
    if(!this._initialized)this._initialize();this._render(true);this._maybeHistory();
  }
  get hass(){return this._hass;}
  set hass(value){
    this._hass=value;if(this.isConnected)this._bindConnection();
    this._connected=value.connection?.connected!==false;this.toggleAttribute('data-dark',!!value.themes?.darkMode);
    this._render();this._maybeHistory();
  }
  connectedCallback(){
    this._generation++;this._loading=false;if(this._historyState!=='ready')this._lastHistoryAt=0;
    if(!this._initialized)this._initialize();this._bindConnection();
    this._observer=new IntersectionObserver(entries=>{this._visible=entries[0]?.isIntersecting!==false;this._motion();if(this._visible)this._tick();});this._observer.observe(this);
    document.addEventListener('visibilitychange',this._visibility);this._media=matchMedia('(prefers-reduced-motion: reduce)');this._media.addEventListener('change',this._reduce);
    this._timer=setInterval(()=>{if(this._visible&&!document.hidden)this._tick();},30000);this._tick();
  }
  disconnectedCallback(){
    this._generation++;clearInterval(this._timer);clearTimeout(this._flashTimer);clearTimeout(this._controlTimer);this._pending=null;
    this._observer?.disconnect();document.removeEventListener('visibilitychange',this._visibility);this._media?.removeEventListener('change',this._reduce);
    this._unbind();this._q('#device-dialog')?.close();this._breathing?.stop();this._motion();
  }
  _bindConnection(){
    if(this._connection===this._hass?.connection)return;this._unbind();this._connection=this._hass?.connection;
    this._connection?.addEventListener('disconnected',this._disconnected);this._connection?.addEventListener('ready',this._reconnected);
  }
  _unbind(){this._connection?.removeEventListener('disconnected',this._disconnected);this._connection?.removeEventListener('ready',this._reconnected);this._connection=null;}
  getCardSize(){return this._expanded?8:4;}
  _q(selector){return this.shadowRoot.querySelector(selector);}
  _t(key,values){return translate(this._locale||'en',key,values);}
  _initialize(){
    this.shadowRoot.innerHTML='<style>'+STYLE+'</style>'+TEMPLATE;
    this._q('.product-stage').insertAdjacentHTML('beforeend',ringMarkup());this._breathing=createRingBreathing(this._q('.ring-breath'));this._initialized=true;
    this._q('#power-status').innerHTML=powerMarkup();updatePower(this._q('#power-status'),null,null);
    for(const id of ['#reading','#device','#spark-button'])this._q(id).addEventListener('click',()=>this._toggle(!this._expanded,this._q(id)));
    this._q('#collapse').addEventListener('click',()=>{this._toggle(false);this._opener?.focus();});
    this.shadowRoot.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{this._period=Number(button.dataset.period);this._selectedAt=null;this._drawHistory();}));
    const dialog=this._q('#device-dialog');
    for(const id of ['#info','#power-status'])this._q(id).addEventListener('click',()=>{this._dialogOpener=this._q(id);this._renderInfo();dialog.showModal();});
    this._q('#close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>this._dialogOpener?.focus());
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
    this.shadowRoot.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open&&this._expanded){event.preventDefault();event.stopPropagation();this._toggle(false);this._opener?.focus();}});
    const chart=this._q('#chart'),select=event=>{if(event.type==='pointermove'&&event.pointerType==='touch'&&!event.buttons)return;const rect=chart.getBoundingClientRect();this._nearest((event.clientX-rect.left)/rect.width*360);};
    chart.addEventListener('pointermove',select);chart.addEventListener('pointerdown',select);chart.addEventListener('pointerleave',()=>{this._selectedAt=null;this._drawSelection();});
    chart.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!this._chart?.length)return;event.preventDefault();
      const current=this._selectedAt===null?this._chart.length-1:Math.max(0,this._chart.findIndex(p=>p.at===this._selectedAt));
      const index=event.key==='Home'?0:event.key==='End'?this._chart.length-1:Math.max(0,Math.min(this._chart.length-1,current+(event.key==='ArrowLeft'?-1:1)));
      this._selectedAt=this._chart[index].at;this._drawSelection();
    });
    this._q('#chart-empty').addEventListener('click',()=>{if(this._historyState==='error'){this._lastHistoryAt=0;this._maybeHistory();}});
    this._q('#periodic').addEventListener('change',event=>this._setting('periodic',event.target.checked));this._q('#interval').addEventListener('change',event=>this._setting('interval',event.target.value));
  }
  _motion(){this.toggleAttribute('data-paused',!this.isConnected||!this._visible||document.hidden);}
  _tick(){this._render();this._maybeHistory();this._motion();}
  _maybeHistory(){if(!this.isConnected||!this._hass||!this._config||!this._connected||!this._visible||document.hidden||this._loading||Date.now()-(this._lastHistoryAt||0)<300000)return;void this._loadHistory();}
  async _loadHistory(){
    const generation=this._generation,now=Date.now(),config=this._config;this._loading=true;this._lastHistoryAt=now;
    try{
      const ids=[config.entity,config.measured_entity].join(','),query=new URLSearchParams({filter_entity_id:ids,end_time:new Date(now).toISOString()});
      const groups=await this._hass.callApi('GET','history/period/'+new Date(now-24*HOUR).toISOString()+'?'+query);
      if(generation!==this._generation||!this.isConnected)return;this._history=decodeHistory(groups,config);this._historyState='ready';this._historyVersion++;
    }catch{if(generation!==this._generation)return;this._historyState='error';}
    finally{if(generation===this._generation){this._loading=false;this._render(true);}}
  }
  _records(){const points=new Map(this._history.map(p=>[p.at,p.value]));for(const[at,value]of this._observed)points.set(at,value);return[...points].map(([at,value])=>({at,value})).sort((a,b)=>a.at-b.at);}
  _plot(hours,options){return this._historyState==='ready'?historyModel(this._records(),this._current,hours,Date.now(),options):null;}
  _age(at){
    if(at===null)return this._t('waiting');const minutes=Math.max(0,Math.floor((Date.now()-at)/60000));
    return minutes<1?this._t('justNow'):minutes<60?this._t('minutesAgo',{count:minutes}):minutes<1440?this._t('hoursAgo',{count:Math.floor(minutes/60)}):this._t('daysAgo',{count:Math.floor(minutes/1440)});
  }
  _time(at,date=false){return new Intl.DateTimeFormat(this._locale,{timeZone:this._hass.config?.time_zone,...(date?{month:'2-digit',day:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(at);}
  _translateTemplate(){
    for(const[attribute,target]of [['data-i18n',null],['data-i18n-aria','aria-label'],['data-i18n-alt','alt']])this.shadowRoot.querySelectorAll('['+attribute+']').forEach(element=>{
      const value=this._t(element.getAttribute(attribute));if(target)element.setAttribute(target,value);else element.textContent=value;
    });
  }
  _render(force=false){
    if(!this._initialized||!this._hass||!this._config)return;
    const locale=language(this._config,this._hass);if(locale!==this._locale){this._locale=locale;this._translateTemplate();force=true;}
    const m=currentModel(this._hass.states,this._config,this._connected);this._current=m;this._checkPending();
    if(m.available){this._observed.set(m.measured,m.value);for(const[at]of this._observed)if(at<Date.now()-24*HOUR)this._observed.delete(at);}
    const key=JSON.stringify([m,this._historyState,this._historyVersion,this._feedback,!!this._pending,Math.floor(Date.now()/30000),this._config.name,this._config.location,this._locale,this._hass.config?.time_zone]);
    if(!force&&key===this._renderKey)return;this._renderKey=key;
    const article=this._q('#air-card');this._tone=tone(m.value,this._tone);article.dataset.tone=this._tone;article.dataset.state=m.available?'normal':m.connected?'stale':'offline';this._breathing(this._tone);
    this._q('.card-title h2').textContent=this._config.name;article.setAttribute('aria-label',this._config.name+' PM2.5');this._q('#device-title').textContent=this._config.name;
    this._q('#value').textContent=m.value===null?'—':String(m.value);const digits=String(m.value??'—').length;this._q('#value').style.setProperty('--value-scale',digits>=4?String(2.7/digits):'1');
    this._q('#reading').setAttribute('aria-label',this._t('readingLabel',{value:m.value===null?this._t('unavailable'):this._t('sampleLabel',{value:m.value})}));
    this._q('#freshness').textContent=m.available?this._t('sampleAge',{age:this._age(m.measured)}):this._t(m.status);
    this._q('#sampling-mode').textContent=!m.available&&m.measured!==null?this._t('latest')+' · '+this._age(m.measured):m.periodic===null?this._t('settingsUnknown'):m.periodic?(m.interval===null?this._t('periodicMode'):this._t('every',{count:m.interval})):this._t('continuous');
    updatePower(this._q('#power-status'),m.battery,m.charging,this._locale);this._drawSpark();if(this._expanded)this._drawHistory();if(this._q('#device-dialog').open)this._renderInfo();
    if(m.available){if(this._lastSample!==null&&m.measured>this._lastSample)this._flash();this._lastSample=Math.max(this._lastSample??0,m.measured);}
    if(!m.available)article.classList.remove('sampling');this._motion();
  }
  _flash(){
    if(this._media?.matches||!this._visible||document.hidden||!this.isConnected)return;
    const article=this._q('#air-card');clearTimeout(this._flashTimer);article.classList.remove('sampling');void article.offsetWidth;article.classList.add('sampling');this._flashTimer=setTimeout(()=>article.classList.remove('sampling'),1200);
  }
  _drawSpark(){
    const model=this._plot(6,{left:2,top:4,width:354,height:34}),points=model?.points||[],last=points.filter(p=>p.y!==null).at(-1);
    this._q('#spark').innerHTML=model?`<path class="spark-fill" d="${fills(points,42)}"/><path class="spark-line" d="${curve(points)}"/>${last?`<circle class="spark-dot-halo" cx="${last.x}" cy="${last.y}" r="3"/><circle class="spark-dot" cx="${last.x}" cy="${last.y}" r="2.5"/>`:''}`:'<path class="empty-line" d="M2 28H356"/>';
  }
  _toggle(value,opener=this._opener){this._expanded=value;this._opener=opener;this._selectedAt=null;this._q('#details-shell').dataset.open=String(value);this._q('#details').inert=!value;for(const id of ['#reading','#device','#spark-button'])this._q(id).setAttribute('aria-expanded',String(value));if(value)this._drawHistory();this.dispatchEvent(new Event('iron-resize',{bubbles:true,composed:true}));}
  _drawHistory(){
    const top=9,height=121,model=this._plot(this._period,{left:29,top,width:326,height}),points=model?.points||[],maximum=model?.maximum||20;this._chart=points.filter(p=>p.y!==null);
    const grid=[0,.5,1].map(f=>`<line class="chart-grid" x1="29" x2="355" y1="${top+height*f}" y2="${top+height*f}"/><text class="chart-label" text-anchor="end" x="22" y="${top+height*f+3}">${Math.round(maximum*(1-f))}</text>`).join('');
    this._q('#chart').innerHTML=grid+(model?`<path class="chart-fill" d="${fills(points,top+height)}"/><path class="chart-line" d="${curve(points)}"/>`:'')+'<g id="chart-selection"></g>';
    const empty=this._q('#chart-empty');empty.hidden=!!model;empty.disabled=this._historyState!=='error';empty.textContent=this._t(this._historyState==='error'?'historyError':this._historyState==='pending'?'historyPending':'noHistory');
    const now=Date.now();this._q('.chart-axis').replaceChildren(...[now-this._period*HOUR,now-this._period*HOUR/2,now].map(at=>{const span=document.createElement('span');span.textContent=this._time(at);return span;}));
    this._q('#minimum').textContent=model?.min??'—';this._q('#maximum').textContent=model?.max??'—';this._q('#sample-count').textContent=this._chart.length?this._t('sampleCount',{count:this._chart.length}):'';
    this.shadowRoot.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.period)===this._period)));this._drawSelection();
  }
  _nearest(x){if(!this._chart?.length)return;let best=this._chart[0];for(const point of this._chart)if(Math.abs(point.x-x)<Math.abs(best.x-x))best=point;this._selectedAt=best.at;this._drawSelection();}
  _drawSelection(){
    const point=this._chart?.find(p=>p.at===this._selectedAt)||this._chart?.at(-1),selection=this._q('#chart-selection');
    if(selection)selection.innerHTML=point?`<line class="chart-cursor" x1="${point.x}" x2="${point.x}" y1="9" y2="130"/><circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="3"/>`:'';
    const value=point?.value??this._current.value;this._q('#detail-value').innerHTML=(value===null?'—':value)+'<small>μg/m³</small>';
    this._q('#detail-time').textContent=point?this._time(point.at,true)+(this._selectedAt===null?' · '+this._t('latest'):''):this._current.measured!==null?this._time(this._current.measured,true):'';
    this._q('#chart').setAttribute('aria-label',this._t('historyLabel',{count:this._period})+(point?' · '+this._t('sampleLabel',{value:point.value}):''));
  }
  _renderInfo(){
    const m=this._current;if(!m)return;this._q('#location-row').hidden=!this._config.location;this._q('#info-location').textContent=this._config.location;
    this._q('#info-connection').textContent=this._t(!m.connected?'disconnected':m.canPeriodic||m.available?'online':'offline');
    this._q('#info-battery').textContent=m.battery===null?'—':m.battery+'%';this._q('#info-charging').textContent=this._t(m.charging===null?'chargeUnknown':m.charging?'chargeOn':'chargeOff');
    this._q('#info-measured').textContent=m.measured===null?this._t('waiting'):this._time(m.measured,true)+' ('+this._age(m.measured)+')';
    this._q('#periodic').checked=m.periodic===true;this._q('#periodic').disabled=!m.canPeriodic||!!this._pending;
    const select=this._q('#interval'),optionKey=this._locale+'|'+m.options.join('|');
    if(select.__options!==optionKey){select.replaceChildren(...m.options.map(option=>{const element=document.createElement('option');element.value=option;element.textContent=this._t('minutes',{count:Number(option.split(' ')[0])});return element;}));select.__options=optionKey;}
    select.value=this._hass.states[this._config.interval_entity]?.state||'';select.disabled=!m.canInterval||!!this._pending;this._q('#settings-feedback').textContent=this._feedback?this._t(this._feedback):'';
  }
  _checkPending(){
    const pending=this._pending;if(!pending)return;const entity=this._hass.states[pending.entity],confirmed=present(entity)&&entity.state===pending.wanted&&entity.last_updated!==pending.before;
    if(pending.sent&&confirmed){clearTimeout(this._controlTimer);this._pending=null;this._feedback='settingDone';}
    else if(Date.now()>=pending.deadline){clearTimeout(this._controlTimer);this._pending=null;this._feedback='settingTimeout';}
  }
  async _setting(kind,value){
    const m=this._current;if(this._pending||!m||(kind==='periodic'?!m.canPeriodic:!m.canInterval)){this._renderInfo();return;}
    if(kind==='interval'&&!m.options.includes(value)){this._renderInfo();return;}
    const entity=kind==='periodic'?this._config.periodic_entity:this._config.interval_entity,wanted=kind==='periodic'?(value?'on':'off'):value;
    const pending={entity,wanted,before:this._hass.states[entity]?.last_updated,deadline:Date.now()+30000,sent:false};this._pending=pending;this._feedback='settingPending';this._renderInfo();
    this._controlTimer=setTimeout(()=>{if(this._pending===pending){pending.deadline=Date.now();this._checkPending();this._render(true);}},30000);
    try{await this._hass.callService(kind==='periodic'?'switch':'select',kind==='periodic'?(value?'turn_on':'turn_off'):'select_option',{entity_id:entity,...(kind==='interval'?{option:value}:{})});if(this._pending!==pending)return;pending.sent=true;this._render(true);}
    catch{if(this._pending!==pending)return;clearTimeout(this._controlTimer);this._pending=null;this._feedback='settingFailed';this._render(true);}
  }
}
if(!customElements.get('mops-air-card'))customElements.define('mops-air-card',MopsAirCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='mops-air-card'))window.customCards.push({type:'mops-air-card',name:'MOPS Air',description:'MOPS PM2.5, sample history and device settings',preview:false});
console.info('MOPS AIR CARD '+VERSION);
