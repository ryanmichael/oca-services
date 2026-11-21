const fs=require("fs"),path=require("path");const dir=process.argv[2];
const files=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort();
const W=t=>(t||"").split(/\s+/).filter(Boolean).length;
const S=files.map(f=>{const j=JSON.parse(fs.readFileSync(path.join(dir,f)));return {d:f.slice(0,10),name:j.serviceName,b:(j.blocks||[]).map(x=>({t:(x.text||"").trim(),s:x.section,sp:x.speaker,type:x.type}))}});
const n=S.length,cnt=new Map(),toneOf=new Map();for(const s of S){const j=JSON.parse(fs.readFileSync(path.join(dir,s.d+".json")));for(const t of new Set(s.b.map(x=>x.t))){cnt.set(t,(cnt.get(t)||0)+1);if(!toneOf.has(t))toneOf.set(t,new Set());toneOf.get(t).add(j.tone)}}
const core=t=>cnt.get(t)>=0.8*n;const tone=t=>!core(t)&&cnt.get(t)>=2&&toneOf.get(t).size===1;
const ordinary=S.filter(s=>{const req=[...cnt].filter(([t,c])=>c>=0.8*n).map(([t])=>t);const p=new Set(s.b.map(x=>x.t));return req.every(t=>p.has(t))});
console.log("ordinary sundays",ordinary.length);
const slotFreq={};
for(const s of ordinary){const runs=[];let cur=null;for(const x of s.b){if(core(x.t)||!x.t){cur=null;continue}const kind=tone(x.t)?"tone":/Reading/.test(x.s)?"read":"week";if(!cur){cur={secs:new Set(),kinds:new Set(),w:0,sp:new Set()};runs.push(cur)}cur.secs.add(x.s);cur.kinds.add(kind);cur.w+=W(x.t);cur.sp.add(x.sp)}
 const sig=runs.map(r=>[...r.secs].join("+")+"["+[...r.kinds].join("/")+"|"+[...r.sp].join("/")+"]:"+r.w);
 for(const r of runs){const k=[...r.secs].join("+");slotFreq[k]=(slotFreq[k]||0)+1}
 if(["2027-01-24","2027-07-18","2027-08-15","2027-10-10"].includes(s.d))console.log(s.d,runs.length,"runs\n  "+sig.join("\n  "));}
console.log(Object.entries(slotFreq).sort((a,b)=>b[1]-a[1]).map(e=>e[1]+"  "+e[0]).join("\n"));
