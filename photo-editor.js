const photoOriginals=new WeakMap(),photoAdjustments=new WeakMap();
let activePhotoEditor=null,photoEditorRequest=0;
function squarePhoto(canvas){const size=Math.min(canvas.width,canvas.height),output=document.createElement('canvas');output.width=output.height=Math.min(1080,size);output.getContext('2d').drawImage(canvas,(canvas.width-size)/2,(canvas.height-size)/2,size,size,0,0,output.width,output.height);return output.toDataURL('image/jpeg',.85);}
const photoFilters=[['original','원본'],['warm','따뜻하게'],['cool','산뜻하게'],['vivid','선명하게'],['soft','부드럽게'],['mono','흑백']];
function filterPhoto(context,size,filter){
  if(filter==='original')return;const pixels=context.getImageData(0,0,size,size),a=pixels.data;
  for(let i=0;i<a.length;i+=4){let r=a[i],g=a[i+1],b=a[i+2];const grey=.2126*r+.7152*g+.0722*b;
    if(filter==='warm'){r=r*1.07+5;g=g*1.015+2;b=b*.93;}
    if(filter==='cool'){r=r*.95;g=g*1.025;b=b*1.07+4;}
    if(filter==='vivid'){r=(grey+(r-grey)*1.22-128)*1.06+128;g=(grey+(g-grey)*1.22-128)*1.06+128;b=(grey+(b-grey)*1.22-128)*1.06+128;}
    if(filter==='soft'){r=r*.92+15;g=g*.92+13;b=b*.92+12;}
    if(filter==='mono')r=g=b=grey;
    a[i]=r;a[i+1]=g;a[i+2]=b;
  }context.putImageData(pixels,0,0);
}
function drawPhotoAdjustment(canvas,size){const e=activePhotoEditor;if(!e?.image)return;canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),fit=Math.max(size/e.image.width,size/e.image.height)*e.zoom,w=e.image.width*fit,h=e.image.height*fit;ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.drawImage(e.image,(size-w)/2+e.x*(w-size)/2,(size-h)/2+e.y*(h-size)/2,w,h);filterPhoto(ctx,size,e.filter);}
function refreshPhotoAdjustment(){const e=activePhotoEditor;if(!e)return;drawPhotoAdjustment(e.canvas,360);e.root.querySelector('[data-photo-zoom-value]').textContent=e.zoom.toFixed(1)+'×';for(const name of ['zoom','x','y'])e.root.querySelector('[data-crop="'+name+'"]').value=e[name];e.root.querySelectorAll('[data-photo-filter]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.photoFilter===e.filter));});}
function closePhotoAdjustment(){const e=activePhotoEditor;if(!e)return;e.root.remove();activePhotoEditor=null;e.returnFocus?.focus();}
async function openPhotoAdjustment(index){
  if(activePhotoEditor)return;const request=++photoEditorRequest;
  if(photoBusy){toast('사진을 불러온 후 편집해 주세요.');return;}const item=photoDraft[index];if(!item)return;
  const source=photoOriginals.get(item)||item.url;const image=new Image();image.crossOrigin='anonymous';image.src=source;
  try{await image.decode();}catch{toast('편집할 사진을 불러오지 못했어요. 다시 추가해 주세요.');return;}
  if(request!==photoEditorRequest||photoDraft[index]!==item||!document.querySelector('#post-form'))return;photoOriginals.set(item,source);
  const root=document.createElement('div');root.className='photo-adjust-overlay';root.innerHTML=`<section class="photo-adjust-dialog" role="dialog" aria-modal="true" aria-label="사진 편집"><header><h2>사진 편집</h2><button type="button" data-photo-adjust="cancel" aria-label="사진 편집 닫기">×</button></header><p class="hint">정사각형 안에서 사진을 끌어 위치를 맞춰보세요.</p><canvas class="photo-crop-canvas" aria-label="정사각형 사진 미리보기"></canvas><div class="crop-controls"><label>확대 <output data-photo-zoom-value>1.0×</output><input data-crop="zoom" type="range" min="1" max="3" step="0.05" aria-label="사진 확대"></label><label>가로 위치<input data-crop="x" type="range" min="-1" max="1" step="0.01" aria-label="사진 가로 위치"></label><label>세로 위치<input data-crop="y" type="range" min="-1" max="1" step="0.01" aria-label="사진 세로 위치"></label></div><div class="photo-filter-list" aria-label="사진 필터">${photoFilters.map(([id,name])=>`<button type="button" data-photo-filter="${id}" aria-pressed="false">${name}</button>`).join('')}</div><footer><button type="button" class="outline" data-photo-adjust="reset">초기화</button><button type="button" class="primary" data-photo-adjust="apply">적용</button></footer></section>`;
  activePhotoEditor={root,image,item,index,canvas:root.querySelector('canvas'),returnFocus:document.activeElement,zoom:1,x:0,y:0,filter:'original',...photoAdjustments.get(item)};document.body.append(root);
  try{refreshPhotoAdjustment();}catch{closePhotoAdjustment();toast('이 사진은 편집할 수 없어요. 갤러리에서 다시 추가해 주세요.');return;}
  const canvas=activePhotoEditor.canvas;let drag=null;
  canvas.addEventListener('pointerdown',event=>{if(!activePhotoEditor)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{const e=activePhotoEditor;if(!e||!drag||drag.id!==event.pointerId)return;const size=canvas.getBoundingClientRect().width,fit=Math.max(size/e.image.width,size/e.image.height)*e.zoom,overflowX=e.image.width*fit-size,overflowY=e.image.height*fit-size;if(overflowX>.01)e.x=Math.max(-1,Math.min(1,e.x+2*(event.clientX-drag.x)/overflowX));if(overflowY>.01)e.y=Math.max(-1,Math.min(1,e.y+2*(event.clientY-drag.y)/overflowY));drag.x=event.clientX;drag.y=event.clientY;refreshPhotoAdjustment();});
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>{drag=null;});root.querySelector('button').focus();
}
document.addEventListener('input',event=>{if(!event.target.dataset?.crop||!activePhotoEditor)return;activePhotoEditor[event.target.dataset.crop]=Number(event.target.value);refreshPhotoAdjustment();},true);
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.adjustPhoto!==undefined){event.preventDefault();event.stopImmediatePropagation();openPhotoAdjustment(Number(button.dataset.adjustPhoto));return;}
  if(!button.closest('.photo-adjust-overlay'))return;event.preventDefault();event.stopImmediatePropagation();const e=activePhotoEditor;if(!e)return;
  if(button.dataset.photoFilter){e.filter=button.dataset.photoFilter;try{refreshPhotoAdjustment();}catch{toast('이 사진에 필터를 적용하지 못했어요.');}return;}
  const action=button.dataset.photoAdjust;if(action==='cancel'){closePhotoAdjustment();return;}if(action==='reset'){Object.assign(e,{zoom:1,x:0,y:0,filter:'original'});refreshPhotoAdjustment();return;}
  if(action==='apply'){try{const output=document.createElement('canvas');drawPhotoAdjustment(output,1080);const url=output.toDataURL('image/jpeg',.85);if(url.length>2800000){toast('사진 용량이 커요. 조금 더 확대해서 다시 시도해 주세요.');return;}e.item.url=url;photoAdjustments.set(e.item,{zoom:e.zoom,x:e.x,y:e.y,filter:e.filter});const index=e.index;closePhotoAdjustment();renderPhotoDraft(index);updatePostPreview(index);}catch{toast('사진을 적용하지 못했어요. 다시 시도해 주세요.');}}
},true);
document.addEventListener('keydown',event=>{if(!activePhotoEditor)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePhotoAdjustment();}else if(event.key==='Tab'){event.stopImmediatePropagation();const items=[...activePhotoEditor.root.querySelectorAll('button,input')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}},true);
