// Parse a Raphaela day-file (textutil txt) into sections of hymns.
// Output: { lordICall:[{tone,slot,label,text}], aposticha:[...], apostichaVerses:[...] }
const fs=require('fs');
const MONTHS='January February March April May June July August September October November December'.split(' ');
function parseDay(txt){
  const lines=txt.split('\n');
  // Title block = every non-empty line before the first section heading; these
  // recur as page headers throughout the file, so drop them wherever they appear.
  const titleLines=new Set();
  for(const l of lines){ const t=l.replace(/\u00a0/g,' ').trim(); if(!t) continue; if(/Lord I Call|^Apostikha|^Troparion|^Kontakion/i.test(t)) break; titleLines.add(t); }
  const sections={}; let expectPodoben=false, sec=null, cur=[], meta={tone:null,slot:null,label:null,podoben:null}, pendingVerse=null;
  const secOf=l=>{
    const t=l.trim();
    if(/^[“"]?Lord I Call/i.test(t)) return 'lordICall';
    if(/^Apostikha\b/i.test(t) && !/Matins/i.test(t)) return 'aposticha';
    if(/^Matins Apostikha/i.test(t)) return 'matinsAposticha';
    if(/^(Troparion|Kontakion|Sessional Hymn|Hymn of Light|The Praises|Litya|Prokeimenon|Canticle Nine|Magnification|Ikos|Canon|Ode|Katavasia|Exapostilarion)/i.test(t)) return 'other';
    if(/^\(After the (first|second|third) reading/i.test(t)) return 'other';
    return null;
  };
  const flush=()=>{ const text=cur.join('\n').replace(/\n{2,}/g,'\n').trim(); if(text && sec && sec!=='other' && !(cur.length<=1 && text.split(' ').length<8)){ (sections[sec]??=[]).push({...meta,text,verse:pendingVerse}); pendingVerse=null; } cur=[]; };
  for(let raw of lines){
    let l=raw.replace(/ /g,' ').replace(/\s+$/,'');
    if(/To the special melody/i.test(l)){ expectPodoben=true; l=l.replace(/\s*To the special melody.*$/i,''); if(!l.trim()) continue; }
    const t=l.trim();
    if(titleLines.has(t)) { flush(); continue; }
    // page headers / continuations
    if(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}[:\s]/.test(t)) { flush(); continue; }
    if(expectPodoben && !/^(Tone|Same tone|In the same tone|Glory|Now and ever)/i.test(t)){ expectPodoben=false; if(t && !/^(Glory|Now|Verse|Tone|Same)/.test(t) && t.split(' ').length<=7){ flush(); meta.podoben=t.replace(/[“”"]/g,''); continue; } }
    const ns=secOf(t);
    if(ns){ flush(); sec=ns; meta={tone:null,slot:null,label:null,podoben:null}; 
      const tm=t.match(/Tone (\d)/); if(tm) meta.tone=+tm[1]; continue; }
    if(!sec) continue;
    const hdr=t.match(/^(Tone (\d)\b.*|Same tone.*|Glory\.\.\..*|Now and ever\.\.\..*|Glory\.\.\. ?Now and ever\.\.\..*|In the same tone.*|Both now.*)$/i);
    if(hdr){ flush();
      const tm=t.match(/Tone (\d)/i); if(tm) meta.tone=+tm[1];
      if(/^Glory\.\.\. ?Now and ever/i.test(t)) meta.slot='gloryNow'; else if(/^Glory/i.test(t)) meta.slot='glory'; else if(/^Now and ever|^Both now/i.test(t)) meta.slot='now'; else meta.slot=null;
      const lab=t.match(/\(([^)]*)\)/); meta.label=lab?lab[1]:(meta.label);
      continue; }
    const v=t.match(/^Verse:\s*(.*)$/i); if(v){ flush(); pendingVerse=v[1].trim(); continue; }
    if(t==='') { flush(); continue; }
    if(/^page (two|three|four|\d)/i.test(t)) continue;
    cur.push(l.trim());
  }
  flush();
  return sections;
}
module.exports={parseDay,MONTHS};
if(require.main===module){
  const f=process.argv[2]; const s=parseDay(fs.readFileSync(f,'utf8'));
  for(const [k,v] of Object.entries(s)){ console.log('##',k,v.length); v.forEach((h,i)=>console.log(' ',i,'T'+h.tone,h.slot||'-',h.label?'('+h.label+')':'',h.podoben?'['+h.podoben+']':'','|',h.text.split('\n')[0].slice(0,60))); }
}
