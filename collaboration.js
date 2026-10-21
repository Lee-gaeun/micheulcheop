let collaborationBusy=false,collaborationRevision=0,inviteLinkDraft='',activeInviteToken='',lastCollaborationState='',collaborationNeedsRender=false;
function localNotebookSnapshot(){return {...data,books:data.books.filter(b=>!b.remote),posts:data.posts.filter(p=>!p.remote)};}
function ownsRecord(record){return record.remote?record.authorId===authInfo.user?.id:record.author===data.profile;}
function ownsComment(comment,post){return post.remote?comment.authorId===authInfo.user?.id:comment.author===data.profile;}
async function collaborationRequest(route,method='GET',body){
  const response=await fetch('/api/collab'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  let result;try{result=await response.json();}catch{throw Error('서버에 연결하지 못했어요.');}
  if(!response.ok){const error=Error(result.error||'공유 수첩을 저장하지 못했어요.');error.status=response.status;throw error;}return result;
}
function mergeCollaborativeState(state){
  data.books=[...data.books.filter(b=>!b.remote),...state.books];data.posts=[...data.posts.filter(p=>!p.remote),...state.posts];
  if(!data.books.length)data.books.push({id:uid(),name:'나만의 미식 수첩',emoji:'☕',color:'#e4e2ed',shared:false,description:''});
  if(!data.books.some(b=>b.id===selected))selected=data.books[0].id;
}
async function refreshCollaboration({quiet=false}={}){
  const revision=++collaborationRevision;
  if(!authInfo.user){lastCollaborationState='';mergeCollaborativeState({books:[],posts:[]});if(!modal.firstChild)render();return;}
  try{const state=await collaborationRequest('/state');if(revision!==collaborationRevision)return;const signature=authInfo.user.id+JSON.stringify(state);if(signature!==lastCollaborationState){lastCollaborationState=signature;mergeCollaborativeState(state);collaborationNeedsRender=true;}if(collaborationNeedsRender&&!modal.firstChild){render();collaborationNeedsRender=false;}}
  catch(error){if(error.status===401){authInfo.user=null;lastCollaborationState='';mergeCollaborativeState({books:[],posts:[]});if(!modal.firstChild)render();}if(!quiet)toast(error.message);}
}
async function collaborationAction(task){
  if(collaborationBusy){toast('저장 중이에요. 잠시만 기다려 주세요.');return;}
  collaborationBusy=true;
  try{await task();}catch(error){toast(error.message);await refreshCollaboration({quiet:true});}
  finally{collaborationBusy=false;}
}
function loginToCollaborate(){openDialog('함께 기록하려면 로그인',`<p class="hint">카카오계정으로 로그인하면 친구를 초대하고 같은 수첩에 기록할 수 있어요.</p><button class="kakao-login" data-action="kakao-login">카카오 로그인</button>`);}
function memberMarkup(book){return book.members.map(m=>`<div class="notebook-member"><span class="member-avatar">${m.photo?`<img src="${esc(m.photo)}" alt="${esc(m.name)} 프로필" referrerpolicy="no-referrer">`:icon('user')}</span><span>${esc(m.name)}<small>${m.role==='owner'?'관리자':'멤버'}${m.id===authInfo.user?.id?' · 나':''}</small></span>${book.role==='owner'&&m.role!=='owner'?`<button data-action="remove-member" data-member="${esc(m.id)}" data-notebook="${book.id}">내보내기</button>`:''}</div>`).join('');}
function openNotebookMembers(book=current()){
  if(!authInfo.user){loginToCollaborate();return;}
  if(!book.remote){openPublishNotebook(book);return;}
  openDialog('함께 쓰는 수첩',`<div class="invite-notebook"><span>${esc(book.emoji)}</span><strong>${esc(book.name)}</strong><small>${book.members.length}명이 함께 기록하고 있어요</small></div><div class="notebook-members">${memberMarkup(book)}</div>${book.role==='owner'?`<button class="primary" data-action="create-invite" data-notebook="${book.id}">${icon('plus')} 초대 링크 만들기</button><button class="outline invite-secondary" data-action="revoke-invites" data-notebook="${book.id}">기존 초대 링크 만료시키기</button><p class="hint">링크는 7일 동안 유효해요. 참여한 친구는 글과 댓글을 남길 수 있어요.</p>`:`<p class="hint">함께할 친구를 더 초대하려면 관리자에게 요청해 주세요.</p><button class="outline invite-secondary" data-action="leave-notebook" data-notebook="${book.id}">수첩에서 나가기</button>`}`);
}
function localPostsToPublish(book){return data.posts.filter(p=>p.book===book.id&&p.author===data.profile&&!/^p[123]$/.test(p.id));}
function openPublishNotebook(book){
  const records=localPostsToPublish(book);
  openDialog('친구와 함께 기록하기',`<div class="invite-notebook"><span>${esc(book.emoji)}</span><strong>${esc(book.name)}</strong></div><p class="hint">이 수첩을 온라인 공유 수첩으로 바꾸면 친구를 초대할 수 있어요. 내가 작성한 기록 ${records.length}개와 사진을 서버에 함께 저장합니다.</p><p class="hint">예시 기록은 공유하지 않아요. 기존 수첩과 댓글은 이 기기의 백업에 보관됩니다.</p><button class="primary" data-action="publish-notebook" data-notebook="${book.id}">공유 수첩으로 전환하기</button>`);
}
async function publishNotebook(id){
  const book=data.books.find(b=>b.id===id);if(!book||book.remote)return;
  await syncCollaborationProfile(true);
  const result=await collaborationRequest('/books','POST',{...book,posts:localPostsToPublish(book)});
  const previous=structuredClone(data);
  data.localArchives=[...(data.localArchives||[]),{book:structuredClone(book),posts:structuredClone(data.posts.filter(p=>p.book===id))}];
  data.books=data.books.filter(b=>b.id!==id);data.posts=data.posts.filter(p=>p.book!==id);
  if(!save()){data=previous;toast('온라인 수첩은 만들었지만 기기 백업 저장에 실패했어요.');}
  selected=result.id;close();await refreshCollaboration();openNotebookMembers();
}
async function createInvite(id){
  const result=await collaborationRequest('/books/'+id+'/invites','POST');inviteLinkDraft=result.url;
  const local=['localhost','127.0.0.1'].includes(new URL(result.url).hostname);
  openDialog('친구 초대 링크',`<p class="hint">링크를 받은 친구가 카카오 로그인 후 참여할 수 있어요. 유효기간은 7일입니다.</p><label class="field">초대 링크<input id="invite-link" readonly value="${esc(result.url)}"></label><button class="primary" data-action="copy-invite">초대 링크 복사</button>${local?'<p class="invite-development-note">현재는 이 PC에서만 열리는 개발용 주소예요. 친구의 휴대폰에서 쓰려면 공용 주소로 배포해야 합니다.</p>':''}<button class="outline invite-secondary" data-action="show-members" data-notebook="${id}">멤버 목록으로</button>`);
}
async function openPendingInvite(){
  const params=new URLSearchParams(window.location.search),token=params.get('invite')||sessionStorage.getItem('micheulcheop-invite');
  if(!token||!/^\w{48}$/.test(token))return;
  sessionStorage.setItem('micheulcheop-invite',token);activeInviteToken=token;
  try{const invitation=await collaborationRequest('/invites/'+token);const b=invitation.book;
    openDialog('수첩에 초대받았어요',`<div class="invite-notebook"><span>${esc(b.emoji)}</span><strong>${esc(b.name)}</strong><small>${esc(b.owner)} 님이 만든 수첩 · ${b.memberCount}명</small></div><p class="hint">참여하면 이 수첩의 기록을 보고, 나의 맛집과 댓글을 함께 남길 수 있어요.</p>${authInfo.user?`<button class="primary" data-action="join-notebook">${invitation.joined?'수첩 열기':'함께 기록하기'}</button>`:'<button class="kakao-login" data-action="kakao-login">카카오 로그인하고 참여하기</button>'}<button class="outline invite-secondary" data-action="dismiss-invite">나중에</button>`);
  }catch(error){clearInvite();toast(error.message);}
}
function clearInvite(){sessionStorage.removeItem('micheulcheop-invite');const params=new URLSearchParams(window.location.search);params.delete('invite');history.replaceState(null,'',window.location.pathname+(params.size?'?'+params:'')+window.location.hash);}
async function joinNotebook(){const result=await collaborationRequest('/invites/'+activeInviteToken+'/join','POST',{});clearInvite();selected=result.id;favoritesView=false;tab='feed';query='';close();await refreshCollaboration();toast('이제 함께 기록할 수 있어요.');}
async function syncCollaborationProfile(throwOnFailure=false){if(!authInfo.user)return;try{await collaborationRequest('/profile','PATCH',{name:data.profile,photo:data.profilePhoto||''});}catch(error){if(throwOnFailure)throw error;toast('기기에는 저장했지만 공유 프로필을 갱신하지 못했어요.');}}
async function saveCollaborativeForm(form){
  const values=new FormData(form),id=form.dataset.id;
  if(form.id==='book-form'){
    const edited=form.dataset.edit==='true';const book=current();
    const payload={name:values.get('name'),emoji:values.get('emoji'),color:values.get('color'),description:values.get('description'),version:Number(form.dataset.version)};
    if(!edited)await syncCollaborationProfile(true);
    const result=await collaborationRequest(edited?'/books/'+book.id:'/books',edited?'PATCH':'POST',payload);
    if(!edited)selected=result.id;close();await refreshCollaboration();toast('공유 수첩을 저장했어요.');return;
  }
  if(form.id==='post-form'){
    if(photoBusy)throw Error('사진을 불러온 후 저장해 주세요.');
    const old=data.posts.find(p=>p.id===id),book=values.get('book');
    if(old?.remote&&old.book!==book)throw Error('공유 기록은 원래 수첩에서 수정해 주세요.');
    if(!values.get('name'))throw Error('지도에서 다녀온 장소를 선택해 주세요.');
    const payload={name:values.get('name'),area:values.get('area'),category:values.get('category'),placeId:values.get('placeId'),placeUrl:values.get('placeUrl'),rating:Number(values.get('rating')),text:values.get('text'),date:values.get('date'),lat:values.get('lat')===''?null:Number(values.get('lat')),lon:values.get('lon')===''?null:Number(values.get('lon')),photo:document.querySelector('#photo-preview').getAttribute('src')||'',version:Number(form.dataset.version)};
    await collaborationRequest(old?.remote?'/posts/'+old.id:'/books/'+book+'/posts',old?.remote?'PATCH':'POST',payload);
    selected=book;tab='feed';favoritesView=false;query='';close();await refreshCollaboration();toast('함께 쓰는 수첩에 기록했어요.');return;
  }
  const post=data.posts.find(p=>p.id===(form.dataset.post||form.dataset.parent));if(!post)return;
  const comment=post.comments.find(c=>c.id===form.dataset.comment);
  await collaborationRequest('/posts/'+post.id+'/comments'+(comment?'/'+comment.id:''),comment?'PATCH':'POST',{text:values.get('text'),version:comment?Number(form.dataset.version):undefined});
  close();await refreshCollaboration();detail(post.id);toast('댓글을 저장했어요.');
}
document.addEventListener('submit',event=>{
  const form=event.target,values=new FormData(form),post=data.posts.find(p=>p.id===(form.dataset.id||form.dataset.post||form.dataset.parent));
  const remoteBook=data.books.find(b=>b.id===values.get('book'));
  const remote=(form.id==='book-form'&&(form.dataset.edit==='true'?current()?.remote:values.get('shared')==='true'))||(form.id==='post-form'&&(post?.remote||remoteBook?.remote))||(['comment-form','edit-comment-form'].includes(form.id)&&post?.remote);
  if(!remote)return;event.preventDefault();event.stopImmediatePropagation();if(!authInfo.user){loginToCollaborate();return;}collaborationAction(()=>saveCollaborativeForm(form));
},true);
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const action=button.dataset.action;
  const post=data.posts.find(p=>p.id===(button.dataset.favorite||button.dataset.confirmDelete||button.dataset.parent));
  const remoteMutation=post?.remote&&(button.dataset.favorite||button.dataset.confirmDelete||button.dataset.deleteComment);
  const actions=['invite','publish-notebook','create-invite','copy-invite','show-members','join-notebook','dismiss-invite','revoke-invites','remove-member','confirm-remove-member','leave-notebook','confirm-leave-notebook'];
  if(!remoteMutation&&!actions.includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action==='invite'){openNotebookMembers();return;}
  if(action==='show-members'){openNotebookMembers(data.books.find(b=>b.id===button.dataset.notebook));return;}
  if(action==='dismiss-invite'){clearInvite();close();return;}
  if(action==='copy-invite'){const fallback=()=>{document.querySelector('#invite-link')?.select();toast('선택한 링크를 복사해 주세요.');};if(navigator.clipboard?.writeText)navigator.clipboard.writeText(inviteLinkDraft).then(()=>toast('초대 링크를 복사했어요.')).catch(fallback);else fallback();return;}
  if(action==='remove-member'){openDialog('멤버를 내보낼까요?',`<p class="hint">이 멤버는 수첩에 접근할 수 없게 됩니다. 이미 남긴 기록은 보관돼요.</p><button class="primary" data-action="confirm-remove-member" data-notebook="${button.dataset.notebook}" data-member="${esc(button.dataset.member)}">내보내기</button>`);return;}
  if(action==='leave-notebook'){openDialog('수첩에서 나갈까요?',`<p class="hint">나가면 수첩과 기록을 볼 수 없어요. 다시 참여하려면 초대 링크가 필요합니다.</p><button class="primary" data-action="confirm-leave-notebook" data-notebook="${button.dataset.notebook}">수첩에서 나가기</button>`);return;}
  collaborationAction(async()=>{
    if(action==='publish-notebook')return publishNotebook(button.dataset.notebook);
    if(action==='create-invite')return createInvite(button.dataset.notebook);
    if(action==='join-notebook')return joinNotebook();
    if(action==='revoke-invites'){await collaborationRequest('/books/'+button.dataset.notebook+'/invites','DELETE',{});toast('기존 초대 링크를 모두 만료시켰어요.');return;}
    if(action==='confirm-remove-member'){await collaborationRequest('/books/'+button.dataset.notebook+'/members/'+button.dataset.member,'DELETE',{});close();await refreshCollaboration();openNotebookMembers(data.books.find(b=>b.id===button.dataset.notebook));return;}
    if(action==='confirm-leave-notebook'){await collaborationRequest('/books/'+button.dataset.notebook+'/leave','POST',{});close();await refreshCollaboration();toast('수첩에서 나왔어요.');return;}
    if(button.dataset.favorite){await collaborationRequest('/posts/'+post.id+'/favorite','POST',{saved:!post.favorite});const inDetail=Boolean(modal.firstChild);await refreshCollaboration();if(inDetail)detail(post.id);toast(post.favorite?'즐겨찾기를 해제했어요.':'즐겨찾기에 저장했어요.');return;}
    if(button.dataset.confirmDelete){await collaborationRequest('/posts/'+post.id,'DELETE',{version:Number(button.dataset.version)||post.version});close();await refreshCollaboration();toast('기록을 삭제했어요.');return;}
    if(button.dataset.deleteComment){const comment=post.comments.find(c=>c.id===button.dataset.deleteComment);await collaborationRequest('/posts/'+post.id+'/comments/'+comment.id,'DELETE',{version:comment.version});close();await refreshCollaboration();detail(post.id);toast('댓글을 삭제했어요.');}
  });
},true);
window.setInterval?.(()=>{if(authInfo.user&&!collaborationBusy&&!modal.firstChild&&document.visibilityState!=='hidden')refreshCollaboration({quiet:true});},8000);
