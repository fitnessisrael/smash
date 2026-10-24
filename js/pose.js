// smash — pose model (MoveNet Lightning on tfjs). Requires global `tf`. Shared by the hand-play page.
let MODEL = null;
function half2float(u16){
  const out = new Float32Array(u16.length);
  for(let i=0;i<u16.length;i++){
    const h=u16[i], s=(h&0x8000)?-1:1, e=(h>>10)&31, f=h&1023;
    out[i] = e===0 ? s*Math.pow(2,-14)*(f/1024) : e===31 ? (f?NaN:s*Infinity) : s*Math.pow(2,e-15)*(1+f/1024);
  }
  return out;
}
export async function loadModel(onp){
  if(MODEL) return MODEL;
  if(!window.tf) throw new Error("tf");
  try{ await tf.setBackend("webgl"); }catch(e){ await tf.setBackend("cpu"); }
  await tf.ready();
  onp && onp(0.05,"טוען את מנוע הראייה…");
  const meta = await (await fetch("model/model.json")).json();
  const buf = await (await fetch("model/weights.bin")).arrayBuffer();
  const W = half2float(new Uint16Array(buf));
  const T = ([o,sh]) => tf.tensor(W.subarray(o, o+sh.reduce((a,b)=>a*b,1)), sh);
  const layers = meta.layers.map(L => L.t==="conv" ? Object.assign({}, L, {wt:T(L.w), bt:T(L.b)}) : L);
  const cw = W.subarray(meta.center_w[0], meta.center_w[0]+2304);
  MODEL = {meta, layers, cw};
  // warm-up
  const z = tf.zeros([1,192,192,3]); const r = forward(z); r.forEach(t=>t.dispose()); z.dispose();
  return MODEL;
}
function forward(x){
  const {layers, meta} = MODEL;
  return tf.tidy(()=>{
    const env = {x};
    for(const L of layers){
      if(L.t==="conv"){
        let inp = env[L.i]; const [t,l,b,r] = L.p;
        if(t||l||b||r) inp = tf.pad(inp, [[0,0],[t,b],[l,r],[0,0]]);
        const args = {x:inp, filter:L.wt, strides:L.s, pad:"valid", bias:L.bt, activation:L.a||"linear"};
        env[L.o] = L.dw ? tf.fused.depthwiseConv2d(args) : tf.fused.conv2d(args);
      } else if(L.t==="add") env[L.o] = tf.add(env[L.i], env[L.j]);
      else if(L.t==="resize") env[L.o] = tf.image.resizeBilinear(env[L.i], L.hw, false, true);
      else if(L.t==="concat") env[L.o] = tf.concat(L.ins.map(n=>env[n]), 3);
      else if(L.t==="relu6") env[L.o] = tf.clipByValue(env[L.i],0,6);
      else if(L.t==="relu") env[L.o] = tf.relu(env[L.i]);
    }
    const h = meta.heads;
    return [env[h.heat], env[h.center], env[h.reg], env[h.off]];
  });
}
const sig = v => 1/(1+Math.exp(-v));
export async function poseFromCanvas(cv){
  const {meta, cw} = MODEL;
  const x = tf.tidy(()=> tf.browser.fromPixels(cv).toFloat().mul(meta.pre.scale[0]).sub(meta.pre.sub).expandDims(0));
  const outs = forward(x); x.dispose();
  const [heat, cen, reg, off] = await Promise.all(outs.map(t=>t.data()));
  outs.forEach(t=>t.dispose());
  // MoveNet post-processing (center pick -> regressed keypoints -> local heatmap peak -> offset)
  let best=-1, ci=0;
  for(let i=0;i<2304;i++){ const v = sig(cen[i])*cw[i]; if(v>best){best=v;ci=i;} }
  const cy=Math.floor(ci/48), cx=ci%48, eps=meta.post.eps, kps=[];
  for(let k=0;k<17;k++){
    const ry = cy + reg[ci*34+2*k], rx = cx + reg[ci*34+2*k+1];
    let bs=-1, bi=0;
    for(let i=0;i<2304;i++){
      const yy=Math.floor(i/48), xx=i%48;
      const s = sig(heat[i*17+k]) / (Math.hypot(yy-ry, xx-rx) + eps);
      if(s>bs){bs=s;bi=i;}
    }
    const y=Math.floor(bi/48), xq=bi%48;
    kps.push({y:(y+off[bi*34+2*k])/48, x:(xq+off[bi*34+2*k+1])/48, s:sig(heat[bi*17+k])});
  }
  return kps;
}
