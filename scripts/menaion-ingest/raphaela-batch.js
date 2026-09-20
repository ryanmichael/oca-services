const fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const {parseDay,MONTHS}=require('./raphaela-parse.js');
const {alignComm}=require('./raphaela-align.js');
const REPO=process.env.REPO; const S=__dirname;
const {transform}=require(path.join(REPO,'scripts/yy-to-tt.js'));
const {applyYouYour}=require(path.join(REPO,'server-lib/assemble/pronouns.js'));
const db=new DatabaseSync(path.join(REPO,'storage/oca.db'),{readOnly:true});
const comms=db.prepare(`SELECT DISTINCT c.id, c.month, c.day, c.title FROM stichera s JOIN commemorations c ON c.id=s.commemoration_id WHERE s.source='stSergius' ORDER BY c.month,c.day,c.id`).all();
const norm=s=>s.replace(/\s+/g,' ').trim();
const q=s=>"'"+s.replace(/'/g,"''")+"'";
let skipped=[], sql='BEGIN;\n', prov=[], report=[], stats={comms:comms.length,secOk:0,secHold:0,rowsReplaced:0,noFile:0,rt:0};
for(const c of comms){
  const f=path.join(S,'choirsite/txt',`${MONTHS[c.month-1]} ${String(c.day).padStart(2,'0')}.txt`);
  if(!fs.existsSync(f)){ stats.noFile++; report.push({cid:c.id,date:`${c.month}-${c.day}`,title:c.title,section:'*',status:'no-file'}); continue; }
  const corpus=parseDay(fs.readFileSync(f,'utf8'));
  for(const r of alignComm(db,c.id,corpus)){
    const st=r.rows.filter(x=>x.source==='stSergius');
    if(!st.length) continue;
    const rec={cid:c.id,date:`${c.month}-${c.day}`,title:c.title.slice(0,50),section:r.section,status:r.status,reason:r.reason,n:st.length,
      rows:r.rows.map(x=>`${x.id} o${x.ord} T${x.tone} ${x.best}/${x.second} ${x.why||'ok'}`)};
    report.push(rec);
    const good=st.filter(x=>x.match); if(!good.length){ stats.secHold++; continue; }
    if(good.length===st.length) stats.secOk++; else { stats.secPartial=(stats.secPartial||0)+1; rec.partial=`${good.length}/${st.length}`; }
    for(const x of good){
      const tt=transform(x.match.text);
      const back=applyYouYour(tt); if(norm(back)!==norm(x.match.text)) { stats.rt++; rec.roundtrip=(rec.roundtrip||0)+1; skipped.push({id:x.id,date:rec.date,modern:x.match.text,stored_tt:tt,back}); continue; }
      sql+=`UPDATE stichera SET text=${q(tt)}, tone=${x.match.tone??'tone'}, source='raphaela' WHERE id=${x.id} AND source='stSergius';\n`;
      prov.push({id:x.id,cid:c.id,date:rec.date,section:r.section,order:x.ord,tone:x.match.tone,label:x.match.label,podoben:x.match.podoben,modern:x.match.text,stored_tt:tt,roundtrip_exact:norm(back)===norm(x.match.text)});
      stats.rowsReplaced++;
    }
  }
}
sql+='COMMIT;\n';
fs.writeFileSync(S+'/import-raphaela-batch.sql',sql);
fs.writeFileSync(S+'/raphaela-batch-prov.json',JSON.stringify(prov,null,1));
fs.writeFileSync(S+'/raphaela-batch-skipped.json',JSON.stringify(skipped,null,1));
fs.writeFileSync(S+'/raphaela-batch-report.json',JSON.stringify(report,null,1));
console.log(stats);
