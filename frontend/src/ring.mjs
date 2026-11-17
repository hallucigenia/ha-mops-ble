// Fitted to this exact PNG's inner and outer diffuser edges. Coordinates use
// native image pixels, including its actual 1254px canvas rather than 1280px.
// 180 radial edge samples per contour; conic-fit RMS is below 0.64 source px.
export const ringGeometry = Object.freeze({
  imageSize:1254,
  imageSha256:'6ce862df8887baffc0da4285d7b724f6bbe406c1d717fba9cf875c181b411aa6',
  inner:{cx:623.2082,cy:496.0677,rx:168.5239,ry:109.9168,angle:-.54342},
  outer:{cx:623.7654,cy:498.9396,rx:209.2648,ry:133.5352,angle:-1.28259},
});
function contour(fraction) {
  const {inner,outer}=ringGeometry;
  return Object.fromEntries(Object.keys(inner).map(key=>[key,inner[key]+(outer[key]-inner[key])*fraction]));
}
function ellipsePath({cx,cy,rx,ry,angle}) {
  const theta=angle*Math.PI/180,dx=rx*Math.cos(theta),dy=rx*Math.sin(theta);
  const n=value=>value.toFixed(4);
  return `M${n(cx+dx)},${n(cy+dy)}A${n(rx)},${n(ry)} ${n(angle)} 1 0 ${n(cx-dx)},${n(cy-dy)}A${n(rx)},${n(ry)} ${n(angle)} 1 0 ${n(cx+dx)},${n(cy+dy)}Z`;
}
function band(outer=1,inner=0){return ellipsePath(contour(outer))+ellipsePath(contour(inner));}

const periods=Object.freeze({sage:8,ochre:6,clay:4});
export function createRingBreathing(element) {
  let frame=0,animation=null,targetRate=null;
  function update(tone) {
    const period=periods[tone]??null;
    element.dataset.period=period===null?'':String(period);
    const next=element.getAnimations().find(item=>item.animationName==='ring-breathe');
    if(period===null||!next) {
      cancelAnimationFrame(frame);frame=0;animation=next;targetRate=null;
      return period;
    }
    // Keep one 8s CSS cycle and change its playback rate: changing CSS duration
    // would recalculate the phase and can visibly jump at a concentration change.
    const rate=8/period;
    if(next===animation&&rate===targetRate)return period;
    cancelAnimationFrame(frame);frame=0;
    const replaced=next!==animation;
    animation=next;targetRate=rate;
    if(replaced||Math.abs(next.playbackRate-rate)<.0001){next.updatePlaybackRate(rate);return period;}
    const from=next.playbackRate,start=performance.now();
    function step(now) {
      const progress=Math.min(1,(now-start)/1200),ease=progress*progress*(3-2*progress);
      next.updatePlaybackRate(from+(rate-from)*ease);
      frame=progress<1?requestAnimationFrame(step):0;
    }
    frame=requestAnimationFrame(step);
    return period;
  }
  update.stop=()=>{cancelAnimationFrame(frame);frame=0;};
  return update;
}
export function ringMarkup() {
  return `<svg class="ring-overlay" viewBox="0 0 ${ringGeometry.imageSize} ${ringGeometry.imageSize}" aria-hidden="true">
    <defs>
      <clipPath id="mops-diffuser-boundary"><path d="${band(.985,.025)}" fill="white" clip-rule="evenodd"/></clipPath>
      <filter id="mops-lens-soften" x="-10%" y="-15%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="mops-lens-bloom" x="-12%" y="-18%" width="124%" height="136%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5.5"/></filter>
      <linearGradient id="mops-lens-emission" gradientUnits="userSpaceOnUse" x1="623" y1="365" x2="623" y2="634"><stop offset="0" stop-color="currentColor" stop-opacity=".72"/><stop offset=".46" stop-color="currentColor" stop-opacity="1"/><stop offset="1" stop-color="currentColor" stop-opacity=".84"/></linearGradient>
    </defs>
    <g class="ring-power">
      <path class="ring-tint" d="${band(.98,.03)}" fill-rule="evenodd"/>
      <g class="ring-breath">
        <path class="ring-bloom" d="${band(.93,.10)}" fill-rule="evenodd" filter="url(#mops-lens-bloom)"/>
        <g clip-path="url(#mops-diffuser-boundary)">
          <path class="ring-light" d="${band(.86,.15)}" fill-rule="evenodd" filter="url(#mops-lens-soften)"/>
          <path class="ring-core" d="${band(.68,.36)}" fill-rule="evenodd" filter="url(#mops-lens-soften)"/>
        </g>
      </g>
      <path class="ring-flash" d="${band(.94,.08)}" fill-rule="evenodd" clip-path="url(#mops-diffuser-boundary)" filter="url(#mops-lens-soften)"/>
    </g>
  </svg>`;
}
