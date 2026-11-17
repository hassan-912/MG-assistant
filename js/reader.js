/* Browser document reader — everything runs on the user's computer (nothing is uploaded).
 * PDF text via pdf.js, scans and photos via Tesseract OCR (Web Workers), Word via the built-in unzip.
 * Also records where each word sits on the page (layout) so findings can show a picture of the field. */
(function (V) {
  'use strict';
  const RD = (V.reader = {});
  const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : location.origin + '/');
  const VENDOR = BASE + 'vendor/';
  const MAX_PAGES = 12;
  const OCR_SCALE = 2.5;
  const VIEW_SCALE = 2;
  const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

  /* ---------------- libraries (self-hosted, loaded on first use) ---------------- */
  let pdfP = null;
  function pdfjs() {
    if (!pdfP) {
      pdfP = import(VENDOR + 'pdfjs/pdf.min.mjs').then((m) => {
        m.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs';
        return m;
      });
      pdfP.catch(() => (pdfP = null));
    }
    return pdfP;
  }
  const pdfOpts = (data) => ({ data, verbosity: 0, standardFontDataUrl: VENDOR + 'pdfjs/standard_fonts/', cMapUrl: VENDOR + 'pdfjs/cmaps/', cMapPacked: true });
  let tessP = null;
  function tesseract() {
    if (!tessP) {
      tessP = new Promise((res, rej) => {
        if (window.Tesseract) return res(window.Tesseract);
        const s = document.createElement('script');
        s.src = VENDOR + 'tesseract/tesseract.min.js';
        s.onload = () => res(window.Tesseract);
        s.onerror = () => {
          tessP = null;
          rej(new Error('The OCR engine could not be loaded.'));
        };
        document.head.appendChild(s);
      });
    }
    return tessP;
  }

  /* ---------------- OCR worker pool ---------------- */
  const POOL = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const pool = [];
  const queue = [];
  function acquire() {
    const free = pool.find((w) => !w.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    if (pool.length < POOL) {
      const slot = {
        busy: true,
        p: tesseract().then((T) => T.createWorker('eng', 1, {
          workerPath: VENDOR + 'tesseract/worker.min.js', corePath: VENDOR + 'tesseract-core/', langPath: VENDOR + 'tessdata', gzip: true,
          workerBlobURL: false, logger: () => {},
        })),
      };
      pool.push(slot);
      slot.p.catch(() => pool.splice(pool.indexOf(slot), 1));
      return Promise.resolve(slot);
    }
    return new Promise((res) => queue.push(res));
  }
  function release(slot) {
    const next = queue.shift();
    if (next) next(slot);
    else slot.busy = false;
  }
  async function ocr(image, opts) {
    opts = opts || {};
    const slot = await acquire();
    try {
      const w = await slot.p;
      await w.setParameters({ tessedit_pageseg_mode: opts.psm || '3', tessedit_char_whitelist: opts.whitelist || '', preserve_interword_spaces: '1' });
      const r = await w.recognize(image, {}, { text: true, blocks: !opts.noWords });
      const words = [];
      (r.data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((wd) => {
        if (wd.text && wd.text.trim()) words.push({ t: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
      }))));
      return { text: r.data.text || '', confidence: r.data.confidence || 0, words };
    } finally {
      release(slot);
    }
  }

  /* ---------------- helpers ---------------- */
  const sortWords = (w) => w.sort((a, b) => (Math.abs(a.y0 - b.y0) < (a.y1 - a.y0) * 0.5 ? a.x0 - b.x0 : a.y0 - b.y0));
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  }
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type || 'image/jpeg', q || 0.85));
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
  function itemWords(lib, items, vp) {
    const out = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = lib.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]) || 10;
      const width = (it.width || it.str.length * fh * 0.5) * vp.scale;
      const chars = it.str.length;
      let pos = 0;
      it.str.split(/(\s+)/).forEach((part) => {
        if (part.trim()) out.push({ t: part, x0: tx[4] + (pos / chars) * width, x1: tx[4] + ((pos + part.length) / chars) * width, y0: tx[5] - fh, y1: tx[5] + fh * 0.25 });
        pos += part.length;
      });
    }
    return out;
  }
  function rectWords(value, rect, vp) {
    const r = vp.convertToViewportRectangle(rect);
    const x0 = Math.min(r[0], r[2]);
    const x1 = Math.max(r[0], r[2]);
    const y0 = Math.min(r[1], r[3]);
    const y1 = Math.max(r[1], r[3]);
    const lines = value.split(/\n/);
    const lh = (y1 - y0) / Math.max(1, lines.length);
    const out = [];
    lines.forEach((line, li) => {
      const total = line.length || 1;
      let pos = 0;
      line.split(/\s+/).filter(Boolean).forEach((t) => {
        const start = line.indexOf(t, pos);
        pos = start + t.length;
        out.push({ t, x0: x0 + ((x1 - x0) * start) / total, x1: x0 + ((x1 - x0) * pos) / total, y0: y0 + li * lh, y1: y0 + (li + 1) * lh });
      });
    });
    return out;
  }
  function labelContext(items, rect) {
    const [x1, y1, , y2] = rect;
    const cands = [];
    for (const it of items) {
      const s = it.str && it.str.trim();
      if (!s) continue;
      const ix = it.transform[4];
      const iy = it.transform[5];
      if (iy < y1 - 4 || iy > y2 + 60) continue;
      if (ix > x1 + 40 || ix + (it.width || 0) < x1 - 220) continue;
      cands.push({ s, dist: Math.max(0, iy - y2) + Math.abs(ix - x1) * 0.15, iy, ix });
    }
    cands.sort((a, b) => a.dist - b.dist);
    return cands.slice(0, 6).sort((a, b) => b.iy - a.iy || a.ix - b.ix).map((c) => c.s).join(' ');
  }
  async function renderPage(page, scale) {
    const vp = page.getViewport({ scale });
    const c = canvas(vp.width, vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
  function cropBottom(src, frac) {
    const h = Math.round(src.height * frac);
    const c = canvas(src.width, h);
    c.getContext('2d').drawImage(src, 0, src.height - h, src.width, h, 0, 0, src.width, h);
    return c;
  }
  async function mrzPass(src) {
    let t = '';
    for (const frac of [0.3, 0.5]) t += (await ocr(cropBottom(src, frac), { psm: '6', whitelist: MRZ_CHARS, noWords: true })).text + '\n';
    return t;
  }

  /* ---------------- formats ---------------- */
  async function readPdf(file, progress) {
    const lib = await pdfjs();
    const doc = await lib.getDocument(pdfOpts(new Uint8Array(await file.arrayBuffer()))).promise;
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const annots = [];
    const layoutPages = [];
    const jobs = [];
    const scans = [];
    let conf = 0;
    let ocrPages = 0;
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const t = itemsToLines(tc.items);
      const isScan = t.replace(/\s/g, '').length < 80;
      const scale = isScan ? OCR_SCALE : VIEW_SCALE;
      const vp = page.getViewport({ scale });
      const lp = { page: i, w: Math.ceil(vp.width), h: Math.ceil(vp.height), scale, words: isScan ? [] : itemWords(lib, tc.items, vp), img: null };
      layoutPages.push(lp);
      try {
        for (const a of await page.getAnnotations()) {
          let value = '';
          if (a.fieldName && a.fieldValue !== undefined && a.fieldValue !== null && a.fieldValue !== 'Off') value = Array.isArray(a.fieldValue) ? a.fieldValue.join(', ') : String(a.fieldValue);
          else if (a.subtype === 'FreeText' || a.subtype === 'Text') value = (a.contentsObj && a.contentsObj.str) || '';
          if (!value || !value.trim() || !a.rect) continue;
          annots.push({ page: i, value: value.trim(), name: a.fieldName || '', context: labelContext(tc.items, a.rect) });
          lp.words.push(...rectWords(value.trim(), a.rect, vp));
        }
      } catch (e) { /* no annotations */ }
      if (isScan) {
        if (progress) progress('OCR page ' + i + '/' + pages);
        const c = await renderPage(page, OCR_SCALE);
        scans.push(c);
        lp.img = await toBlob(c);
        jobs.push(ocr(c).then((r) => {
          conf += r.confidence;
          ocrPages++;
          lp.words.push(...r.words);
          sortWords(lp.words);
          return (t ? t + '\n' : '') + r.text;
        }));
      } else {
        sortWords(lp.words);
        jobs.push(Promise.resolve(t));
      }
    }
    const text = (await Promise.all(jobs)).join('\n\f\n') + '\n';
    let mrzText = '';
    if (scans.length && /P<|PASSPORT|<<</i.test(text)) for (const c of scans.slice(0, 2)) mrzText += await mrzPass(c);
    doc.destroy();
    return { text, kind: 'pdf', pages: doc.numPages || pages, ocrPages, confidence: ocrPages ? conf / ocrPages : 100, annots, mrzText, layout: { kind: 'pdf', pages: layoutPages } };
  }
  async function readImage(file) {
    const bmp = await createImageBitmap(file);
    const c = canvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    const r = await ocr(c);
    const mrzText = /P<|PASSPORT|<<</i.test(r.text) ? await mrzPass(c) : '';
    return {
      text: r.text, kind: 'image', pages: 1, ocrPages: 1, confidence: r.confidence, annots: [], mrzText,
      layout: { kind: 'image', pages: [{ page: 1, w: c.width, h: c.height, scale: 1, words: sortWords(r.words), img: file }] },
    };
  }
  /* .docx = zip; the text lives in word/document.xml */
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function docxText(buf) {
    const b = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Could not open this Word file — save it as PDF and upload again.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
      if (name === 'word/document.xml') {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = b.subarray(start, start + csize);
        const xml = new TextDecoder().decode(method === 0 ? data : await inflateRaw(data));
        return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('This Word file has no text.');
  }

  /** Read one File. @returns {Promise<{text, kind, ocrPages, confidence, annots, mrzText, layout}>} */
  RD.read = async function (file, opts) {
    opts = opts || {};
    const n = file.name.toLowerCase();
    if (n.endsWith('.pdf') || file.type === 'application/pdf') return readPdf(file, opts.progress);
    if (/\.(png|jpe?g|webp|bmp|gif)$/.test(n) || /^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type)) return readImage(file);
    if (n.endsWith('.docx')) {
      const text = await docxText(await file.arrayBuffer());
      return { text, kind: 'docx', pages: 1, ocrPages: 0, confidence: 100, annots: [], mrzText: '', layout: { kind: 'text', pages: [], lines: text.split('\n') } };
    }
    if (n.endsWith('.txt')) {
      const text = await file.text();
      return { text, kind: 'text', pages: 1, ocrPages: 0, confidence: 100, annots: [], mrzText: '', layout: { kind: 'text', pages: [], lines: text.split('\n') } };
    }
    if (/\.(heic|heif)$/.test(n)) throw new Error('iPhone HEIC photos are not supported — export the photo as JPG and upload again.');
    throw new Error('Unsupported file type — upload PDF, JPG, PNG or Word (.docx).');
  };

  /** Page picture for snippets: stored image for scans/photos, re-rendered for text pages. */
  RD.pageImage = async function (file, p) {
    if (p.img) return createImageBitmap(p.img);
    const lib = await pdfjs();
    const doc = await lib.getDocument(pdfOpts(new Uint8Array(await file.arrayBuffer()))).promise;
    try {
      return await renderPage(await doc.getPage(p.page), p.scale);
    } finally {
      doc.destroy();
    }
  };
  RD.warmUp = function () {
    pdfjs().catch(() => {});
    acquire().then(release).catch(() => {});
  };
})(window.VFR);
