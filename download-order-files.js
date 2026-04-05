#!/usr/bin/env node
/**
 * Download OCA Order of Services files for structurally distinct weeks in 2026.
 * Extracts text from DOCX and saves both .docx and .txt to reference/orders/
 *
 * Usage:
 *   node download-order-files.js            # download all
 *   node download-order-files.js --dry-run   # list URLs without downloading
 *   node download-order-files.js 0405        # download a single date (MMDD)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_URL = 'https://www.oca.org/PDF/Music/Rubrics';
const OUT_DIR = path.join(__dirname, 'reference', 'orders');

// Structurally distinct weeks for 2026 (Pascha = April 12)
const TARGETS = [
  // Pre-Lenten
  { date: '0201', label: 'Publican & Pharisee' },
  { date: '0208', label: 'Prodigal Son' },
  { date: '0215', label: 'Meatfare Sunday' },
  { date: '0222', label: 'Cheesefare / Forgiveness Sunday' },

  // Lenten Saturdays
  { date: '0228', label: '1st Saturday of Lent (St. Theodore)' },
  { date: '0307', label: '2nd Saturday - Soul Saturday' },
  { date: '0314', label: '3rd Saturday - Soul Saturday' },
  { date: '0321', label: '4th Saturday - Soul Saturday' },
  { date: '0328', label: '5th Saturday - Akathist' },
  { date: '0404', label: 'Lazarus Saturday' },

  // Lenten Sundays
  { date: '0301', label: 'Sunday of Orthodoxy (Lent 1)' },
  { date: '0308', label: 'St. Gregory Palamas (Lent 2)' },
  { date: '0315', label: 'Sunday of the Cross (Lent 3)' },
  { date: '0322', label: 'St. John Climacus (Lent 4)' },
  { date: '0329', label: 'St. Mary of Egypt (Lent 5)' },

  // Holy Week + Pascha
  { date: '0405', label: 'Palm Sunday' },
  { date: '0412', label: 'Pascha (may not exist)' },

  // Pentecostarion
  { date: '0419', label: 'Thomas Sunday' },
  { date: '0426', label: 'Sunday of the Myrrhbearers' },
  { date: '0503', label: 'Sunday of the Paralytic' },
  { date: '0510', label: 'Sunday of the Samaritan Woman' },
  { date: '0517', label: 'Sunday of the Blind Man' },
  { date: '0524', label: 'Fathers of Nicaea / after Ascension' },
  { date: '0531', label: 'Pentecost' },
  { date: '0607', label: 'All Saints' },

  // Ordinary Time (representative)
  { date: '0614', label: 'Ordinary Sunday (1st after All Saints)' },
  { date: '0719', label: 'Ordinary Sunday (mid-summer)' },
  { date: '0906', label: 'Ordinary Sunday (early fall)' },

  // Fixed Great Feasts (nearest Sunday or the day itself)
  { date: '0806', label: 'Transfiguration (Thursday)' },
  { date: '0809', label: 'Sunday after Transfiguration' },
  { date: '0815', label: 'Dormition (Saturday)' },
  { date: '0816', label: 'Sunday after Dormition' },
  { date: '0908', label: 'Nativity of Theotokos (Tuesday)' },
  { date: '0913', label: 'Sunday before Elevation' },
  { date: '0914', label: 'Elevation of the Cross (Monday)' },
  { date: '1121', label: 'Entry of Theotokos (Saturday)' },
  { date: '1122', label: 'Sunday after Entry' },
  { date: '1225', label: 'Nativity of Christ (Friday)' },
  { date: '1227', label: 'Sunday after Nativity' },
];

function download(url) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith('/')) loc = new URL(u).origin + loc;
          return follow(loc, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

function extractText(docxPath) {
  const tmpDir = path.join(OUT_DIR, '.tmp-extract');
  try {
    execSync(`mkdir -p "${tmpDir}" && unzip -o "${docxPath}" word/document.xml -d "${tmpDir}" 2>/dev/null`);
    const xml = fs.readFileSync(path.join(tmpDir, 'word', 'document.xml'), 'utf-8');
    // Strip XML tags, collapse whitespace
    return xml
      .replace(/<w:p[ >]/g, '\n<w:p ')  // paragraph breaks
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } finally {
    execSync(`rm -rf "${tmpDir}"`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const singleDate = args.find(a => /^\d{4}$/.test(a));

  const targets = singleDate
    ? TARGETS.filter(t => t.date === singleDate)
    : TARGETS;

  if (!targets.length) {
    console.error(`No target found for date ${singleDate}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let downloaded = 0, skipped = 0, failed = 0;

  for (const t of targets) {
    const filename = `2026-${t.date}-order-services`;
    const url = `${BASE_URL}/${filename}.docx`;
    const docxPath = path.join(OUT_DIR, `${filename}.docx`);
    const txtPath = path.join(OUT_DIR, `${filename}.txt`);

    if (dryRun) {
      console.log(`${t.date}  ${t.label.padEnd(45)} ${url}`);
      continue;
    }

    // Skip if already downloaded
    if (fs.existsSync(txtPath)) {
      console.log(`✓ ${t.date}  ${t.label} (already have)`);
      skipped++;
      continue;
    }

    try {
      const buf = await download(url);
      fs.writeFileSync(docxPath, buf);

      const text = extractText(docxPath);
      // Prepend label as header
      fs.writeFileSync(txtPath, `# ${t.label} — ${t.date.slice(0,2)}/${t.date.slice(2)}/2026\n\n${text}\n`);

      console.log(`✓ ${t.date}  ${t.label} (${buf.length} bytes)`);
      downloaded++;
    } catch (err) {
      console.log(`✗ ${t.date}  ${t.label} — ${err.message}`);
      failed++;
    }

    // Brief pause between requests
    await new Promise(r => setTimeout(r, 500));
  }

  if (!dryRun) {
    console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
    console.log(`Files in: ${OUT_DIR}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
