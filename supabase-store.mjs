import {createHash} from 'node:crypto';
const emptyState=()=>({books:[],posts:[],users:{},invites:[],favorites:{}});
const validState=value=>value&&Array.isArray(value.books)&&Array.isArray(value.posts)&&value.users&&Array.isArray(value.invites)&&value.favorites;
export class SupabaseCollaborationStore{
  constructor({url,key,bucket='micheulcheop-media',fetcher=fetch}){
    const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS');
    if(!key||key.startsWith('sb_publishable_'))throw Error('A backend Supabase secret key is required');
    if(!/^[a-z0-9-]+$/.test(bucket))throw Error('Invalid media bucket');
    this.url=parsed.origin;this.key=key;this.bucket=bucket;this.fetcher=fetcher;this.pending=Promise.resolve();this.signed=new Map();
  }
  headers(extra={}){return {apikey:this.key,...(this.key.startsWith('eyJ')?{Authorization:'Bearer '+this.key}:{}),...extra};}
  async request(route,options={}){
    let response;
    try{response=await this.fetcher(this.url+route,{...options,headers:this.headers(options.headers),signal:AbortSignal.timeout(15000)});}catch{throw Error('Supabase connection failed');}
    if(!response.ok){const error=Error('Supabase request failed ('+response.status+')');error.code='SUPABASE_'+response.status;throw error;}
    if(response.status===204)return null;
    const content=await response.text();return content?JSON.parse(content):null;
  }
  async load(){
    const bucket=await this.request('/storage/v1/bucket/'+this.bucket);
    if(bucket?.public!==false)throw Error('The media bucket must be private');
    await this.request('/rest/v1/micheulcheop_state?on_conflict=id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({id:'main',payload:emptyState(),revision:0})});
    await this.read();return this;
  }
  async getRow(){
    const rows=await this.request('/rest/v1/micheulcheop_state?id=eq.main&select=payload,revision');
    if(!Array.isArray(rows)||rows.length!==1||!validState(rows[0].payload)||!Number.isSafeInteger(rows[0].revision))throw Error('Invalid Supabase collaboration state');
    return rows[0];
  }
  async read(){await this.pending;const row=await this.getRow();return structuredClone(row.payload);}
  update(action){
    const operation=this.pending.then(async()=>{
      for(let attempt=0;attempt<5;attempt++){
        const row=await this.getRow(),draft=structuredClone(row.payload),result=await action(draft);
        await this.externalizePhotos(draft);
        const updated=await this.request('/rest/v1/micheulcheop_state?id=eq.main&revision=eq.'+row.revision,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({payload:draft,revision:row.revision+1})});
        if(Array.isArray(updated)&&updated.length===1)return result;
      }
      const error=Error('동시에 저장 중이에요. 잠시 후 다시 시도해 주세요.');error.status=409;throw error;
    });this.pending=operation.catch(()=>{});return operation;
  }
  async uploadPhoto(value,scope){
    if(!value||!value.startsWith('data:image/'))return value;
    const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!match)throw Error('Invalid photo encoding');
    const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>3000000)throw Error('Invalid photo size');
    const digest=createHash('sha256').update(bytes).digest('hex'),key=scope+'/'+digest+'.'+(match[1]==='jpeg'?'jpg':match[1]);
    const encoded=key.split('/').map(encodeURIComponent).join('/');
    await this.request('/storage/v1/object/'+this.bucket+'/'+encoded,{method:'POST',headers:{'Content-Type':'image/'+match[1],'x-upsert':'true'},body:bytes});
    return 'sb:'+key;
  }
  async externalizePhotos(state){
    for(const [id,user] of Object.entries(state.users))user.photo=await this.uploadPhoto(user.photo,'users/'+encodeURIComponent(id));
    for(const post of state.posts){const scope='books/'+encodeURIComponent(post.book);if(post.photos){for(const item of post.photos)item.url=await this.uploadPhoto(item.url,scope);post.photo=post.photos[0]?.url||'';}else post.photo=await this.uploadPhoto(post.photo,scope);}
  }
  restorePhoto(input,previous){
    if(!previous?.startsWith('sb:'))return input;
    if(input===previous)return previous;
    try{const url=new URL(input),expected='/storage/v1/object/sign/'+this.bucket+'/'+previous.slice(3).split('/').map(encodeURIComponent).join('/');if(url.origin===this.url&&url.pathname===expected)return previous;}catch{}
    return input;
  }
  async signedPhoto(value){
    if(!value?.startsWith('sb:'))return value;
    const cached=this.signed.get(value);if(cached&&cached.expires>Date.now())return cached.url;
    const key=value.slice(3).split('/').map(encodeURIComponent).join('/');
    const result=await this.request('/storage/v1/object/sign/'+this.bucket+'/'+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});
    const location=result?.signedURL||result?.signedUrl;if(typeof location!=='string')throw Error('Invalid signed photo response');
    const signed=new URL(location.startsWith('/object/')?'/storage/v1'+location:location,this.url);
    if(signed.origin!==this.url)throw Error('Invalid signed photo origin');
    if(this.signed.size>1000)this.signed.clear();this.signed.set(value,{url:signed.href,expires:Date.now()+120000});return signed.href;
  }
  async presentSnapshot(snapshot){
    const result=structuredClone(snapshot),tasks=[];
    for(const book of result.books)for(const member of book.members)tasks.push(this.signedPhoto(member.photo).then(photo=>member.photo=photo));
    for(const post of result.posts){for(const item of post.photos||[])tasks.push(this.signedPhoto(item.url).then(url=>item.url=url));tasks.push(this.signedPhoto(post.photo).then(photo=>post.photo=photo));tasks.push(this.signedPhoto(post.authorPhoto).then(photo=>post.authorPhoto=photo));for(const comment of post.comments)tasks.push(this.signedPhoto(comment.authorPhoto).then(photo=>comment.authorPhoto=photo));}
    await Promise.all(tasks);return result;
  }
  async importInitialState(state){
    if(!validState(state))throw Error('Invalid import state');
    const row=await this.getRow();if(row.payload.books.length||row.payload.posts.length||Object.keys(row.payload.users).length)throw Error('Import refused: destination is not empty');
    const draft=structuredClone(state);await this.externalizePhotos(draft);
    const updated=await this.request('/rest/v1/micheulcheop_state?id=eq.main&revision=eq.'+row.revision,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({payload:draft,revision:row.revision+1})});
    if(!Array.isArray(updated)||updated.length!==1)throw Error('Import conflict: destination changed');
  }
}
