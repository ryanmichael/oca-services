const fs=require("fs"),path=require("path");const dir=process.argv[2];
const files=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort();
const W=t=>(t||"").split(/\s+/).filter(Boolean).length;
const S=files.map(f=>{const j=JSON.parse(fs.readFileSync(path.join(dir,f)));return {d:f.slice(0,10),name:j.serviceName,season:j.season,label:j.liturgicalLabel,tone:j.tone,b:(j.blocks||[]).map(x=>({t:(x.text||"").trim(),s:x.section,den:x.density,type:x.type}))}});
const n=S.length,cnt=new Map();for(const s of S)for(const t of new Set(s.b.map(x=>x.t)))cnt.set(t,(cnt.get(t)||0)+1);
const core=new Set([...cnt].filter(([t,c])=>c>=0.8*n).map(([t])=>t));
// tone-cycle: text appears on >=2 sundays, all of which share a tone, not core
const toneOf=new Map();for(const s of S)for(const t of new Set(s.b.map(x=>x.t))){if(!toneOf.has(t))toneOf.set(t,new Set());toneOf.get(t).add(s.tone)}
const isTone=t=>!core.has(t)&&cnt.get(t)>=2&&toneOf.get(t).size===1;
let coreW=0;const coreSec={},coreDen={};{const s=S.find(x=>x.d==="2027-01-24");for(const x of s.b)if(core.has(x.t)){coreW+=W(x.t);coreSec[x.s]=(coreSec[x.s]||0)+W(x.t);coreDen[x.den||"body"]=(coreDen[x.den||"body"]||0)+W(x.t)}}
console.log("Sundays",n,"core words (from 01-24)",coreW,"by density",JSON.stringify(coreDen));
console.log("core top sections:",Object.entries(coreSec).sort((a,b)=>b[1]-a[1]).slice(0,22).map(e=>e[0]+" "+e[1]).join(" | "));
const rows=[];for(const s of S){let tot=0,tone=0,read=0,uniq=0,missing=0;const us={};const present=new Set(s.b.map(x=>x.t));
for(const x of s.b){const w=W(x.t);tot+=w;if(core.has(x.t))continue;if(isTone(x.t)){tone+=w;continue}if(/Reading/.test(x.s)){read+=w;continue}uniq+=w;us[x.s]=(us[x.s]||0)+w}
for(const t of core)if(!present.has(t))missing+=W(t);
rows.push({...s,tot,tone,read,uniq,missing,us});}
for(const r of rows)console.log(r.d,"T"+r.tone,(r.season||"").padEnd(14),(r.label||"").slice(0,34).padEnd(34),"tot",r.tot,"tone",r.tone,"read",r.read,"uniq",r.uniq,"coreMissing",r.missing,/Basil/.test(r.name)?"BASIL":"", r.uniq>400?Object.entries(r.us).sort((a,b)=>b[1]-a[1]).slice(0,4).map(e=>e[0]+":"+e[1]).join(","):"");
