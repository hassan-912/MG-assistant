// Dev tool: read + parse every file in a folder, build the case and run the review (exactly what the app does).
// node tools/review-folder.mjs <folder> [--json]
import fs from 'node:fs';
import path from 'node:path';
import { readDocument, shutdown } from '../lib/reader.mjs';
import { parseDocument } from '../lib/parse.mjs';
import '../js/engine.js';
const V = globalThis.VFR;
const dir = process.argv[2];
const files = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
const out = [];
for (const f of files) {
  const name = path.basename(f);
  try {
    const r = await readDocument(name, fs.readFileSync(f));
    const d = parseDocument(name, r);
    out.push({ fileName: name, data: d });
    const keep = {};
    const walk = (o, p) => Object.keys(o).forEach((k) => { const v = o[k]; const key = p ? p + '.' + k : k; if (v === '' || v === null || v === false || v === 'unknown' || (Array.isArray(v) && !v.length) || k === 'summary') return; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key); else keep[key] = v; });
    walk(d, '');
    console.log('\n=== ' + name + ' → ' + d.docType + '\n' + JSON.stringify(keep));
  } catch (e) {
    console.log('\n=== ' + name + ' ERROR ' + e.stack);
  }
}
await shutdown();
let fx = null;
try { fx = (await (await fetch('https://open.er-api.com/v6/latest/EUR')).json()).rates; } catch {}
const c = V.builder.build(out, { submissionDate: process.env.REVIEW_DATE || new Date().toISOString().slice(0, 10), fx });
const rep = V.engine.run(c);
console.log('\n######## CASE: ' + c.program + ' → ' + c.meta.consulateOf + ' | ' + V.util.fullName(c.applicant) + ' | ' + c.passport.number + ' | trip ' + c.trip.entryDate + ' → ' + c.trip.exitDate);
console.log('VERDICT: ' + rep.verdict.label + ' ' + JSON.stringify(rep.counts) + ' score ' + rep.score);
rep.findings.forEach((x) => console.log(x.sev.padEnd(8) + ' ' + x.title + (x.detail ? '  —  ' + x.detail.slice(0, 170) : '')));
if (process.argv.includes('--json')) fs.writeFileSync('review-out.json', JSON.stringify({ case: c, report: rep }, null, 2));
