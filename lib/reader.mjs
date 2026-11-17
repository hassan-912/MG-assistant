// Local document reader — no API key, nothing leaves the computer (except the one-time OCR language download).
// PDF text layer via pdf.js; scanned pages and photos via Tesseract OCR.
// Besides the text it records WHERE every word sits on the page (layout), so findings can show a picture of the field.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
import { docxText } from './docx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '..', '.ocr-cache');
const MAX_PAGES = 12;
const OCR_SCALE = 2.5;
export const VIEW_SCALE = 2; // text-layer pages are rendered at this scale for snippets
const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const PDFJS_DIR = path.join(here, '..', 'node_modules', 'pdfjs-dist');
// fonts that are referenced but not embedded (common in Word-made forms) need pdf.js' own font files to be drawn
const pdfOpts = (buf) => ({
  data: new Uint8Array(buf), verbosity: 0, disableFontFace: true, useSystemFonts: false,
  standardFontDataUrl: path.join(PDFJS_DIR, 'standard_fonts') + path.sep, cMapUrl: path.join(PDFJS_DIR, 'cmaps') + path.sep, cMapPacked: true,
});

/* ---------------- OCR worker pool (lazy, reused) ---------------- */
const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length - 2));
const pool = []; // { p: Promise<worker>, busy: boolean }
const waiting = [];
function acquire() {
  const free = pool.find((w) => !w.busy);
  if (free) {
    free.busy = true;
    return Promise.resolve(free);
  }
  if (pool.length < POOL_SIZE) {
    fs.mkdirSync(CACHE, { recursive: true });
    const slot = { p: createWorker('eng', 1, { cachePath: CACHE, logger: () => {} }), busy: true };
    pool.push(slot);
    return Promise.resolve(slot);
  }
  return new Promise((res) => waiting.push(res));
}
function release(slot) {
  const next = waiting.shift();
  if (next) next(slot);
  else slot.busy = false;
}
/** Run one OCR job on a free worker (each Tesseract worker is single-threaded). */
async function withWorker(fn) {
  const slot = await acquire();
  try {
    return await fn(await slot.p);
  } finally {
    release(slot);
  }
}
/** OCR an image; returns text, confidence and word boxes (pixel coordinates of that image). */
export async function ocrImage(buf, opts = {}) {
  return withWorker(async (w) => {
    await w.setParameters({
      tessedit_pageseg_mode: opts.psm || PSM.AUTO,
      tessedit_char_whitelist: opts.whitelist || '',
      preserve_interword_spaces: '1',
    });
    const r = await w.recognize(buf, {}, { text: true, blocks: !opts.noWords });
    const words = [];
    (r.data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((wd) => {
      if (wd.text && wd.text.trim()) words.push({ t: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
    }))));
    return { text: r.data.text || '', confidence: r.data.confidence || 0, words };
  });
}

/* ---------------- PDF ---------------- */
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x: it.transform[4], s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n');
}
/** Word boxes of a text-layer page, in pixels of the page rendered at `scale`. */
function itemWords(items, viewport) {
  const out = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const tx = pdfjs.Util.transform(viewport.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]) || 10;
    const x = tx[4];
    const y = tx[5];
    const width = (it.width || it.str.length * fh * 0.5) * viewport.scale;
    const chars = it.str.length;
    let pos = 0;
    it.str.split(/(\s+)/).forEach((part) => {
      if (part.trim()) {
        const a = x + (pos / chars) * width;
        const b = x + ((pos + part.length) / chars) * width;
        out.push({ t: part, x0: a, y0: y - fh, x1: b, y1: y + fh * 0.25 });
      }
      pos += part.length;
    });
  }
  return sortWords(out);
}
function rectWords(value, rect, viewport) {
  const r = viewport.convertToViewportRectangle(rect);
  const x0 = Math.min(r[0], r[2]);
  const x1 = Math.max(r[0], r[2]);
  const y0 = Math.min(r[1], r[3]);
  const y1 = Math.max(r[1], r[3]);
  const lines = value.split(/\n/);
  const lh = (y1 - y0) / Math.max(1, lines.length);
  const out = [];
  lines.forEach((line, li) => {
    const toks = line.split(/\s+/).filter(Boolean);
    const total = line.length || 1;
    let pos = 0;
    toks.forEach((t) => {
      const start = line.indexOf(t, pos);
      pos = start + t.length;
      out.push({ t, x0: x0 + ((x1 - x0) * start) / total, x1: x0 + ((x1 - x0) * pos) / total, y0: y0 + li * lh, y1: y0 + (li + 1) * lh });
    });
  });
  return out;
}
const sortWords = (w) => w.sort((a, b) => (Math.abs(a.y0 - b.y0) < (a.y1 - a.y0) * 0.5 ? a.x0 - b.x0 : a.y0 - b.y0));

