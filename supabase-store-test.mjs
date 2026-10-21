import assert from 'node:assert/strict';
import {SupabaseCollaborationStore} from './supabase-store.mjs';
function cloudFixture(){
  const fixture={row:null,objects:new Map(),calls:[],conflict:false,publicBucket:false,fail:false};
  fixture.fetcher=async(input,options={})=>{
    const url=new URL(input),method=options.method||'GET';fixture.calls.push({url,options});
    if(fixture.fail)return new Response('{}',{status:503});
    if(url.pathname.startsWith('/storage/v1/bucket/'))return Response.json({public:fixture.publicBucket});
    if(url.pathname==='/rest/v1/micheulcheop_state'){
      if(method==='POST'){if(!fixture.row)fixture.row=JSON.parse(options.body);return new Response(null,{status:201});}
      if(method==='GET')return Response.json(fixture.row?[structuredClone(fixture.row)]:[]);
      if(method==='PATCH'){
        if(fixture.conflict){fixture.conflict=false;fixture.row.payload.users.concurrent={name:'다른 요청',photo:''};fixture.row.revision++;return Response.json([]);}
        if(url.searchParams.get('revision')!=='eq.'+fixture.row.revision)return Response.json([]);
        Object.assign(fixture.row,JSON.parse(options.body));return Response.json([structuredClone(fixture.row)]);
      }
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/'))return Response.json({signedURL:url.pathname.replace('/storage/v1','')+'?token=temporary-test-token'});
    if(url.pathname.startsWith('/storage/v1/object/')&&method==='POST'){fixture.objects.set(url.pathname,options.body);return Response.json({Key:url.pathname});}
    throw Error('Unexpected fixture request');
  };return fixture;
}
const fixture=cloudFixture(),options={url:'https://project.supabase.co',key:'sb_secret_test_only',fetcher:fixture.fetcher};
const store=await new SupabaseCollaborationStore(options).load();
await store.update(db=>{db.books.push({id:'book',name:'친구와',members:['user']});db.users.user={name:'사용자',photo:'data:image/jpeg;base64,aGVsbG8='};db.posts.push({id:'post',book:'book',photo:'data:image/jpeg;base64,aGVsbG8='});});
assert.ok(fixture.row.payload.posts[0].photo.startsWith('sb:books/book/'));
assert.ok(fixture.row.payload.users.user.photo.startsWith('sb:users/user/'));
assert.equal(fixture.objects.size,2);assert.ok(!JSON.stringify(fixture.row).includes('data:image/'));
const snapshot={books:[{members:[{photo:fixture.row.payload.users.user.photo}]}],posts:[{photo:fixture.row.payload.posts[0].photo,authorPhoto:fixture.row.payload.users.user.photo,comments:[]}]};
const present=await store.presentSnapshot(snapshot);
assert.match(present.posts[0].photo,/https:\/\/project.supabase.co\/storage\/v1\/object\/sign\//);
assert.doesNotMatch(JSON.stringify(present),/sb_secret/);
assert.equal(store.restorePhoto(present.posts[0].photo,fixture.row.payload.posts[0].photo),fixture.row.payload.posts[0].photo);
assert.equal(store.restorePhoto('https://other.example/photo.jpg',fixture.row.payload.posts[0].photo),'https://other.example/photo.jpg');
fixture.conflict=true;await store.update(db=>{db.favorites.user=['post'];});
assert.equal(fixture.row.payload.users.concurrent.name,'다른 요청');assert.deepEqual(fixture.row.payload.favorites.user,['post']);
const restarted=await new SupabaseCollaborationStore(options).load();assert.equal((await restarted.read()).books[0].name,'친구와');
await assert.rejects(store.importInitialState({books:[],posts:[],users:{},invites:[],favorites:{}}),/destination is not empty/);
const revision=fixture.row.revision;fixture.fail=true;await assert.rejects(store.update(db=>{db.books=[];}),/Supabase request failed/);fixture.fail=false;assert.equal(fixture.row.revision,revision);assert.equal(fixture.row.payload.books.length,1);
fixture.publicBucket=true;await assert.rejects(new SupabaseCollaborationStore(options).load(),/must be private/);
assert.throws(()=>new SupabaseCollaborationStore({...options,key:'sb_publishable_wrong'}),/secret key/);
assert.ok(fixture.calls.every(call=>call.options.headers.apikey==='sb_secret_test_only'));
console.log('PASS: persistent cloud state, private media, signed photo URLs, reference preservation, CAS conflicts, restart, import protection and fail-closed errors');
