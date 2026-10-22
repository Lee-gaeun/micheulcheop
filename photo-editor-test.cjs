const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({console,document:{addEventListener(){}},WeakMap,Math});
vm.runInContext(fs.readFileSync('photo-editor.js','utf8'),context);
const run=source=>vm.runInContext(source,context);
let drawn;
const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){drawn=args;}})};
context.testCanvas=canvas;
run('activePhotoEditor={image:{width:800,height:400},zoom:1,x:0,y:0,filter:"original"};drawPhotoAdjustment(testCanvas,400)');
assert.equal(canvas.width,400);assert.equal(canvas.height,400);assert.deepEqual(drawn.slice(1),[-200,0,800,400]);
run('activePhotoEditor.x=1;drawPhotoAdjustment(testCanvas,400)');assert.equal(drawn[1],0);
run('activePhotoEditor.x=-1;drawPhotoAdjustment(testCanvas,400)');assert.equal(drawn[1],-400);
run('activePhotoEditor={image:{width:400,height:800},zoom:2,x:0,y:1,filter:"original"};drawPhotoAdjustment(testCanvas,400)');
assert.deepEqual(drawn.slice(1),[-200,0,800,1600]);
for(const filter of ['warm','cool','vivid','soft','mono']){
  const pixels={data:new Uint8ClampedArray([160,100,70,255])};
  context.pixelContext={getImageData:()=>pixels,putImageData(value){assert.equal(value,pixels);}};
  context.testFilter=filter;run('filterPhoto(pixelContext,1,testFilter)');
  assert.equal(pixels.data[3],255);if(filter==='mono')assert.equal(pixels.data[0],pixels.data[2]);
  if(filter==='warm')assert.ok(pixels.data[0]>160&&pixels.data[2]<70);
  if(filter==='cool')assert.ok(pixels.data[0]<160&&pixels.data[2]>70);
}
console.log('PASS: square crop, zoom, horizontal/vertical positioning and five filters with opaque output');
