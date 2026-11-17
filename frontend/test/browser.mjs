import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {createServer} from '../serve.mjs';
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:460,height:1100},deviceScaleFactor:2});
const errors=[],requests=[],passed=[];
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
const card=()=>page.locator('mops-air-card').first();
const reset=async()=>{await page.goto(base);await page.waitForFunction(()=>window.demo?.card._historyState==='ready');};
const check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS: '+name);};
try{
  await reset();
  await check('Standalone module renders from six configurable entities',async()=>{
    assert.equal(await card().locator('#value').textContent(),'24');
    assert.equal(await card().locator('.card-title h2').textContent(),'MOPS');
    assert.equal(await page.evaluate(()=>{try{demo.card.setConfig({});return false;}catch{return true;}}),true);
  });
  await check('Name, location and accessibility text are configurable and rendered as text',async()=>{
    await page.evaluate(()=>demo.card.setConfig({...demo.config,name:'<b>Desk monitor</b>',location:'Desk'}));
    assert.equal(await card().locator('.card-title h2').textContent(),'<b>Desk monitor</b>');
    assert.equal(await card().locator('.card-title b').count(),0);
    await card().locator('#info').click();assert.equal(await card().locator('#info-location').textContent(),'Desk');
    await page.keyboard.press('Escape');assert(await card().locator('#info').evaluate(el=>el===el.getRootNode().activeElement));
    await page.evaluate(()=>demo.card.setConfig(demo.config));await card().locator('#info').click();assert(await card().locator('#location-row').isHidden());await page.keyboard.press('Escape');
  });
  await check('English and Chinese follow HA language and explicit overrides',async()=>{
    await page.evaluate(()=>{demo.hass.locale.language='zh-CN';demo.card.setConfig({...demo.config,language:'auto'});demo.card.hass=demo.hass;});
    assert.equal(await card().locator('[data-i18n=air]').textContent(),'空气');
    await page.evaluate(()=>demo.card.setConfig({...demo.config,language:'en'}));assert.equal(await card().locator('[data-i18n=air]').textContent(),'Air');
  });
  await check('Two monitors keep values, history and SVG effects in separate instances',async()=>{
    await page.locator('#second').click();await page.waitForFunction(()=>document.querySelector('[data-second]')._historyState==='ready');
    assert.equal(await page.locator('[data-second]').locator('#value').textContent(),'52');assert.equal(await card().locator('#value').textContent(),'24');
    assert(await page.evaluate(()=>demo.card._observed!==document.querySelector('[data-second]')._observed));await page.locator('#second').click();
  });
  await check('Rebinding discards observations and ignores an old in-flight history response',async()=>{
    await page.evaluate(async()=>{
      const {card,config,demoConfig,demoHass}=demo;let finish;
      const oldRows=[[{entity_id:config.entity,state:'999',last_updated:new Date().toISOString(),attributes:{unit_of_measurement:'μg/m³'}}]];
      card._hass.callApi=()=>new Promise(resolve=>{finish=resolve;});const pending=card._loadHistory();
      const cfg=demoConfig('rebound'),hass=demoHass(cfg,{value:52});card.hass=hass;card.setConfig(cfg);finish(oldRows);await pending;
    });
    await page.waitForFunction(()=>demo.card._historyState==='ready');
    assert.equal(await card().locator('#value').textContent(),'52');assert(await page.evaluate(()=>demo.card._records().every(p=>p.value===null||p.value<70)));
    await reset();
  });
  await check('History expands, changes range and supports keyboard selection',async()=>{
    await card().locator('#reading').click();assert.equal(await card().locator('#reading').getAttribute('aria-expanded'),'true');
    const firstCount=await page.evaluate(()=>demo.card._chart.length);await card().locator('[data-period="24"]').click();assert(await page.evaluate(n=>demo.card._chart.length>n,firstCount));
    await card().locator('#chart').focus();await page.keyboard.press('Home');const at=await page.evaluate(()=>demo.card._selectedAt);await page.keyboard.press('End');assert(await page.evaluate(old=>demo.card._selectedAt>old,at));
    await page.keyboard.press('Escape');assert.equal(await card().locator('#reading').getAttribute('aria-expanded'),'false');
  });
  await check('Zero, stale, unknown battery and disconnection preserve their meanings',async()=>{
    await page.selectOption('#scenario','zero');assert.equal(await card().locator('#value').textContent(),'0');assert.equal(await card().locator('.battery-level').getAttribute('width'),'0');
    await page.selectOption('#scenario','stale');assert.equal(await card().locator('#value').textContent(),'—');assert.equal(await card().locator('#air-card').getAttribute('data-tone'),'inactive');
    await page.selectOption('#scenario','offline');assert.equal(await card().locator('#value').textContent(),'—');assert.equal(await card().locator('.power-percentage').textContent(),'—');await reset();
  });
  await check('History failure can be retried and empty history does not invent a series',async()=>{
    await page.evaluate(()=>{const cfg=demo.demoConfig('empty'),hass=demo.demoHass(cfg,{value:null,history:false});hass.historyMode='error';demo.card.hass=hass;demo.card.setConfig(cfg);demo.emptyHass=hass;});
    await page.waitForFunction(()=>demo.card._historyState==='error');await card().locator('#reading').click();assert.match(await card().locator('#chart-empty').textContent(),/retry/);
    await page.evaluate(()=>demo.emptyHass.historyMode='ready');await card().locator('#chart-empty').click();await page.waitForFunction(()=>demo.card._historyState==='ready');
    assert.equal(await card().locator('#chart-empty').textContent(),'No recorded history');assert.equal(await page.evaluate(()=>demo.card._chart.length),0);await reset();
  });
  await check('Settings require service completion and a fresh matching state',async()=>{
    await card().locator('#info').click();await page.evaluate(()=>demo.hass.serviceMode='unconfirmed');
    await card().locator('#interval').selectOption('30 min');assert.match(await card().locator('#settings-feedback').textContent(),/Updating/);
    assert(await card().locator('#interval').isDisabled());
    await page.evaluate(()=>{demo.hass.states[demo.config.interval_entity].state='30 min';demo.card.hass=demo.hass;});assert.match(await card().locator('#settings-feedback').textContent(),/Updating/);
    await page.evaluate(()=>{demo.hass.states[demo.config.interval_entity].last_updated=new Date(Date.now()+1).toISOString();demo.card.hass=demo.hass;});assert.equal(await card().locator('#settings-feedback').textContent(),'Updated');
    await page.keyboard.press('Escape');await reset();
  });
  await check('A fresh entity state alone cannot complete an unfinished service call',async()=>{
    await card().locator('#info').click();
    await page.evaluate(()=>{demo.hass.callService=()=>new Promise(resolve=>window.finishService=resolve);});
    await card().locator('#interval').selectOption('30 min');
    await page.evaluate(()=>{const state=demo.hass.states[demo.config.interval_entity];state.state='30 min';state.last_updated=new Date(Date.now()+1).toISOString();demo.card.hass=demo.hass;});
    assert.match(await card().locator('#settings-feedback').textContent(),/Updating/);
    await page.evaluate(()=>window.finishService());await page.waitForFunction(()=>!demo.card._pending);assert.equal(await card().locator('#settings-feedback').textContent(),'Updated');await reset();
  });
  await check('Periodic measurement uses native services and disables interval control in continuous mode',async()=>{
    await card().locator('#info').click();await card().locator('#periodic').uncheck();assert(await card().locator('#interval').isDisabled());assert.equal(await card().locator('#sampling-mode').textContent(),'Continuous measurement');
    await card().locator('#periodic').check();assert(await card().locator('#interval').isEnabled());
    assert.deepEqual(await page.evaluate(()=>demo.hass.calls.filter(c=>c.domain).map(c=>[c.domain,c.service])),[['switch','turn_off'],['switch','turn_on']]);await reset();
  });
  await check('Failed settings retain actual state; unconfirmed settings time out without retry',async()=>{
    await card().locator('#info').click();await page.evaluate(()=>demo.hass.serviceMode='error');await card().locator('#interval').selectOption('30 min');
    assert.match(await card().locator('#settings-feedback').textContent(),/failed/);assert.equal(await card().locator('#interval').inputValue(),'10 min');
    await page.evaluate(()=>demo.hass.serviceMode='unconfirmed');await page.clock.install();await card().locator('#interval').selectOption('30 min');await page.clock.fastForward(31000);
    assert.match(await card().locator('#settings-feedback').textContent(),/not confirmed/);assert.equal(await page.evaluate(()=>demo.hass.calls.filter(c=>c.domain).length),2);
    await page.clock.resume();await reset();
  });
  await check('Connection events hide the current reading and preserve loaded history',async()=>{
    const count=await page.evaluate(()=>demo.card._history.length);
    await page.evaluate(()=>{demo.hass.connection.connected=false;demo.hass.connection.dispatchEvent(new Event('disconnected'));});assert.equal(await card().locator('#value').textContent(),'—');assert.equal(await page.evaluate(()=>demo.card._history.length),count);
    await page.evaluate(()=>{demo.hass.connection.connected=true;demo.hass.connection.dispatchEvent(new Event('ready'));});assert.equal(await card().locator('#value').textContent(),'24');
  });
  await check('New sample feedback is independent of battery changes; reduced motion disables animation',async()=>{
    await page.evaluate(()=>{demo.hass.states[demo.config.measured_entity].state=new Date(Date.now()).toISOString();demo.card.hass=demo.hass;});assert(await card().locator('#air-card').evaluate(el=>el.classList.contains('sampling')));
    assert(await page.evaluate(()=>{const el=demo.card.shadowRoot.querySelector('.ring-breath'),a=el.getAnimations()[0];demo.hass.states[demo.config.battery_entity].state='45';demo.card.hass=demo.hass;return a===el.getAnimations()[0];}));
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await card().locator('.ring-breath').evaluate(el=>el.getAnimations().length),0);await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('Detached and reattached cards release and restore connection listeners',async()=>{
    assert(await page.evaluate(()=>{const {card}=demo,parent=card.parentElement,connection=card._connection;card.remove();const released=card._connection===null&&card.hasAttribute('data-paused');parent.append(card);return released&&card._connection===connection;}));
  });
  await check('320px, 390px and desktop containers fit without horizontal page overflow',async()=>{
    for(const width of [320,390,1440]){await page.setViewportSize({width,height:1100});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  });
  const output=process.env.MOPS_QA_DIR;
  if(output){
    await fs.mkdir(output,{recursive:true});await reset();await page.clock.setFixedTime(new Date(Date.UTC(2020,0,1,12)));await reset();await page.setViewportSize({width:460,height:1100});
    const shot=async name=>card().screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
    await shot('card-light');await page.selectOption('#theme','dark');await shot('card-dark');await page.selectOption('#theme','light');await card().locator('#reading').click();await shot('card-history');await card().locator('#collapse').click();
    await page.selectOption('#language','zh-Hans');await shot('card-chinese');await page.selectOption('#language','en');await card().locator('#info').click();await card().locator('#device-dialog').screenshot({path:path.join(output,'card-settings.png')});await page.keyboard.press('Escape');
    await page.selectOption('#scenario','charging');await shot('card-charging');
    if(process.env.MOPS_CAPTURE_FRAMES==='1'){
      const frames=path.join(output,'frames');await fs.mkdir(frames,{recursive:true});
      for(let index=0;index<96;index++){
        await card().evaluate((el,at)=>{for(const animation of el.shadowRoot.getAnimations()){animation.pause();animation.currentTime=at;}},index*250);
        await card().screenshot({path:path.join(frames,String(index).padStart(3,'0')+'.png')});
      }
    }
    await page.selectOption('#scenario','normal');await page.locator('#second').click();await page.locator('#cards').screenshot({path:path.join(output,'two-monitors.png'),animations:'disabled'});
    await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify({passed,errors,externalRequests:requests.filter(url=>!url.startsWith(base)&&!url.startsWith('data:'))},null,2)+'\n');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(url=>!url.startsWith(base)&&!url.startsWith('data:')),[]);
  console.log('PASS: '+passed.length+' browser scenarios, no page errors or external requests. Synthetic HA adapter only.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
