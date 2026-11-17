import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ringGeometry} from './src/ring.mjs';

export async function bundle(){
  const read=name=>fs.readFile(new URL(name,import.meta.url),'utf8');
  const png=await fs.readFile(new URL('assets/mops-shell.png',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(png).digest('hex'),ringGeometry.imageSha256,'Device artwork changed; recalibrate its ring before building');
  const version=JSON.parse(await read('../custom_components/mops_ble/manifest.json')).version;
  const template=(await read('src/template.html')).replace('__MOPS_IMAGE__','data:image/png;base64,'+png.toString('base64'));
  const modules=await Promise.all(['history.mjs','i18n.mjs','ring.mjs','power.mjs','model.mjs','card.js'].map(name=>read('src/'+name)));
  const plain=value=>value.replace(/^import [^\n]+\n/gm,'').replace(/^export \{[^\n]+\};?\n/gm,'').replace(/^export /gm,'');
  const source='/* MOPS Air '+version+' | Required Notice: Copyright (c) 2026 hallucigenia\n * PolyForm Noncommercial 1.0.0 | https://github.com/hallucigenia/ha-mops-ble/blob/main/LICENSE\n * Artwork provenance: frontend/assets/sources.json; embedded original PNG. */\n(()=>{\n'+
    'const VERSION='+JSON.stringify(version)+';\nconst STYLE='+JSON.stringify(await read('src/style.css'))+';\nconst TEMPLATE='+JSON.stringify(template)+';\n'+modules.map(plain).join('\n')+'\n})();\n';
  assert(!/^\s*(import|export)\s/m.test(source),'Unbundled module');
  assert(!/exampleHistory|simulationOnly|window\.demo/.test(source),'Demo code in distributable');
  return source;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const source=await bundle(),target=new URL('dist/mops-air-card.js',import.meta.url);
  if(process.argv.includes('--check'))assert.equal(await fs.readFile(target,'utf8'),source,'Run npm run build and commit its output');
  else {await fs.mkdir(new URL('dist/',import.meta.url),{recursive:true});await fs.writeFile(target,source);}
  console.log(JSON.stringify({file:'frontend/dist/mops-air-card.js',bytes:Buffer.byteLength(source),sha256:crypto.createHash('sha256').update(source).digest('hex')}));
}
