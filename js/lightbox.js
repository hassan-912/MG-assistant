/* Picture viewer: opens from the thumbnail with a zoom animation.
 * One click on the picture closes it · double-click zooms in and the picture follows the mouse · click outside or Esc closes. */
(function (V) {
  'use strict';
  const LB = (V.lightbox = {});
  const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
  let el, img, cap, from;
  let isOpen = false;
  let zoomed = false;
  let zoom = 2.5;
  let clickTimer = null;
  let pending = null;
  let raf = 0;

  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setT(t, dur) {
    img.style.transition = dur ? 'transform ' + dur + 's ' + SPRING : 'none';
    img.style.transform = t;
  }
  /** Transform that puts the big picture exactly over the thumbnail. */
  function thumbTransform() {
    if (!from || !from.isConnected) return 'scale(0.9)';
    const a = from.getBoundingClientRect();
    img.style.transition = 'none';
    const prev = img.style.transform;
    img.style.transform = 'none';
    const b = img.getBoundingClientRect();
    img.style.transform = prev;
    if (!b.width || !a.width) return 'scale(0.9)';
    const s = a.width / b.width;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + s + ')';
  }

  LB.open = function (src, caption, thumb) {
    if (!el) return;
    from = thumb || null;
    zoomed = false;
    el.classList.remove('zoomed');
    cap.textContent = caption || '';
    img.alt = caption || 'Document picture';
    img.src = src;
    el.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    const go = () => {
      setT(thumbTransform(), 0);
      void img.offsetWidth; // commit the start position
      el.classList.add('open');
      setT('none', reduced() ? 0 : 0.55);
      isOpen = true;
      el.querySelector('.lb-close').focus({ preventScroll: true });
    };
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(go);
  };

  LB.close = function () {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(clickTimer);
    clearTimeout(raf);
    el.classList.remove('open', 'zoomed');
    zoomed = false;
    const end = () => {
      el.hidden = true;
      img.style.transform = '';
      img.removeAttribute('src');
      document.documentElement.style.overflow = '';
      if (from && from.isConnected) from.focus({ preventScroll: true });
    };
    if (reduced()) return end();
    setT(thumbTransform(), 0.45);
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      end();
    };
    img.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, 520);
  };

  /* ---------- zoom & pan ---------- */
  function panTo(cx, cy, dur) {
    const r = img.getBoundingClientRect(); // includes current transform — use layout size instead
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rangeX = Math.max(0, (w * zoom - Math.min(vw, w * zoom)) / 2, (w * zoom - w) / 2);
    const rangeY = Math.max(0, (h * zoom - Math.min(vh, h * zoom)) / 2, (h * zoom - h) / 2);
    const px = Math.max(-1, Math.min(1, (cx - vw / 2) / (vw / 2)));
    const py = Math.max(-1, Math.min(1, (cy - vh / 2) / (vh / 2)));
    void r;
    setT('translate(' + -px * rangeX + 'px, ' + -py * rangeY + 'px) scale(' + zoom + ')', dur);
  }
  function toggleZoom(e) {
    zoomed = !zoomed;
    el.classList.toggle('zoomed', zoomed);
    if (zoomed) {
      // zoom so the picture shows roughly at its real resolution, at least 2×, at most 4×
      zoom = Math.max(2, Math.min(4, (img.naturalWidth / img.offsetWidth) * 1.6));
      panTo(e.clientX, e.clientY, reduced() ? 0 : 0.5);
    } else setT('none', reduced() ? 0 : 0.45);
  }
  let lastMove = 0;
  function onMove(cx, cy) {
    if (!zoomed) return;
    pending = [cx, cy];
    const now = Date.now();
    clearTimeout(raf);
    if (now - lastMove >= 16) {
      lastMove = now;
      panTo(cx, cy, 0.18);
    } else {
      // make sure the last position is applied when the mouse stops
      raf = setTimeout(() => zoomed && pending && panTo(pending[0], pending[1], 0.18), 20);
    }
  }

  function init() {
    el = document.getElementById('lightbox');
    if (!el) return;
    img = el.querySelector('.lb-img');
    cap = el.querySelector('.lb-caption');
    // click on the picture: wait briefly so a double-click can zoom instead of closing
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(clickTimer);
      if (e.detail > 1) return;
      clickTimer = setTimeout(LB.close, 260);
    });
    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(clickTimer);
      toggleZoom(e);
    });
    // anywhere outside the picture closes it
    el.addEventListener('click', (e) => {
      if (e.target !== img) LB.close();
    });
    el.querySelector('.lb-close').addEventListener('click', (e) => {
      e.stopPropagation();
      LB.close();
    });
    el.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    el.addEventListener('touchmove', (e) => {
      if (!zoomed || !e.touches[0]) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') LB.close();
      else if (e.key === 'Tab') {
        e.preventDefault();
        el.querySelector('.lb-close').focus();
      }
    });
    window.addEventListener('resize', () => isOpen && zoomed && toggleZoom({ clientX: innerWidth / 2, clientY: innerHeight / 2 }));
  }
  document.addEventListener('DOMContentLoaded', init);
})(window.VFR);
