// Dev tool: print what the local reader gets from each file.  node tools/probe.mjs <file|dir> [--full]
import fs from 'node:fs';
import path from 'node:path';
import { readDocument, shutdown } from '../lib/reader.mjs';
const target = process.argv[2];
const full = process.argv.includes('--full');
const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target, { recursive: true }).map((f) => path.join(target, f)).filter((f) => fs.statSync(f).isFile()) : [target];
for (const f of files) {
  const t0 = Date.now();
  try {
    const r = await readDocument(path.basename(f), fs.readFileSync(f));
    console.log('\n######## ' + path.basename(f) + ' | ' + r.kind + ' pages=' + r.pages + ' ocr=' + r.ocrPages + ' conf=' + Math.round(r.confidence) + ' fields=' + Object.keys(r.fields).length + ' ' + (Date.now() - t0) + 'ms');
    console.log(full ? r.text : r.text.slice(0, 1500));
    if (Object.keys(r.fields).length) console.log('FIELDS:', JSON.stringify(r.fields).slice(0, 3000));
    if (r.mrzText) console.log('MRZ PASS:\n' + r.mrzText);
  } catch (e) {
    console.log('\n######## ' + path.basename(f) + ' ERROR ' + e.message);
  }
}
await shutdown();
