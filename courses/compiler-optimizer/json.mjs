// Supplied bounded JSON reader. Native JSON.parse alone loses duplicate keys.
export function parseJSON(text, {maxBytes=1024*1024,maxNodes=50000}={}) {
  if(typeof text!=='string'||Buffer.byteLength(text)>maxBytes)throw new Error('json.size_limit');
  let at=0,nodes=0;
  const white=()=>{while(/[\x20\t\r\n]/.test(text[at]??'!'))at++;};
  const string=()=>{const start=at++;while(at<text.length){const char=text[at++];if(char==='\\'){at++;continue;}if(char==='"')return JSON.parse(text.slice(start,at));}throw new Error('json.unterminated_string');};
  const value=depth=>{
    if(depth>80||++nodes>maxNodes)throw new Error('json.structure_limit');white();
    if(text[at]==='"'){string();return;}
    if(text[at]==='{'){
      at++;white();const keys=new Set();if(text[at]==='}'){at++;return;}
      while(true){white();if(text[at]!=='"')throw new Error('json.object_key');const key=string();if(keys.has(key))throw new Error(`json.duplicate_key:${key}`);keys.add(key);white();if(text[at++]!==':')throw new Error('json.colon');value(depth+1);white();const end=text[at++];if(end==='}')return;if(end!==',')throw new Error('json.object_separator');}
    }
    if(text[at]==='['){at++;white();if(text[at]===']'){at++;return;}while(true){value(depth+1);white();const end=text[at++];if(end===']')return;if(end!==',')throw new Error('json.array_separator');}}
    const token=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));
    if(!token)throw new Error('json.value');at+=token[0].length;
  };
  value(0);white();if(at!==text.length)throw new Error('json.trailing_data');return JSON.parse(text);
}
