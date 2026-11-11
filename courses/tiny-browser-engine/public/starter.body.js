// Your engine. This is a function body receiving the supplied `support` object.
// Keep all eight functions; finish them in course order. No author engine is inserted.
const {fail,copy,node,connected,defaults,inside,intersect}=support;
function buildDOM(tokens){ fail('not_implemented','M1: buildDOM is not implemented.'); }
function mutate(doc,operation){ fail('not_implemented','M1: mutate is not implemented.'); }
function styles(doc,rules){ fail('not_implemented','M2: styles is not implemented.'); }
function layout(doc,styles,viewport){ fail('not_implemented','M3–M4: layout is not implemented.'); }
function display(doc,styles,layout,viewport){ fail('not_implemented','M5: display is not implemented.'); }
function target(display,point,viewport){ fail('not_implemented','M5: target is not implemented.'); }
function dispatch(doc,targetId,listeners,event,invoke){ fail('not_implemented','M6: dispatch is not implemented.'); }
function invalidation(change){ fail('not_implemented','M7: invalidation is not implemented.'); }
return {buildDOM,mutate,styles,layout,display,target,dispatch,invalidation};
