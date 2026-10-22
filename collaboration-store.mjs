import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
export class CollaborationStore{
  constructor(file){this.file=file;this.value={books:[],posts:[],users:{},invites:[],favorites:{}};this.pending=Promise.resolve();}
  async load(){try{this.value=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(this.value.books)||!Array.isArray(this.value.posts)||!this.value.users||!Array.isArray(this.value.invites)||!this.value.favorites)throw Error('Invalid collaboration store');}catch(error){if(error.code!=='ENOENT')throw error;}return this;}
  async read(){await this.pending;return structuredClone(this.value);}
  update(action){const operation=this.pending.then(async()=>{const draft=structuredClone(this.value),result=await action(draft);await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(draft),'utf8');await rename(temp,this.file);}catch(error){await unlink(temp).catch(()=>{});throw error;}this.value=draft;return result;});this.pending=operation.catch(()=>{});return operation;}
}
class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new RequestError(status,message)};
const hash=token=>createHash('sha256').update(token).digest('hex');
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(400,'입력 내용을 확인해 주세요.');return v.trim();};
const photo=(v,previous)=>{if(!v)return '';if(v===previous&&typeof previous==='string'&&previous.startsWith('sb:'))return previous;if(typeof v!=='string'||v.length>3000000||!(/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(v)))fail(400,'사진 형식을 확인해 주세요.');return v;};
const fields=(p,previousPhoto,previousPhotos=[])=>{
  if(!p||typeof p!=='object'||Array.isArray(p))fail(400,'기록 내용을 확인해 주세요.');
  const rating=Number(p.rating);if(!Number.isFinite(rating)||rating<0||rating>5||Math.abs(rating*10-Math.round(rating*10))>1e-8)fail(400,'별점을 확인해 주세요.');
  const lat=p.lat==null?null:Number(p.lat),lon=p.lon==null?null:Number(p.lon);
  if((lat==null)!==(lon==null)||(lat!=null&&(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)))fail(400,'위치를 확인해 주세요.');
  if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date)))fail(400,'방문일을 확인해 주세요.');
  const photos=p.photos===undefined?(p.photo?[{url:photo(p.photo,previousPhoto),text:''}]:[]):p.photos;
  if(!Array.isArray(photos)||photos.length>10)fail(400,'사진은 최대 10장까지 추가할 수 있어요.');
  const checkedPhotos=photos.map(item=>{if(!item||typeof item!=='object')fail(400,'사진을 확인해 주세요.');return {url:photo(item.url,previousPhotos.find(v=>v.url===item.url)?.url),text:text(item.text||'',2000)};});
  return {photos:checkedPhotos,name:text(p.name,100,true),area:text(p.area||'',300),category:text(p.category||'',100),placeId:text(p.placeId||'',100),placeUrl:typeof p.placeUrl==='string'&&/^https?:\/\/(place\.)?map.kakao.com\//.test(p.placeUrl)?p.placeUrl:'',rating,text:text(p.text||'',5000),date:p.date,photo:checkedPhotos[0]?.url||'',lat,lon};
};
function member(db,bookId,userId){const book=db.books.find(b=>b.id===bookId);if(!book||!book.members.includes(userId))fail(404,'수첩을 찾을 수 없거나 참여 권한이 없어요.');return book;}
function owner(book,userId){if(book.owner!==userId)fail(403,'수첩 관리자만 변경할 수 있어요.');}
function postFor(db,id,user){const post=db.posts.find(p=>p.id===id);if(!post)fail(404,'기록을 찾을 수 없어요.');member(db,post.book,user);return post;}
function version(entity,input){if(Number(input.version)!==entity.version)fail(409,'다른 곳에서 수정됐어요. 최신 내용을 확인하고 다시 시도해 주세요.');}
function userView(db,id){const user=db.users[id]||{};return {id,name:user.name||'멤버',photo:user.photo||''};}
function snapshot(db,user){const books=db.books.filter(b=>b.members.includes(user.id));const allowed=new Set(books.map(b=>b.id));return {books:books.map(b=>({...b,remote:true,shared:true,role:b.owner===user.id?'owner':'member',members:b.members.map(id=>({...userView(db,id),role:b.owner===id?'owner':'member'}))})),posts:db.posts.filter(p=>allowed.has(p.book)).map(p=>({...p,remote:true,author:userView(db,p.authorId).name,authorPhoto:userView(db,p.authorId).photo,favorite:Boolean(db.favorites[user.id]?.includes(p.id)),comments:p.comments.map(c=>({...c,author:userView(db,c.authorId).name,authorPhoto:userView(db,c.authorId).photo}))}))};}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>32000000)fail(413,'사진 용량이 너무 커요.');chunks.push(Buffer.from(chunk));}try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'잘못된 요청이에요.');return value;}catch{fail(400,'잘못된 요청이에요.');}}
export function createCollaborationApi({store,getUser,origin,now=Date.now,presentSnapshot=async value=>value,restorePhoto=value=>value,onError=error=>console.error('Collaboration storage error:',error.code||error.name)}){
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/collab/'))return false;
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      const route=url.pathname.slice('/api/collab'.length).split('/').filter(Boolean),method=req.method,user=await getUser(req);
      if(method!=='GET'&&req.headers.origin!==origin)fail(403,'요청한 주소를 확인해 주세요.');
      if(route[0]==='invites'&&route.length===2&&method==='GET'){
        const db=await store.read(),invite=db.invites.find(i=>i.hash===hash(route[1])&&i.expires>now());if(!invite)fail(404,'만료되었거나 사용할 수 없는 초대 링크예요.');
        const book=db.books.find(b=>b.id===invite.book);if(!book)fail(404,'수첩을 찾을 수 없어요.');reply(200,{book:{name:book.name,emoji:book.emoji,color:book.color,memberCount:book.members.length,owner:userView(db,book.owner).name},joined:Boolean(user&&book.members.includes(user.id)),bookId:book.id});return true;
      }
      if(!user)fail(401,'카카오 로그인이 필요해요.');
      if(route[0]==='state'&&route.length===1&&method==='GET'){reply(200,await presentSnapshot(snapshot(await store.read(),user)));return true;}
      const input=method==='GET'?{}:await body(req);
      const result=await store.update(db=>{
        if(!db.users[user.id])db.users[user.id]={name:user.nickname,photo:user.photo||''};
        if(route[0]==='profile'&&method==='PATCH'){const previous=db.users[user.id].photo;db.users[user.id]={name:text(input.name,20,true),photo:photo(restorePhoto(input.photo,previous),previous)};return {ok:true};}
        if(route[0]==='books'&&route.length===1&&method==='POST'){
          if(db.books.filter(b=>b.owner===user.id).length>=100)fail(400,'만들 수 있는 수첩 수를 초과했어요.');
          const book={id:randomUUID(),name:text(input.name,24,true),emoji:text(input.emoji||'🍽️',8),color:/^#[a-fA-F0-9]{6}$/.test(input.color)?input.color:'#f1dce0',description:text(input.description||'',100),owner:user.id,members:[user.id],version:1,createdAt:now()};db.books.push(book);
          if(input.posts!==undefined){if(!Array.isArray(input.posts)||input.posts.length>100)fail(400,'한 번에 옮길 기록이 너무 많아요.');for(const p of input.posts)db.posts.push({id:randomUUID(),book:book.id,...fields(p),authorId:user.id,comments:[],version:1,createdAt:now()});}
          return {id:book.id};
        }
        if(route[0]==='books'&&route.length===2&&method==='DELETE'){const book=member(db,route[1],user.id);owner(book,user.id);version(book,input);const ids=new Set(db.posts.filter(p=>p.book===book.id).map(p=>p.id));db.books=db.books.filter(b=>b.id!==book.id);db.posts=db.posts.filter(p=>p.book!==book.id);db.invites=db.invites.filter(i=>i.book!==book.id);for(const key of Object.keys(db.favorites))db.favorites[key]=db.favorites[key].filter(id=>!ids.has(id));return {ok:true};}
        if(route[0]==='books'&&route.length===2&&method==='PATCH'){const book=member(db,route[1],user.id);owner(book,user.id);version(book,input);book.name=text(input.name,24,true);book.emoji=text(input.emoji,8,true);if(!/^#[a-fA-F0-9]{6}$/.test(input.color))fail(400,'색상을 확인해 주세요.');book.color=input.color;book.description=text(input.description||'',100);book.version++;return {ok:true};}
        if(route[0]==='books'&&route[2]==='invites'){
          const book=member(db,route[1],user.id);owner(book,user.id);
          if(method==='POST'){db.invites=db.invites.filter(i=>i.expires>now());if(db.invites.filter(i=>i.book===book.id).length>=20)fail(400,'기존 초대 링크를 만료시킨 뒤 다시 만들어 주세요.');const token=randomBytes(24).toString('hex'),expires=now()+7*86400000;db.invites.push({hash:hash(token),book:book.id,expires});return {url:origin+'/?invite='+token,expires};}
          if(method==='DELETE'){db.invites=db.invites.filter(i=>i.book!==book.id);return {ok:true};}
        }
        if(route[0]==='invites'&&route[2]==='join'&&method==='POST'){
          const invite=db.invites.find(i=>i.hash===hash(route[1])&&i.expires>now());if(!invite)fail(404,'만료되었거나 사용할 수 없는 초대 링크예요.');
          const book=db.books.find(b=>b.id===invite.book);if(!book)fail(404,'수첩을 찾을 수 없어요.');if(!book.members.includes(user.id)){if(book.members.length>=30)fail(400,'수첩이 가득 찼어요.');book.members.push(user.id);book.version++;}return {id:book.id};
        }
        if(route[0]==='books'&&route[2]==='members'&&route.length===4&&method==='DELETE'){
          const book=member(db,route[1],user.id);owner(book,user.id);if(route[3]===book.owner)fail(400,'관리자는 내보낼 수 없어요.');book.members=book.members.filter(id=>id!==route[3]);book.version++;return {ok:true};
        }
        if(route[0]==='books'&&route[2]==='leave'&&method==='POST'){
          const book=member(db,route[1],user.id);if(book.owner===user.id)fail(400,'관리자는 수첩에서 나갈 수 없어요.');book.members=book.members.filter(id=>id!==user.id);book.version++;return {ok:true};
        }
        if(route[0]==='books'&&route[2]==='posts'&&method==='POST'){const book=member(db,route[1],user.id);const post={id:randomUUID(),book:book.id,...fields(input),authorId:user.id,comments:[],version:1,createdAt:now()};db.posts.push(post);return {id:post.id};}
        if(route[0]==='posts'&&route.length===2){const post=postFor(db,route[1],user.id);if(post.authorId!==user.id)fail(403,'본인이 작성한 기록만 변경할 수 있어요.');version(post,input);if(method==='PATCH'){Object.assign(post,fields({...input,photo:restorePhoto(input.photo,post.photo),photos:Array.isArray(input.photos)?input.photos.map(item=>({...item,url:restorePhoto(item.url,(post.photos||[{url:post.photo}]).find(old=>restorePhoto(item.url,old.url)===old.url)?.url)})):input.photos},post.photo,post.photos||[{url:post.photo}]));post.version++;return {id:post.id};}if(method==='DELETE'){db.posts=db.posts.filter(p=>p.id!==post.id);for(const id of Object.keys(db.favorites))db.favorites[id]=db.favorites[id].filter(value=>value!==post.id);return {ok:true};}}
        if(route[0]==='posts'&&route[2]==='favorite'&&method==='POST'){const post=postFor(db,route[1],user.id),list=new Set(db.favorites[user.id]||[]);if(input.saved)list.add(post.id);else list.delete(post.id);db.favorites[user.id]=[...list];return {ok:true};}
        if(route[0]==='posts'&&route[2]==='comments'&&method==='POST'){const post=postFor(db,route[1],user.id);const parentId=input.parentId||null;if(parentId&&!post.comments.some(c=>c.id===parentId&&!c.parentId))fail(400,'답글을 남길 댓글을 찾을 수 없어요.');const comment={parentId,id:randomUUID(),authorId:user.id,text:text(input.text,300,true),date:new Date(now()).toISOString().slice(0,10),version:1};post.comments.push(comment);return {id:comment.id};}
        if(route[0]==='posts'&&route[2]==='comments'&&route.length===4){const post=postFor(db,route[1],user.id),comment=post.comments.find(c=>c.id===route[3]);if(!comment)fail(404,'댓글을 찾을 수 없어요.');if(comment.authorId!==user.id)fail(403,'본인이 작성한 댓글만 변경할 수 있어요.');version(comment,input);if(method==='PATCH'){comment.text=text(input.text,300,true);comment.version++;return {ok:true};}if(method==='DELETE'){post.comments=post.comments.filter(c=>c.id!==comment.id&&c.parentId!==comment.id);return {ok:true};}}
        fail(404,'요청을 찾을 수 없어요.');
      });reply(200,result);
    }catch(error){if(!error.status)onError(error);reply(error.status||500,{error:error.status?error.message:'저장하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
    return true;
  };
}
