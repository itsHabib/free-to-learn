// Narrow assertion adapter for the course's public cases; not a general test framework.
function failure(actual,expected,message) {
  const error=new Error(message??`Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
  error.code='ERR_ASSERTION';error.actual=actual;error.expected=expected;throw error;
}
function equivalent(a,b) {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a),other=Object.keys(b);
  return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&equivalent(a[k],b[k]));
}
export const assert={
  equal:(a,b,message)=>{if(!Object.is(a,b))failure(a,b,message);},
  notEqual:(a,b,message)=>{if(Object.is(a,b))failure(a,`different from ${b}`,message);},
  ok:(value,message)=>{if(!value)failure(value,true,message);},
  deepEqual:(a,b,message)=>{if(!equivalent(a,b))failure(a,b,message);},
};
