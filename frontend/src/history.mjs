// Keep color and cadence in the same visual band. A 3 µg/m³ deadband around
// 35 and 75 prevents repeated changes for readings near a boundary.
export function tone(value, previous=null) {
  if(!Number.isFinite(value)||value<0)return 'inactive';
  if(previous==='sage')return value>=78?'clay':value>=38?'ochre':'sage';
  if(previous==='ochre')return value>=78?'clay':value<32?'sage':'ochre';
  if(previous==='clay')return value<32?'sage':value<72?'ochre':'clay';
  return value<35?'sage':value<75?'ochre':'clay';
}

export function projectHistory(points, start, end, {left=0,top=0,width=360,height=44,maximum=null}={}) {
  const selected=points.filter(point=>point.at>=start&&point.at<=end);
  const values=selected.filter(point=>Number.isFinite(point.value)).map(point=>point.value);
  const max=maximum??Math.max(15,...values)*1.14;
  const project=point=>({...point,x:left+(point.at-start)/(end-start)*width,y:point.value===null?null:top+height-(point.value/max)*height});
  return {points:selected.map(project),maximum:max,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
}
// A monotone cubic passes through measured samples without overshooting extrema.
export function curve(points) {
  const groups=[]; let group=[];
  for(const point of points) { if(point.y===null) {if(group.length)groups.push(group);group=[];} else group.push(point); }
  if(group.length)groups.push(group);
  return groups.map(items=>{
    if(items.length===1)return `M${items[0].x},${items[0].y}`;
    const slopes=items.slice(1).map((point,index)=>(point.y-items[index].y)/(point.x-items[index].x));
    const tangents=items.map((point,index)=>index===0?slopes[0]:index===items.length-1?slopes.at(-1):slopes[index-1]*slopes[index]<=0?0:2/(1/slopes[index-1]+1/slopes[index]));
    let result=`M${items[0].x.toFixed(2)},${items[0].y.toFixed(2)}`;
    for(let index=0;index<items.length-1;index++) {const a=items[index],b=items[index+1],dx=(b.x-a.x)/3;result+=`C${(a.x+dx).toFixed(2)},${(a.y+tangents[index]*dx).toFixed(2)} ${(b.x-dx).toFixed(2)},${(b.y-tangents[index+1]*dx).toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;}
    return result;
  }).join('');
}
export function fills(points, bottom) {
  const groups=[]; let group=[];
  for(const point of points) {if(point.y===null){if(group.length)groups.push(group);group=[];}else group.push(point);}
  if(group.length)groups.push(group);
  return groups.filter(items=>items.length>1).map(items=>`${curve(items)}L${items.at(-1).x},${bottom}L${items[0].x},${bottom}Z`).join('');
}
