let placeResults = [], placeRequest = 0, photoRequest = 0, photoBusy = false;
let placeSearchTimer;
function cancelPlaceSearch(){clearTimeout(placeSearchTimer);++placeRequest;}
function schedulePlaceSearch(input){
  cancelPlaceSearch();
  placeResults=[];
  discoveryMarkers.forEach(marker=>marker.setMap(null));discoveryMarkers=[];
  const list=document.querySelector('#place-results');if(list)list.innerHTML='';
  if(input.isComposing||!input.value.trim())return;
  placeSearchTimer=setTimeout(()=>{if(input.isConnected)searchPlaces();},300);
}
let discoveryMap, discoveryMarkers=[], discoveryChoice=null;
function starRatingMarkup(value){return '<div class="star-picker"><div class="five-stars" aria-hidden="true">'+Array.from({length:5},(_,i)=>'<span class="rating-star"><span class="star-empty">★</span><span class="star-filled" style="width:'+Math.max(0,Math.min(1,value-i))*100+'%">★</span></span>').join('')+'</div><output id="star-value">'+value.toFixed(1)+'<small> / 5</small></output></div><input class="rating-slider" type="range" name="rating" min="0" max="5" step="0.1" value="'+value+'" aria-label="별점, 0.1점 단위"><p class="star-help">슬라이더로 0.1점씩 조절해요.</p>';}
function updateStarRating(){const value=Number(document.querySelector('input[name="rating"]')?.value??4.5);document.querySelectorAll('.star-filled').forEach((el,i)=>el.style.width=Math.max(0,Math.min(1,value-i))*100+'%');const output=document.querySelector('#star-value');if(output)output.innerHTML=value.toFixed(1)+'<small> / 5</small>';}
function updatePostPreview(activePhoto){
  const form=document.querySelector('#post-form'),target=document.querySelector('#post-live-preview');if(!form||!target)return;
  const values=new FormData(form),text=String(values.get('text')||'');
  const oldTrack=target.querySelector('.photo-carousel'),active=activePhoto??(oldTrack?Math.round(oldTrack.scrollLeft/Math.max(1,oldTrack.clientWidth)):0);
  target.innerHTML=card({id:'preview',name:values.get('name')||'선택한 식당',area:values.get('area')||'',category:values.get('category')||'맛집',rating:Number(values.get('rating')??4.5),text,date:values.get('date')||today(),photo:photoDraft[0]?.url||'',photos:photoDraft,author:data.profile,comments:[]})+galleryNavigation(photoDraft.length);
  const track=target.querySelector('.photo-carousel');if(track){track.scrollLeft=active*track.clientWidth;updateGalleryPosition(track);}
  const count=document.querySelector('#story-count');if(count)count.textContent=`${text.length.toLocaleString()} / 5,000`;
}
function discoverySelectionMarkup(p){return `<div class="discovery-place"><strong>📍 ${esc(p.name)}</strong><small>${esc(p.area)}</small><button type="button" class="primary" data-action="write-place">여기에 기록하기 ${icon('edit')}</button></div>`;}
async function initDiscoveryMap(){
  const container=document.querySelector('#discovery-map');if(!container||!container.isConnected)return;
  try{
    const kakao=await loadKakaoSdk();if(!container.isConnected)return;
    container.replaceChildren();discoveryMarkers=[];
    discoveryMap=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(discoveryChoice?.lat??37.545,discoveryChoice?.lon??127.04),level:5});
    const initialRequest=placeRequest;
    attachCurrentLocation(discoveryMap,container,{autoCenter:!discoveryChoice,canCenter:()=>placeRequest===initialRequest&&!discoveryChoice});
    if(discoveryChoice)showSelectedDiscoveryPlace(discoveryChoice);
  }catch{if(container.isConnected)container.innerHTML='<p class="hint">지도를 불러오지 못했어요. 잠시 후 다시 검색해 주세요.</p>';}
}
function showPlaceDiscovery(){document.querySelector('#place-discovery').hidden=false;document.querySelector('#record-editor').hidden=true;document.querySelector('.dialog h2').textContent='어디서 먹었나요?';initDiscoveryMap();document.querySelector('.dialog').scrollTop=0;}
function beginPlaceRecord(){if(!discoveryChoice)return;document.querySelector('#place-discovery').hidden=true;document.querySelector('#record-editor').hidden=false;document.querySelector('.dialog h2').textContent='미슐첩에 기록하기';updatePostPreview();document.querySelector('.dialog').scrollTop=0;}
function showSearchMarkers(kakao){
  if(!discoveryMap||!document.querySelector('#discovery-map')?.isConnected)return;
  discoveryMarkers.forEach(m=>m.setMap(null));discoveryMarkers=[];
  if(!placeResults.length)return;
  const bounds=new kakao.maps.LatLngBounds();
  placeResults.forEach((p,i)=>{const position=new kakao.maps.LatLng(Number(p.y),Number(p.x));bounds.extend(position);const marker=new kakao.maps.Marker({map:discoveryMap,position,title:p.place_name});kakao.maps.event.addListener(marker,'click',()=>choosePlace(i));discoveryMarkers.push(marker);});
  discoveryMap.setBounds(bounds);
}
function showSelectedDiscoveryPlace(place){
  if(!discoveryMap||!window.kakao?.maps)return;
  discoveryMarkers.forEach(marker=>marker.setMap(null));
  const position=new window.kakao.maps.LatLng(place.lat,place.lon);
  discoveryMarkers=[new window.kakao.maps.Marker({map:discoveryMap,position,title:place.name})];
  discoveryMap.setLevel(4);
  discoveryMap.panTo(position);
}
function selectedPlaceMarkup(p) {
  return `<input type="hidden" name="name" value="${esc(p?.name||'')}"><input type="hidden" name="area" value="${esc(p?.area||'')}"><input type="hidden" name="category" value="${esc(p?.category||'')}"><input type="hidden" name="lat" value="${p?.lat??''}"><input type="hidden" name="lon" value="${p?.lon??''}"><input type="hidden" name="placeId" value="${esc(p?.placeId||'')}"><input type="hidden" name="placeUrl" value="${esc(p?.placeUrl||'')}">${p?`<div class="selected-place"><span>📍</span><div><strong>${esc(p.name)}</strong><small>${esc(p.area)}</small><small>${esc(p.category)}</small></div><span class="place-check">✓</span></div>`:'<p class="hint place-instruction">식당이나 카페를 검색하고 아래 목록에서 선택해 주세요.</p>'}`;
}
async function searchPlaces() {
  clearTimeout(placeSearchTimer);
  const input=document.querySelector('#place-search'), list=document.querySelector('#place-results');
  if(!input||!list)return;
  const keyword=input.value.trim(), request=++placeRequest;
  placeResults=[];
  if(!keyword){list.innerHTML='<p class="hint">식당 이름이나 지역을 입력해 주세요.</p>';input.focus();return;}
  list.innerHTML='<p class="hint" role="status">카카오맵에서 찾고 있어요…</p>';
  try {
    const kakao=await loadKakaoSdk();
    if(request!==placeRequest||!list.isConnected)return;
    if(!kakao.maps.services?.Places)throw Error('services-unavailable');
    const groups=await Promise.all(['FD6','CE7'].map(category=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('timeout')),10000);
      new kakao.maps.services.Places().keywordSearch(keyword,(places,status)=>{
        clearTimeout(timer);
        if(status===kakao.maps.services.Status.OK)resolve(places);
        else if(status===kakao.maps.services.Status.ZERO_RESULT)resolve([]);
        else reject(Error('search-failed'));
      },{size:5,category_group_code:category});
    })));
    const result=Array.from({length:5},(_,i)=>groups.map(group=>group[i])).flat().filter(Boolean);
    if(request!==placeRequest||!list.isConnected)return;
    const seen=new Set();
    placeResults=result.filter(p=>{if(!['FD6','CE7'].includes(p.category_group_code)||seen.has(p.id))return false;seen.add(p.id);return true;}).slice(0,5);
    showSearchMarkers(kakao);
    list.innerHTML=placeResults.length?`<div class="place-result-label">추천 장소 ${placeResults.length}<span>Kakao Map</span></div>${placeResults.map((p,i)=>`<button type="button" class="place-result" data-choose-place="${i}"><span class="result-icon">${p.category_group_code==='CE7'?'☕':'🍴'}</span><span><strong>${esc(p.place_name)}</strong><small>${esc(p.road_address_name||p.address_name)}</small><small>${esc(p.category_name.split(' > ').slice(-1)[0])}</small></span><span class="result-plus">↗</span></button>`).join('')}`:'<p class="hint" role="status">찾는 식당이 없어요. 지역과 식당 이름을 함께 검색해 보세요.</p>';
  }catch{if(request===placeRequest&&list.isConnected)list.innerHTML='<p class="hint" role="status">검색을 불러오지 못했어요. 잠시 후 다시 검색해 주세요.</p>';}
}
function choosePlace(index) {
  clearTimeout(placeSearchTimer);
  const p=placeResults[index],target=document.querySelector('#selected-place');
  if(!p||!target)return;
  discoveryChoice={name:p.place_name,area:p.road_address_name||p.address_name,category:p.category_name.split(' > ').slice(-1)[0]||p.category_group_name,lat:Number(p.y),lon:Number(p.x),placeId:p.id,placeUrl:p.place_url};
  target.innerHTML=selectedPlaceMarkup(discoveryChoice);
  const selection=document.querySelector('#discovery-selection');if(selection)selection.innerHTML=discoverySelectionMarkup(discoveryChoice);
  showSelectedDiscoveryPlace(discoveryChoice);
  ++placeRequest;
  document.querySelector('#place-results').innerHTML='';
  document.querySelector('#place-search').value='';
  document.querySelector('#place-search').blur();
  updatePostPreview();
  toast('장소를 선택했어요.');
}
async function pickGalleryPhoto(input){
  const files=Array.from(input.files||[]);if(!files.length)return;if(photoDraft.length+files.length>10){toast('사진은 최대 10장까지 추가할 수 있어요.');input.value='';return;}
  const request=++photoRequest;photoBusy=true;const status=document.querySelector('#photo-status');if(status)status.textContent='사진을 불러오는 중이에요…';
  try{const additions=[];for(const file of files){if(!file.type.startsWith('image/'))throw Error('image');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const url=canvas.toDataURL('image/jpeg',.78);if(url.length>2800000)throw Error('size');const item={url:squarePhoto(canvas),text:''};photoOriginals.set(item,url);additions.push(item);}if(request!==photoRequest||!input.isConnected)return;const active=photoDraft.length;photoDraft.push(...additions);renderPhotoDraft(active);updatePostPreview();if(status)status.textContent='사진마다 그날의 이야기를 들려주세요.';
  }catch{if(request===photoRequest){toast('사진을 불러오지 못했어요. JPG 또는 PNG로 다시 선택해 주세요.');if(status)status.textContent='사진을 다시 선택해 주세요.';}}
  finally{if(request===photoRequest){photoBusy=false;input.value='';}}
}
