const fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const {parseDay,MONTHS}=require('./raphaela-parse.js');
const S=__dirname;
const DB=process.env.DB||path.join(process.env.REPO,'storage/oca.db');
const STOP=new Set('that with thou thee thine your yours have hath hast from unto they them their this what were wast when which whom into upon shall will been being also ever most more than thus then there where these those didst doth dost art thyself yourself himself herself itself through therefore whose while about after before against among because such very only same both'.split(' '));
const toks=s=>new Set(s.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w)).map(w=>w.replace(/(eth|est|ed|ing|s)$/,'')));
const jacc=(a,b)=>{let i=0;for(const x of a) if(b.has(x)) i++; return i/(a.size+b.size-i||1);};
function slotOf(h){ return h.slot==='glory'?0 : h.slot==='now'?-1 : h.slot==='gloryNow'?0 : null; }
function alignComm(db, cid, corpus, thresh=0.30, margin=0.10){
  const rows=db.prepare(`SELECT id, section, "order" AS ord, tone, label, text, source FROM stichera WHERE commemoration_id=? ORDER BY section, "order"`).all(cid);
  const out=[];
  for(const sec of ['lordICall','aposticha']){
    const dbRows=rows.filter(r=>r.section===sec);
    if(!dbRows.length) continue;
    const cands=(corpus[sec]||[]).map((h,i)=>({...h,idx:i,tk:toks(h.text)}));
    const res={section:sec, rows:[], status:'ok', reason:null};
    if(!cands.length){ res.status='hold'; res.reason='corpus has no '+sec; out.push(res); continue; }
    const used=new Set();
    for(const r of dbRows){
      const tk=toks(r.text);
      const scored=cands.map(c=>({c,s:jacc(tk,c.tk)})).sort((a,b)=>b.s-a.s);
      const best=scored[0], second=scored[1];
      const rec={id:r.id, ord:r.ord, tone:r.tone, source:r.source, dbHead:r.text.split('\n')[0].slice(0,50), best:best.s.toFixed(2), second:second?second.s.toFixed(2):'-', match:null, why:null};
      if(r.source!=='stSergius'){ rec.why='not stSergius'; res.rows.push(rec); continue; }
      if(best.s<thresh){ rec.why='low'; res.status='hold'; res.reason??='low-similarity row'; res.rows.push(rec); continue; }
      if(second && best.s-second.s<margin){ rec.why='ambiguous'; res.status='hold'; res.reason??='ambiguous row'; res.rows.push(rec); continue; }
      if(used.has(best.c.idx)){ rec.why='dup-target'; res.status='hold'; res.reason??='two rows map to one hymn'; res.rows.push(rec); continue; }
      if(r.tone!=null && best.c.tone!=null && r.tone!==best.c.tone){ rec.why='tone '+r.tone+'≠'+best.c.tone; res.status='hold'; res.reason??='tone mismatch'; res.rows.push(rec); continue; }
      const cs=slotOf(best.c); const ds=r.ord<=0?r.ord:null;
      if((cs===0||cs===-1||ds!==null) && cs!==ds){ rec.why='slot '+ds+'≠'+cs; res.status='hold'; res.reason??='glory/now slot mismatch'; res.rows.push(rec); continue; }
      used.add(best.c.idx); rec.match=best.c; res.rows.push(rec);
    }
    out.push(res);
  }
  return out;
}
module.exports={alignComm,toks,jacc};
if(require.main===module){
  const db=new DatabaseSync(DB,{readOnly:true});
  const cid=+process.argv[2], file=process.argv[3];
  const corpus=parseDay(fs.readFileSync(file,'utf8'));
  for(const r of alignComm(db,cid,corpus)){ console.log('##',r.section,r.status,r.reason||''); for(const x of r.rows) console.log('  ',x.id,'o'+x.ord,'T'+x.tone,x.best,x.second,x.why||'→ '+(x.match?x.match.text.split('\n')[0].slice(0,45):''),'|',x.dbHead); }
}