async function renderPage(page, scale) {
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}
/** Render one page of a PDF (used later when a snippet of a text-layer page is requested). */
export async function renderPdfPage(buf, pageNo, scale = VIEW_SCALE) {
  const doc = await pdfjs.getDocument(pdfOpts(buf)).promise;
  try {
    return await renderPage(await doc.getPage(pageNo), scale);
  } finally {
    doc.destroy();
  }
}
/** Crop the bottom part of an image (where a passport MRZ sits) for a focused OCR pass. */
function cropBottom(canvas, frac) {
  const h = Math.round(canvas.height * frac);
  const c = createCanvas(canvas.width, h);
  c.getContext('2d').drawImage(canvas, 0, canvas.height - h, canvas.width, h, 0, 0, canvas.width, h);
  return c;
}
async function readPdf(buf, progress) {
  const doc = await pdfjs.getDocument(pdfOpts(buf)).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  let ocrPages = 0;
  let conf = 0;
  const fields = {};
  const images = [];
  const annots = [];
  const pageTexts = [];
  const layoutPages = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const t = itemsToLines(tc.items);
    const ocr = t.replace(/\s/g, '').length < 80;
    const scale = ocr ? OCR_SCALE : VIEW_SCALE;
    const vp = page.getViewport({ scale });
    const lp = { page: i, w: Math.ceil(vp.width), h: Math.ceil(vp.height), scale, words: ocr ? [] : itemWords(tc.items, vp), img: null };
    layoutPages.push(lp);
    try {
      for (const a of await page.getAnnotations()) {
        let value = '';
        if (a.fieldName && a.fieldValue !== undefined && a.fieldValue !== null && a.fieldValue !== 'Off') {
          value = Array.isArray(a.fieldValue) ? a.fieldValue.join(', ') : String(a.fieldValue);
          if (value.trim()) fields[a.fieldName] = value;
        } else if (a.subtype === 'FreeText' || a.subtype === 'Text') value = (a.contentsObj && a.contentsObj.str) || '';
        if (!value || !value.trim() || !a.rect) continue;
        annots.push({ page: i, value: value.trim(), name: a.fieldName || '', context: labelContext(tc.items, a.rect) });
        lp.words.push(...rectWords(value.trim(), a.rect, vp));
      }
    } catch { /* no annotations */ }
    if (ocr) {
      if (progress) progress('OCR page ' + i + '/' + pages);
      const canvas = await renderPage(page, OCR_SCALE);
      images.push(canvas);
      lp.img = await canvas.encode('jpeg', 82);
      // OCR runs in the worker pool; pages of one document are recognised in parallel
      pageTexts.push(ocrImage(await canvas.encode('png')).then((r) => {
        conf += r.confidence;
        ocrPages++;
        lp.words.push(...r.words);
        sortWords(lp.words);
        return (t ? t + '\n' : '') + r.text;
      }));
    } else pageTexts.push(Promise.resolve(t));
  }
  const text = (await Promise.all(pageTexts)).join('\n\f\n') + '\n';
  const numPages = doc.numPages;
  doc.destroy();
  return { text, pages: numPages, ocrPages, confidence: ocrPages ? conf / ocrPages : 100, fields, annots, images, layout: { kind: 'pdf', pages: layoutPages } };
}
/** Text printed just above / left of a filled-in box — i.e. the form label the value belongs to. */
function labelContext(items, rect) {
  const [x1, y1, , y2] = rect;
  const cands = [];
  for (const it of items) {
    const s = it.str && it.str.trim();
    if (!s) continue;
    const ix = it.transform[4];
    const iy = it.transform[5];
    if (iy < y1 - 4 || iy > y2 + 60) continue; // label sits on the same line or up to ~4 lines above
    if (ix > x1 + 40 || ix + (it.width || 0) < x1 - 220) continue;
    const dist = Math.max(0, iy - y2) + Math.abs(ix - x1) * 0.15;
    cands.push({ s, dist, iy, ix });
  }
  cands.sort((a, b) => a.dist - b.dist);
  return cands.slice(0, 6).sort((a, b) => b.iy - a.iy || a.ix - b.ix).map((c) => c.s).join(' ');
}

