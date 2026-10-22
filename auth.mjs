import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export function createKakaoAuth({origin,restKey,clientSecret,fetcher=fetch,now=Date.now,sessionStore}){
  const pending=new Map(),sessions=new Map();
  const sessionKey=id=>createHash('sha256').update(id||'').digest('hex');
  const findSession=async id=>{if(!id)return null;if(!sessionStore)return sessions.get(id);const db=await sessionStore.read();return db.authSessions?.[sessionKey(id)];};
  const secure=new URL(origin).protocol==='https:'?'; Secure':'';
  const redirectUri=origin+'/auth/kakao/callback';
  const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2));
  const cookie=(name,value,age)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
  const configured=Boolean(restKey&&clientSecret);
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const redirect=(res,url,headers={})=>{res.writeHead(302,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers});res.end();};
  const handler=async function auth(req,res,url){
    const route=url.pathname;
    if(!['/api/auth/status','/api/auth/logout','/auth/kakao','/auth/kakao/callback'].includes(route))return false;
    for(const [key,value] of pending)if(value.expires<=now())pending.delete(key);
    for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
    const jar=cookies(req),session=await findSession(jar.mc_session);
    if(route==='/api/auth/status'){
      if(req.method!=='GET'){json(res,405,{error:'method'});return true;}
      json(res,200,{configured,user:session?.expires>now()?session.user:null});return true;
    }
    if(route==='/api/auth/logout'){
      if(req.method!=='POST'||req.headers.origin!==origin){json(res,403,{error:'origin'});return true;}
      if(session){if(sessionStore)await sessionStore.update(db=>{delete (db.authSessions||{})[sessionKey(jar.mc_session)];});const token=sessions.get(jar.mc_session)?.token;sessions.delete(jar.mc_session);try{if(token)await fetcher('https://kapi.kakao.com/v1/user/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});}catch{}}
      res.setHeader('Set-Cookie',cookie('mc_session','',0));json(res,200,{ok:true});return true;
    }
    if(req.method!=='GET'){json(res,405,{error:'method'});return true;}
    if(!configured){redirect(res,'/?auth_error=setup');return true;}
    if(route==='/auth/kakao'){
      const state=randomBytes(32).toString('hex');pending.set(state,{expires:now()+600000});
      const target=new URL('https://kauth.kakao.com/oauth/authorize');
      target.search=new URLSearchParams({client_id:restKey,redirect_uri:redirectUri,response_type:'code',state}).toString();
      redirect(res,target.toString(),{'Set-Cookie':cookie('mc_oauth_state',state,600)});return true;
    }
    const state=url.searchParams.get('state')||'',stored=jar.mc_oauth_state||'';
    const valid=/^[a-f0-9]{64}$/.test(state)&&/^[a-f0-9]{64}$/.test(stored)&&timingSafeEqual(Buffer.from(state),Buffer.from(stored))&&pending.has(state);
    if(!valid){redirect(res,'/?auth_error=state',{'Set-Cookie':cookie('mc_oauth_state','',0)});return true;}
    pending.delete(state);
    const clearState=cookie('mc_oauth_state','',0);
    if(url.searchParams.has('error')){redirect(res,'/?auth_error=cancelled',{'Set-Cookie':clearState});return true;}
    const code=url.searchParams.get('code');if(!code){redirect(res,'/?auth_error=failed',{'Set-Cookie':clearState});return true;}
    try{
      const tokenResponse=await fetcher('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:restKey,client_secret:clientSecret,redirect_uri:redirectUri,code}),signal:AbortSignal.timeout(10000)});
      if(!tokenResponse.ok)throw Error('token');const tokens=await tokenResponse.json();if(!tokens.access_token)throw Error('token');
      const userResponse=await fetcher('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(10000)});
      if(!userResponse.ok)throw Error('user');const account=await userResponse.json();if(!account.id)throw Error('user');
      const profile=account.kakao_account?.profile||{},rawPhoto=profile.profile_image_url||'';
      const photo=rawPhoto.startsWith('https://')?rawPhoto:'';
      const id=randomBytes(32).toString('hex'),lifetime=30*86400;
      const session={expires:now()+lifetime*1000,user:{id:String(account.id),nickname:String(profile.nickname||'카카오 사용자').slice(0,20),photo}};
      if(sessionStore)await sessionStore.update(db=>{db.authSessions=Object.fromEntries(Object.entries(db.authSessions||{}).filter(([,s])=>s.expires>now()));db.authSessions[sessionKey(id)]=session;});
      sessions.set(id,{...session,token:tokens.access_token});
      redirect(res,'/?auth=success',{'Set-Cookie':[clearState,cookie('mc_session',id,lifetime)]});
    }catch{redirect(res,'/?auth_error=failed',{'Set-Cookie':clearState});}
    return true;
  };
  handler.getUser=sessionStore?async req=>{const session=await findSession(cookies(req).mc_session);return session&&session.expires>now()?session.user:null;}:req=>{const session=sessions.get(cookies(req).mc_session);return session&&session.expires>now()?session.user:null;};
  return handler;
}
