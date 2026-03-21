#!/usr/bin/env node
/**
 * Extract text from OCA feast service text .docx files.
 *
 * Prerequisites: Download the docx files first:
 *   curl -sL "https://files.oca.org/service-texts/2025-0806-texts-tt.docx" -o /tmp/transfig-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2025-0914-texts-tt.docx" -o /tmp/cross-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2026-0202-texts-tt.docx" -o /tmp/meeting-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2025-0815-texts-tt.docx" -o /tmp/dormition-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2026-0325-texts-vesplit-tt.docx" -o /tmp/annunciation-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2025-0908-texts-tt.docx" -o /tmp/nattheot-tt.docx
 *   curl -sL "https://files.oca.org/service-texts/2025-1121-texts-tt.docx" -o /tmp/entry-tt.docx
 *
 * Usage: node extract-feast-texts.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = {
  'transfig': '/tmp/transfig-tt.docx',
  'cross': '/tmp/cross-tt.docx',
  'meeting': '/tmp/meeting-tt.docx',
  'dormition': '/tmp/dormition-tt.docx',
  'annunciation': '/tmp/annunciation-tt.docx',
  'nattheot': '/tmp/nattheot-tt.docx',
  'entry': '/tmp/entry-tt.docx'
};

for (const [name, docxPath] of Object.entries(files)) {
  if (!fs.existsSync(docxPath)) {
    console.log(`${name}: NOT FOUND at ${docxPath}`);
    continue;
  }

  const dir = `/tmp/${name}-ex`;
  try {
    execSync(`mkdir -p ${dir} && unzip -o ${docxPath} word/document.xml -d ${dir}`, { stdio: 'pipe' });
  } catch (e) {
    console.log(`${name}: unzip error - ${e.message}`);
    continue;
  }

  const xml = fs.readFileSync(`${dir}/word/document.xml`, 'utf8');
  const paras = xml.split('</w:p>');
  const lines = paras.map(p => {
    const texts = [];
    const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(p)) !== null) texts.push(m[1]);
    return texts.join('');
  }).filter(l => l.trim());

  const outPath = `/tmp/${name}.txt`;
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`${name}: ${lines.length} lines -> ${outPath}`);
}

console.log('\nDone. Text files written to /tmp/. Review them for antiphon, megalynarion, entrance hymn, and communion hymn texts.');
