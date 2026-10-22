import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {createKakaoAuth} from './auth.mjs';
import {CollaborationStore,createCollaborationApi} from './collaboration-store.mjs';
import {SupabaseCollaborationStore} from './supabase-store.mjs';
const root = process.cwd();
try{process.loadEnvFile(path.join(root,'.env.local'));}catch(error){if(error.code!=='ENOENT')throw error;}
const port=Number(process.env.PORT||5173);
const origin=new URL(process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||`http://localhost:${port}`).origin;
const production=process.env.NODE_ENV==='production'||process.env.RENDER==='true';
if(production&&!origin.startsWith('https://'))throw Error('Production requires an HTTPS PUBLIC_ORIGIN');
if(production&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY))throw Error('Configure Supabase before deployment: ephemeral file storage is disabled in production');
if(Boolean(process.env.SUPABASE_URL)!==Boolean(process.env.SUPABASE_SECRET_KEY))throw Error('Configure both SUPABASE_URL and SUPABASE_SECRET_KEY');
if(production&&(!process.env.KAKAO_REST_API_KEY||!process.env.KAKAO_CLIENT_SECRET))throw Error('Configure Kakao Login before deployment');

const cloud=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);
const collaborationStore=cloud?await new SupabaseCollaborationStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,bucket:process.env.SUPABASE_MEDIA_BUCKET||'micheulcheop-media'}).load():await new CollaborationStore(path.join(root,'.data','collaboration.json')).load();
const auth=createKakaoAuth({origin,restKey:process.env.KAKAO_REST_API_KEY,clientSecret:process.env.KAKAO_CLIENT_SECRET,sessionStore:collaborationStore});
const collaboration=createCollaborationApi({store:collaborationStore,getUser:auth.getUser,origin,...(cloud?{presentSnapshot:value=>collaborationStore.presentSnapshot(value),restorePhoto:(value,previous)=>collaborationStore.restorePhoto(value,previous)}:{})});
const publicFiles=new Set(['index.html','app.js','style.css','mobile.css','config.js','composer.js','kakao-map.js','profile.js','collaboration.js','journal.js','logo.png','icon.svg','manifest.webmanifest']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res) => {
  try {
    const url=new URL(req.url,origin);
    if(url.pathname==='/healthz'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,storage:cloud?'supabase':'local'}));return;}
    if(await auth(req,res,url))return;
    if(await collaboration(req,res,url))return;
    const name = decodeURIComponent(url.pathname);
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(!publicFiles.has(name==='/'?'index.html':name.slice(1))){res.writeHead(404);res.end('Not found');return;}
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file); res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}); res.end(req.method==='HEAD'?undefined:body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,'0.0.0.0',()=>console.log(`Micheulcheop: ${origin}`));
