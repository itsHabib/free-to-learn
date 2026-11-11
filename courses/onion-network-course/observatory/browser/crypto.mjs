// Browser adapter: only the platform's vetted AES-GCM implementation encrypts data.
export class LabError extends Error {
  constructor(code, detail=code) {super(detail);this.name='LabError';this.code=code;}
}
export function requireThat(condition,code,detail) {if(!condition)throw new LabError(code,detail);}
export const utf8=value=>new TextEncoder().encode(value);
export function toBase64(bytes) {
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);
}
export function fromBase64(text) {
  return Uint8Array.from(atob(text),c=>c.charCodeAt(0));
}
export function context(circuitId,relayId,direction,seq) {
  requireThat(typeof circuitId==='string'&&typeof relayId==='string','BAD_CONTEXT');
  requireThat(['forward','backward'].includes(direction),'BAD_DIRECTION');
  requireThat(Number.isSafeInteger(seq)&&seq>=0&&seq<1024,'BAD_SEQUENCE');
  return {protocol:'onion-lab-v1',circuitId,relayId,direction,seq};
}
export function createCryptoPlatform(provider=globalThis.crypto) {
  requireThat(provider?.subtle&&provider?.getRandomValues,'CRYPTO_UNAVAILABLE','This environment needs built-in Web Crypto.');
  const materials=new WeakMap();
  function freshKey() {
    const handle=Object.freeze({kind:'ephemeral-toy-key'}),raw=provider.getRandomValues(new Uint8Array(32));
    const promise=provider.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']).finally(()=>raw.fill(0));
    materials.set(handle,{promise,used:new Set(),active:true});return handle;
  }
  function destroyKey(handle) {
    const material=materials.get(handle);if(material)material.active=false;materials.delete(handle);
    // CryptoKey/JS memory cannot be securely erased by this application.
  }
  function materialFor(handle) {
    const material=materials.get(handle);requireThat(material?.active,'KEY_UNAVAILABLE');return material;
  }
  const aad=ctx=>utf8(JSON.stringify(context(ctx.circuitId,ctx.relayId,ctx.direction,ctx.seq)));
  const nonce=seq=>{const bytes=new Uint8Array(12);new DataView(bytes.buffer).setUint32(8,seq);return bytes;};
  async function seal(handle,ctx,value) {
    const additionalData=aad(ctx),material=materialFor(handle);
    requireThat(!material.used.has(ctx.seq),'NONCE_REUSE','Use a fresh sequence or rebuild with fresh keys.');
    const plaintext=utf8(JSON.stringify(value));requireThat(plaintext.length<=262144,'OVERSIZE');
    // Reserve synchronously, before any await, so concurrent calls cannot reuse a nonce.
    material.used.add(ctx.seq);
    const key=await material.promise;requireThat(material.active,'KEY_UNAVAILABLE');
    const combined=new Uint8Array(await provider.subtle.encrypt({name:'AES-GCM',iv:nonce(ctx.seq),additionalData,tagLength:128},key,plaintext));
    return {seq:ctx.seq,ciphertext:toBase64(combined.slice(0,-16)),tag:toBase64(combined.slice(-16))};
  }
  async function open(handle,ctx,packet) {
    const additionalData=aad(ctx),material=materialFor(handle);
    requireThat(packet&&packet.seq===ctx.seq&&typeof packet.ciphertext==='string'&&typeof packet.tag==='string','BAD_PACKET');
    requireThat(packet.ciphertext.length<=350000,'OVERSIZE');
    const key=await material.promise;requireThat(material.active,'KEY_UNAVAILABLE');
    try {
      const ciphertext=fromBase64(packet.ciphertext),tag=fromBase64(packet.tag);requireThat(tag.length===16,'AUTH_FAILED');
      const combined=new Uint8Array(ciphertext.length+tag.length);combined.set(ciphertext);combined.set(tag,ciphertext.length);
      const plaintext=await provider.subtle.decrypt({name:'AES-GCM',iv:nonce(ctx.seq),additionalData,tagLength:128},key,combined);
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
    }catch {throw new LabError('AUTH_FAILED','Ciphertext, tag, context or key did not authenticate.');}
  }
  return {freshKey,destroyKey,seal,open,context,requireThat,LabError};
}
const platform=createCryptoPlatform();
export const {freshKey,destroyKey,seal,open}=platform;
