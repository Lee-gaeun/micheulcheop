let kakaoSdkPromise;
let currentLocation, locationRequest;
function getCurrentLocation(){
  if(currentLocation&&Date.now()-currentLocation.time<60000)return Promise.resolve(currentLocation);
  if(locationRequest)return locationRequest;
  if(!globalThis.navigator?.geolocation)return Promise.reject(new Error('unsupported'));
  locationRequest=new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(position=>{
      const lat=position.coords.latitude,lon=position.coords.longitude;
      if(!Number.isFinite(lat)||!Number.isFinite(lon)){reject(new Error('invalid-position'));return;}
      currentLocation={lat,lon,time:Date.now()};resolve(currentLocation);
    },reject,{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }).finally(()=>{locationRequest=undefined;});
  return locationRequest;
}
function attachCurrentLocation(map,container,{autoCenter=true,canCenter=()=>true}={}){
  const kakao=window.kakao;
  let interacted=false,marker,request=0;
  container.addEventListener('pointerdown',()=>{interacted=true;});
  container.addEventListener('keydown',()=>{interacted=true;});
  const status=document.createElement('div');status.className='location-status';status.setAttribute('role','status');
  const button=document.createElement('button');button.type='button';button.className='locate-button';button.setAttribute('aria-label','현재 위치로 이동');button.title='현재 위치로 이동';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
  container.append(status,button);
  async function locate(manual=false){
    const id=++request;status.textContent='현재 위치를 찾고 있어요';button.disabled=true;
    try{
      const location=await getCurrentLocation();
      if(!container.isConnected||!status.isConnected||id!==request)return;
      const point=new kakao.maps.LatLng(location.lat,location.lon);
      marker?.setMap(null);
      marker=new kakao.maps.CustomOverlay({map,position:point,content:'<span class="my-location-dot" aria-label="내 위치"></span>',zIndex:2});
      if(manual||(!interacted&&canCenter())){map.setLevel(4);map.setCenter(point);}
      status.textContent='내 위치';
    }catch(error){
      if(!container.isConnected||!status.isConnected||id!==request)return;
      status.textContent=error.code===1?'위치 권한이 꺼져 있어요':error.code===3?'위치를 찾는 데 시간이 걸려요':'현재 위치를 확인할 수 없어요';
    }finally{if(id===request)button.disabled=false;}
  }
  button.addEventListener('click',e=>{e.stopPropagation();locate(true);});
  if(autoCenter)locate();
}
function loadKakaoSdk() {
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao);
  if (kakaoSdkPromise) return kakaoSdkPromise;
  const key = window.MICHEULCHEOP_CONFIG?.kakaoJavaScriptKey;
  if (!key) return Promise.reject(new Error('missing-key'));
  kakaoSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('sdk-timeout')), 12000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) { clearTimeout(timer); reject(new Error('sdk-unavailable')); return; }
      window.kakao.maps.load(() => { clearTimeout(timer); resolve(window.kakao); });
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('sdk-error')); };
    document.head.appendChild(script);
  }).catch(error => { kakaoSdkPromise = undefined; throw error; });
  return kakaoSdkPromise;
}
async function mountKakaoMap(container, records, selectedId) {
  if (!window.MICHEULCHEOP_CONFIG?.kakaoJavaScriptKey) return;
  try {
    const kakao = await loadKakaoSdk();
    if (!container.isConnected) return;
    const selected = records.find(p => p.id === selectedId) || records[0] || {lat:37.545,lon:127.04};
    container.replaceChildren();
    const map = new kakao.maps.Map(container, {center:new kakao.maps.LatLng(selected.lat,selected.lon),level:5});
    const bounds = new kakao.maps.LatLngBounds();
    const positions = new Set();
    records.forEach(p => {
      const position = new kakao.maps.LatLng(p.lat,p.lon);
      bounds.extend(position);
      const positionKey = `${p.lat},${p.lon}`;
      if (positions.has(positionKey)) return;
      positions.add(positionKey);
      const marker = new kakao.maps.Marker({map,position,title:p.name});
      kakao.maps.event.addListener(marker,'click',() => detail(p.id));
    });
    if (!selectedId && positions.size > 1) map.setBounds(bounds);
    attachCurrentLocation(map,container,{autoCenter:!selectedId});
  } catch {
    if (container.isConnected) {
      const status = container.querySelector('.map-status');
      if (status) status.textContent = '지도를 불러오지 못했어요. 카카오맵에서 확인해 주세요.';
    }
  }
}
