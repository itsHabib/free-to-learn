import {stable} from './supplier.mjs';

export function explainNode(state,nodeId){
 const node=state.doc.nodes.find(n=>n.id===nodeId);if(!node)throw Error('Choose a current node handle.');
 const elementId=node.kind==='text'?node.parent:node.id,frame=state.frame;
 return {node,computed:frame.styles[elementId]??null,box:frame.layout.boxes.find(b=>b.nodeId===elementId)??null,glyphs:frame.layout.glyphs.filter(g=>g.nodeId===node.id||g.ownerId===node.id||g.ancestors?.includes(node.id)),commands:frame.display.commands.filter(c=>c.nodeId===node.id||c.ownerId===node.id),hitRegions:frame.display.regions.filter(r=>r.nodeId===elementId)};
}
function semanticDOM(doc){return {root:doc.root,nodes:doc.nodes.map(({span,...node})=>node)};}
function valueStyles(styles){return Object.fromEntries(Object.entries(styles).map(([id,s])=>[id,s.values]));}
export function frameDifference(before,after){
 if(!before)return {status:'initial-frame',changed:['DOM','computed values','layout','display'],firstChanged:'DOM',note:'There is no earlier frame. This reports changes, not correctness.'};
 const comparisons=[['DOM',semanticDOM(before.doc),semanticDOM(after.doc)],['computed values',valueStyles(before.frame.styles),valueStyles(after.frame.styles)],['layout',before.frame.layout,after.frame.layout],['display',before.frame.display,after.frame.display]];
 const changed=comparisons.filter(([,a,b])=>stable(a)!==stable(b)).map(([name])=>name);
 return {status:changed.length?'changed':'same-stage-products',changed,firstChanged:changed[0]??null,stageCalls:Object.fromEntries(['styles','layout','display'].map(name=>[name,after.counters[name]-before.counters[name]])),note:'The first changed stage is not necessarily a defect. Compare with your prediction and the contract.'};
}
export function overlayShapes(state,nodeId){
 const detail=explainNode(state,nodeId),scroll=state.frame.viewport.scrollY,shapes=[];
 if(detail.box){const b=detail.box;shapes.push({label:'border box',color:'#1266c2',x:b.x,y:b.y-scroll,width:b.width,height:b.height});shapes.push({label:'content box',color:'#b64c10',x:b.contentX,y:b.contentY-scroll,width:b.contentWidth,height:b.contentHeight});}
 else for(const g of detail.glyphs)shapes.push({label:'glyph cell',color:'#7f3592',x:g.x,y:g.y-scroll,width:g.width,height:g.height});
 return shapes;
}
