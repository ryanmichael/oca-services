#!/usr/bin/env node
// Myrrh-bearers Octoechos HTML parser (Phase 1/2). Parses a tone page
// (octoechos/english-N.htm) into services -> sections -> hymns.
// Structure: <h2>=service, <h4>=section label, <p>=stichos or hymn text.

const fs = require('fs');

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8230;|&hellip;/g, '…').replace(/&#8212;|&mdash;/g, '—')
    .replace(/&ldquo;|&#8220;/g, '“').replace(/&rdquo;|&#8221;/g, '”')
    .replace(/\s+/g, ' ').trim();
}

// split the body into a flat token stream of {tag, text}
function tokenize(html) {
  const body = html.slice(html.indexOf('<h1'));
  const toks = [];
  const re = /<(h[1-4]|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    let tag = m[1].toLowerCase();
    const inner = m[2].trim();
    const isStichos = /^<i>\s*(stichos|verse|refrain)\b/i.test(inner);
    // Some section labels are marked as a wholly-italic paragraph
    // (<p><i>Antiphon II</i></p>) rather than an <h4>. Narrowly retag those as
    // headers so they open a new section. Kept specific (Antiphon labels) to
    // avoid catching wholly-italic hymn/canon content.
    const wholeItalic = /^<i>[\s\S]*<\/i>$/.test(inner);
    const text = stripTags(m[2]);
    if (tag === 'p' && wholeItalic && /^Antiphon\s+[IVX]+\b/i.test(text)) tag = 'h4';
    toks.push({ tag, stichos: isStichos, text });
  }
  return toks;
}

function parseTone(file) {
  const toks = tokenize(fs.readFileSync(file, 'utf8'));
  const services = [];
  let svc = null, sec = null;
  for (const t of toks) {
    if (t.tag === 'h2') { svc = { service: t.text, sections: [] }; services.push(svc); sec = null; }
    else if (t.tag === 'h3' || t.tag === 'h4') {
      if (!svc) { svc = { service: '(top)', sections: [] }; services.push(svc); }
      sec = { label: t.text, hymns: [], stichoi: [] };
      svc.sections.push(sec);
    } else if (t.tag === 'p' && sec) {
      if (t.stichos) sec.stichoi.push(t.text);
      else if (t.text) sec.hymns.push(t.text);
    }
  }
  return services;
}

module.exports = { parseTone, stripTags };

if (require.main === module) {
  const services = parseTone(process.argv[2]);
  for (const s of services) {
    console.log('\n## ' + s.service);
    for (const sec of s.sections)
      console.log(`  [${sec.hymns.length} hymns] ${sec.label.slice(0, 60)}`);
  }
}
