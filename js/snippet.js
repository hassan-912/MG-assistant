/* Field pictures, drawn in the browser: crop the page around a value and box it in red. */
(function (V) {
  'use strict';
  const S = (V.snippet = {});
  const THUMB_W = 760;
  const cache = new Map(); // key → Promise<objectURL|null>
  const pageCache = new Map(); // doc id + page → Promise<ImageBitmap|Canvas>

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function mark(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(255, 214, 0, 0.28)';
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();
  }
  const toURL = (c) => new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : null), 'image/png'));

  async function pagePicture(doc, p) {
    const key = doc.id + '#' + p.page;
    if (!pageCache.has(key)) {
      const pr = V.reader.pageImage(doc.file, p);
      pageCache.set(key, pr);
      pr.catch(() => pageCache.delete(key));
    }
    return pageCache.get(key);
  }

  async function drawPage(doc, hit, outW) {
    const p = hit.page;
    const img = await pagePicture(doc, p);
    const sx = img.width / p.w;
    const sy = img.height / p.h;
    const { box, crop } = V.locate.cropBox(p, hit.words);
    const cw = (crop.x1 - crop.x0) * sx;
    const ch = (crop.y1 - crop.y0) * sy;
    const scale = Math.min(outW > THUMB_W ? 3 : 1.6, outW / cw);
    const c = document.createElement('canvas');
    c.width = Math.round(cw * scale);
    c.height = Math.round(ch * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x0 * sx, crop.y0 * sy, cw, ch, 0, 0, c.width, c.height);
    mark(ctx, (box.x0 - crop.x0) * sx * scale - 5, (box.y0 - crop.y0) * sy * scale - 4, (box.x1 - box.x0) * sx * scale + 10, (box.y1 - box.y0) * sy * scale + 8);
    return toURL(c);
  }

  function drawText(doc, q, outW) {
    const lines = doc.layout.lines || [];
    let li = -1;
    let start = -1;
    let len = 0;
    outer: for (const n of V.locate.needles(q)) {
      if (!n || !String(n).trim()) continue;
      const re = new RegExp(String(n).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
      for (let i = 0; i < lines.length; i++) {
        const m = re.exec(lines[i]);
        if (m) {
          li = i;
          start = m.index;
          len = m[0].length;
          break outer;
        }
      }
    }
    if (li === -1) return Promise.resolve(null);
    const k = outW / THUMB_W;
    const W = outW;
    const H = Math.round(92 * k);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    ctx.font = Math.round(13 * k) + 'px ' + font;
    ctx.fillStyle = '#6e6e73';
    ctx.fillText(doc.name + ' — line ' + (li + 1), 14 * k, 22 * k);
    ctx.font = Math.round(18 * k) + 'px ' + font;
    const line = lines[li];
    const mid = line.slice(start, start + len);
    let pre = (start > 70 ? '… ' : '') + line.slice(Math.max(0, start - 70), start);
    let post = line.slice(start + len, start + len + 70) + (start + len + 70 < line.length ? ' …' : '');
    const midW = ctx.measureText(mid).width;
    const room = W - 28 * k - midW;
    while (pre.length > 4 && ctx.measureText(pre).width > room * 0.55) pre = pre.slice(1);
    const y = 62 * k;
    let x = 14 * k;
    ctx.fillStyle = '#1d1d1f';
    ctx.fillText(pre, x, y);
    x += ctx.measureText(pre).width;
    mark(ctx, x - 3 * k, y - 20 * k, midW + 6 * k, 28 * k);
    ctx.fillStyle = '#1d1d1f';
    ctx.fillText(mid, x, y);
    x += midW + 6 * k;
    while (post.length > 4 && x + ctx.measureText(post).width > W - 14 * k) post = post.slice(0, -2);
    ctx.fillText(post, x, y);
    return toURL(c);
  }

  /** @returns {Promise<string|null>} object URL of the picture, or null when the value is not on the document */
  S.render = function (doc, q, width) {
    if (!doc) return Promise.resolve(null);
    const outW = Math.max(400, Math.min(1800, width || THUMB_W));
    const key = doc.id + '|' + JSON.stringify(q) + '|' + outW;
    if (!cache.has(key)) {
      let pr;
      if (doc.layout.kind === 'text') pr = drawText(doc, q, outW);
      else {
        const hit = V.locate.find(doc.layout, q);
        pr = hit ? drawPage(doc, hit, outW) : Promise.resolve(null);
      }
      pr = pr.catch(() => null);
      cache.set(key, pr);
    }
    return cache.get(key);
  };
  S.forget = function () {
    cache.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
    cache.clear();
    pageCache.clear();
  };
})(window.VFR);
