// Original vector-like app mark rasterized locally, with no external assets.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const size=256,raw=Buffer.alloc((size*4+1)*size);
const circle=(x,y,cx,cy,r)=>Math.hypot(x-cx,y-cy)<=r;
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let color=[0,0,0,0];
  for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
    const px=x+(sx+.5)/4,py=y+(sy+.5)/4;
    const background=Math.hypot(Math.max(Math.abs(px-128)-78,0),Math.max(Math.abs(py-128)-78,0))<=38;
    let pink=circle(px,py,128,128,19);
    for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2;pink ||= circle(px,py,128+Math.cos(a)*68,128+Math.sin(a)*68,12);}
    const sample=pink?[241,118,139,255]:background?[36,39,44,255]:[0,0,0,0];
    color=color.map((v,i)=>v+sample[i]/16);
  }
  const offset=y*(size*4+1)+1+x*4;for(let i=0;i<4;i++)raw[offset+i]=Math.round(color[i]);
}
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),len=Buffer.alloc(4),checksum=Buffer.alloc(4);len.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([len,tag,data,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
const target=path.join(__dirname,'../src/renderer/assets');fs.writeFileSync(path.join(target,'aptic.png'),png);fs.writeFileSync(path.join(target,'aptic.ico'),Buffer.concat([ico,png]));
