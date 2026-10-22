let defaultRestoredFor=null;
let authInfo={configured:false,user:null},profilePhotoDraft='',profilePhotoBusy=false,profilePhotoRequest=0;
function avatarMarkup(photo=data.profilePhoto,alt='내 프로필 사진'){return `<span class="avatar-placeholder" aria-hidden="true">${icon('user')}</span>${photo?`<img class="avatar-image" src="${esc(photo)}" alt="${esc(alt)}" referrerpolicy="no-referrer">`:''}`;}
document.addEventListener('error',event=>{if(event.target?.matches?.('img.avatar-image'))event.target.remove();},true);
window.addEventListener?.('storage',event=>{
  if(event.key!=='micheulcheop-v1'||!event.newValue)return;
  try{const updated=JSON.parse(event.newValue);if(!Array.isArray(updated.books)||!Array.isArray(updated.posts))return;data={...updated,books:[...updated.books,...data.books.filter(b=>b.remote)],posts:[...updated.posts,...data.posts.filter(p=>p.remote)]};if(!data.books.some(book=>book.id===selected))selected=data.books[0]?.id;render();}catch{}
});
window.addEventListener?.('focus',()=>refreshAuth());
function openProfile(){
  profilePhotoDraft=data.profilePhoto||'';profilePhotoBusy=false;++profilePhotoRequest;
  openDialog('나의 프로필',`<form id="profile-form"><div class="profile-photo-editor"><div class="profile-photo-large" id="profile-photo-preview">${avatarMarkup(profilePhotoDraft)}</div><label class="profile-photo-pick">사진 변경<input id="profile-photo-input" type="file" accept="image/*" aria-label="프로필 사진 선택"></label><button type="button" class="profile-photo-remove" data-action="remove-profile-photo">기본 이미지로</button></div><p class="hint" id="profile-photo-status" role="status"></p><label class="field">닉네임<input name="name" value="${esc(data.profile)}" maxlength="20" required></label><button class="primary" type="submit">프로필 저장</button><section class="account-section"><div class="account-heading"><strong>계정</strong><span>${authInfo.user?'카카오 로그인됨':'로그인하지 않음'}</span></div>${authInfo.user?`<p class="hint">${esc(authInfo.user.nickname)} 님의 카카오계정으로 로그인했어요.</p><button class="outline account-logout" type="button" data-action="kakao-logout">로그아웃</button>`:`<button class="kakao-login" type="button" data-action="kakao-login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.4 2 10.6c0 2.6 1.8 4.9 4.5 6.2L5.4 21l4.8-2.8c.6.1 1.2.1 1.8.1 5.5 0 10-3.4 10-7.7S17.5 3 12 3Z"/></svg>카카오 로그인</button>`}<p class="account-note">친구를 초대한 공유 수첩은 서버에 저장돼요. 개인 수첩과 기기 백업은 이 브라우저에 보관됩니다.</p></section><div class="profile-backup"><span>${data.books.length}개의 수첩 · ${data.posts.length}개의 기록</span><button class="outline" type="button" data-action="export">기록 백업</button></div></form>`);
}
async function pickProfilePhoto(input){
  const file=input.files[0];if(!file)return;
  const request=++profilePhotoRequest,preview=document.querySelector('#profile-photo-preview'),status=document.querySelector('#profile-photo-status');
  profilePhotoBusy=true;status.textContent='사진을 불러오는 중이에요.';
  try{
    if(!file.type.startsWith('image/'))throw Error('image');
    const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),size=Math.min(bitmap.width,bitmap.height);
    canvas.width=canvas.height=384;
    canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,384,384);bitmap.close();
    if(request!==profilePhotoRequest||!preview.isConnected)return;
    profilePhotoDraft=canvas.toDataURL('image/jpeg',.85);preview.innerHTML=avatarMarkup(profilePhotoDraft);status.textContent='저장을 누르면 프로필에 반영돼요.';
  }catch{if(request===profilePhotoRequest&&status.isConnected){input.value='';status.textContent='사진을 불러올 수 없어요. JPG 또는 PNG 사진을 선택해 주세요.';}}
  finally{if(request===profilePhotoRequest)profilePhotoBusy=false;}
}
function removeProfilePhoto(){++profilePhotoRequest;profilePhotoBusy=false;profilePhotoDraft='';document.querySelector('#profile-photo-preview').innerHTML=avatarMarkup('');document.querySelector('#profile-photo-status').textContent='저장을 누르면 기본 이미지로 변경돼요.';}
async function refreshAuth(){
  try{const response=await fetch('/api/auth/status',{cache:'no-store'});if(!response.ok)return;authInfo=await response.json();
    const params=new URLSearchParams(window.location.search);
    if(params.get('auth')==='success'&&authInfo.user){const previous=structuredClone(data);const oldName=data.profile;data.profile=authInfo.user.nickname;for(const p of data.posts){if(p.author===oldName)p.author=data.profile;for(const c of p.comments)if(c.author===oldName)c.author=data.profile;}if(!data.profilePhoto)data.profilePhoto=authInfo.user.photo;if(!save())data=previous;render();toast('카카오계정으로 로그인했어요.');}
    const error=params.get('auth_error');if(error){const messages={setup:'카카오 로그인 서버 설정이 필요해요.',state:'로그인 요청이 만료됐어요. 다시 시도해 주세요.',cancelled:'로그인을 취소했어요.',failed:'카카오 로그인에 실패했어요. 설정을 확인해 주세요.'};toast(messages[error]||messages.failed);}
    await refreshCollaboration();
    const account=authInfo.user?.id||'local';if(defaultRestoredFor!==account){restoreDefaultNotebook();defaultRestoredFor=account;if(!modal.firstChild)render();}
    if(params.has('auth')||params.has('auth_error')){params.delete('auth');params.delete('auth_error');history.replaceState(null,'',window.location.pathname+(params.size?'?'+params:'')+window.location.hash);}
    await openPendingInvite();
  }catch{}
}
function startKakaoLogin(){
  if(authInfo.configured){window.location.assign('/auth/kakao');return;}
  openDialog('카카오 로그인 연결 준비',`<p class="hint">카카오 로그인을 위한 서버 설정이 아직 완료되지 않았어요.</p><p class="hint">카카오 개발자 콘솔에서 로그인을 켜고, 아래 Redirect URI를 등록해 주세요.</p><code class="redirect-uri">${esc(window.location.origin)}/auth/kakao/callback</code><p class="hint">서버의 .env.local 파일에 REST API 키와 Client Secret을 설정한 뒤 서버를 다시 실행하면 로그인할 수 있어요. 비밀 값은 채팅에 보내지 마세요.</p><button class="primary" data-action="close">확인</button>`);
}
async function logoutKakao(){try{const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw Error();authInfo.user=null;await refreshCollaboration();openProfile();toast('로그아웃했어요.');}catch{toast('로그아웃하지 못했어요. 다시 시도해 주세요.');}}
