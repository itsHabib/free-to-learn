import {glyphs,FONT_ID} from './font.mjs';
import {fail,intersect,validateViewport,LIMITS} from './supplier.mjs';
export {FONT_ID};
const rgb=s=>{if(!/^#[0-9a-f]{6}$/i.test(s))fail('raster_color','Use #RRGGBB colors.');return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));};
function validRect(r){if(!r||!['x','y','width','height'].every(k=>Number.isSafeInteger(r[k]))||r.width<0||r.height<0)fail('raster_geometry','Raster rectangles must have integer coordinates and nonnegative extents.');}
export function raster(display,rawViewport){
  const v=validateViewport(rawViewport),output=new Uint8ClampedArray(v.width*v.height*4).fill(255);
  if(!Array.isArray(display?.commands)||display.commands.length>LIMITS.commands)fail('command_limit','Invalid display command count.');
  const viewport={x:0,y:v.scrollY,width:v.width,height:v.height};
  function rect(r,color,clip){
    validRect(r);validRect(clip);const bounds=intersect(intersect(r,clip),viewport),c=rgb(color);
    for(let y=bounds.y;y<bounds.y+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){
      const i=((y-v.scrollY)*v.width+x)*4;output[i]=c[0];output[i+1]=c[1];output[i+2]=c[2];output[i+3]=255;
    }
  }
  for(const cmd of display.commands){
    if(cmd.kind==='rect'){rect(cmd,cmd.color,cmd.clip);continue;}
    if(cmd.kind!=='glyph')fail('raster_command','Unknown display command.');
    if(!Number.isInteger(cmd.x)||!Number.isInteger(cmd.y)||!Object.hasOwn(glyphs,cmd.char))fail('raster_glyph','Glyph position or supplied glyph is invalid.');
    const rows=glyphs[cmd.char];for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y]&(1<<(4-x)))rect({x:cmd.x+x+1,y:cmd.y+y*2+1,width:1,height:2},cmd.color,cmd.clip);
  }
  return output;
}