/* ---------------- MRZ focused pass ---------------- */
export async function ocrMrz(canvasOrBuf) {
  let canvas = canvasOrBuf;
  if (Buffer.isBuffer(canvasOrBuf)) {
    const img = await loadImage(canvasOrBuf);
    canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);
  }
  const out = [];
  for (const frac of [0.3, 0.5]) {
    const crop = cropBottom(canvas, frac);
    const r = await ocrImage(await crop.encode('png'), { psm: PSM.SINGLE_BLOCK, whitelist: MRZ_CHARS, noWords: true });
    out.push(r.text);
  }
  return out.join('\n');
}

/* ---------------- entry point ---------------- */
/** @returns {Promise<{text, kind, pages, ocrPages, confidence, fields, annots, mrzText, layout}>} */
export async function readDocument(fileName, buf, opts = {}) {
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || buf.subarray(0, 5).toString() === '%PDF-';
  if (isPdf) {
    const r = await readPdf(buf, opts.progress);
    let mrzText = '';
    if (opts.wantMrz !== false && r.images.length && /P<|PASSPORT|<<</i.test(r.text)) {
      for (const img of r.images.slice(0, 2)) mrzText += (await ocrMrz(img)) + '\n';
    }
    delete r.images;
    return Object.assign(r, { kind: 'pdf', mrzText });
  }
  if (/\.(png|jpe?g|webp|bmp|gif)$/.test(lower)) {
    const img = await loadImage(buf);
    const r = await ocrImage(buf);
    let mrzText = '';
    if (opts.wantMrz !== false && /P<|PASSPORT|<<</i.test(r.text)) mrzText = await ocrMrz(buf);
    const layout = { kind: 'image', pages: [{ page: 1, w: img.width, h: img.height, scale: 1, words: sortWords(r.words), img: buf }] };
    return { text: r.text, kind: 'image', pages: 1, ocrPages: 1, confidence: r.confidence, fields: {}, annots: [], mrzText, layout };
  }
  if (lower.endsWith('.docx') || lower.endsWith('.txt')) {
    const text = lower.endsWith('.docx') ? docxText(buf) : buf.toString('utf8');
    return { text, kind: lower.endsWith('.docx') ? 'docx' : 'text', pages: 1, ocrPages: 0, confidence: 100, fields: {}, annots: [], mrzText: '', layout: { kind: 'text', pages: [], lines: text.split('\n') } };
  }
  throw Object.assign(new Error('Unsupported file type — upload PDF, JPG, PNG or DOCX.'), { status: 415 });
}

export async function shutdown() {
  await Promise.all(pool.map(async (w) => (await w.p).terminate()));
  pool.length = 0;
}
