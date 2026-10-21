import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {createKakaoAuth} from './auth.mjs';
const root = process.cwd();
try{process.loadEnvFile(path.join(root,'.env.local'));}catch(error){if(error.code!=='ENOENT')throw error;}
const port=Number(process.env.PORT||5173);
const origin=process.env.PUBLIC_ORIGIN||`http://localhost:${port}`;
const auth=createKakaoAuth({origin,restKey:process.env.KAKAO_REST_API_KEY,clientSecret:process.env.KAKAO_CLIENT_SECRET});
const publicFiles=new Set(['index.html','app.js','style.css','mobile.css','config.js','composer.js','kakao-map.js','profile.js','logo.png','icon.svg','manifest.webmanifest']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res) => {
  try {
    const url=new URL(req.url,origin);
    if(await auth(req,res,url))return;
    const name = decodeURIComponent(url.pathname);
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(!publicFiles.has(name==='/'?'index.html':name.slice(1))){res.writeHead(404);res.end('Not found');return;}
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file); res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}); res.end(req.method==='HEAD'?undefined:body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'0.0.0.0',()=>console.log(`Micheulcheop: ${origin}`));
