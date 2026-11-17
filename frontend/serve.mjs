import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const files=new Map([
  ['/', ['demo/index.html','text/html; charset=utf-8']],
  ['/demo/app.mjs',['demo/app.mjs','text/javascript; charset=utf-8']],
  ['/demo/fixtures.mjs',['demo/fixtures.mjs','text/javascript; charset=utf-8']],
  ['/demo/style.css',['demo/style.css','text/css; charset=utf-8']],
  ['/dist/mops-air-card.js',['dist/mops-air-card.js','text/javascript; charset=utf-8']],
]);
export function createServer(){
  return http.createServer(async(req,res)=>{
    const entry=files.get(new URL(req.url,'http://localhost').pathname);
    if(req.method!=='GET'||!entry){res.writeHead(404);res.end();return;}
    try{
      const data=await fs.readFile(new URL(entry[0],import.meta.url));
      res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
    }catch{res.writeHead(500);res.end('Build the frontend before starting the preview.');}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=createServer(),port=Number(process.env.MOPS_PREVIEW_PORT||8438);
  server.listen(port,'127.0.0.1',()=>console.log('MOPS example preview: http://127.0.0.1:'+port+'/'));
}
