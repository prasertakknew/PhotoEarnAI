/**
 * Image adjustments & filter gallery dialogs (Levels, Curves, Hue/Saturation,
 * Color Balance, Threshold, Posterize, Motion/Radial Blur, High Pass, Mosaic,
 * Noise, Emboss, Find Edges) with live preview, plus the Studio procedural
 * backdrop generator.
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = window.photoearnai;
  if (!app) return;
  const { engine, history } = app;
  const $ = (id) => document.getElementById(id);
  const th = () => window.PhotoEarnI18n?.language === 'th';
  const t = (en, thai) => (th() ? thai : en);
  const closeMenus = () => document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('open'));

  if (window.PhotoEarnI18n) {
    Object.assign(PhotoEarnI18n.keyMap, {
      'Levels...': ['ระดับสี (Levels)...', 'Levels...'], 'Curves...': ['เส้นโค้ง (Curves)...', 'Curves...'],
      'Hue / Saturation...': ['สีสัน / ความอิ่มสี...', 'Hue / Saturation...'], 'Color Balance...': ['สมดุลสี...', 'Color Balance...'],
      'Threshold...': ['ขาว-ดำตัดขอบ (Threshold)...', 'Threshold...'], 'Posterize...': ['ลดระดับสี (Posterize)...', 'Posterize...'],
      'Motion Blur...': ['เบลอแบบเคลื่อนไหว...', 'Motion Blur...'], 'Radial Blur...': ['เบลอแบบหมุน...', 'Radial Blur...'],
      'High Pass...': ['ไฮพาส (High Pass)...', 'High Pass...'], 'Pixelate (Mosaic)...': ['โมเสก (Pixelate)...', 'Pixelate (Mosaic)...'],
      'Add Noise...': ['เพิ่มนอยส์...', 'Add Noise...'], 'Stylize: Emboss': ['สไตล์: ภาพนูน', 'Stylize: Emboss'], 'Stylize: Find Edges': ['สไตล์: หาขอบ', 'Stylize: Find Edges'],
      'AI & Procedural Backdrop Generator...': ['สร้างฉากหลังอัตโนมัติ...', 'AI & Procedural Backdrop Generator...'],
    });
    PhotoEarnI18n.refresh();
  }

  // ------------------------------------------------------------ curves helper
  /** Monotone cubic interpolation through control points → 256-entry LUT. */
  function curveLut(points) {
    const p = [...points].sort((a, b) => a.x - b.x); const n = p.length; const lut = new Uint8ClampedArray(256);
    if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    const d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1].y - p[i].y) / Math.max(1e-6, p[i + 1].x - p[i].x);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; } }
    for (let x = 0; x < 256; x++) {
      if (x <= p[0].x) { lut[x] = p[0].y; continue; } if (x >= p[n - 1].x) { lut[x] = p[n - 1].y; continue; }
      let i = 0; while (x > p[i + 1].x) i++;
      const h = p[i + 1].x - p[i].x, tt = (x - p[i].x) / h, t2 = tt * tt, t3 = t2 * tt;
      lut[x] = (2 * t3 - 3 * t2 + 1) * p[i].y + (t3 - 2 * t2 + tt) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1].y + (t3 - t2) * h * m[i + 1];
    }
    return lut;
  }
  const CURVE_PRESETS = {
    linear: [[0, 0], [255, 255]], scurve: [[0, 0], [64, 48], [192, 210], [255, 255]], brighten: [[0, 0], [110, 150], [255, 255]],
    darken: [[0, 0], [150, 110], [255, 255]], invert: [[0, 255], [255, 0]], fade: [[0, 40], [255, 225]],
  };

  // ------------------------------------------------------------ definitions
  const range = (key, label, min, max, value, step = 1) => ({ type: 'range', key, label, min, max, value, step });
  const check = (key, label, value = false) => ({ type: 'check', key, label, value });
  const ADJUST = {
    levels: { title: ['Levels', 'ระดับสี (Levels)'], controls: [range('inBlack', ['Input black', 'จุดดำ'], 0, 253, 0), range('gamma', ['Midtones (gamma)', 'โทนกลาง (แกมมา)'], 0.1, 5, 1, 0.01), range('inWhite', ['Input white', 'จุดขาว'], 2, 255, 255), range('outBlack', ['Output black', 'ดำขาออก'], 0, 255, 0), range('outWhite', ['Output white', 'ขาวขาออก'], 0, 255, 255)],
      apply: (l, v) => FilterEngine.applyLevels(l, v.inBlack, v.gamma, Math.max(v.inBlack + 1, v.inWhite), v.outBlack, v.outWhite) },
    curves: { title: ['Curves', 'เส้นโค้ง (Curves)'], curves: true, controls: [], apply: (l, v) => FilterEngine.applyCurves(l, curveLut(v.points)) },
    huesat: { title: ['Hue / Saturation', 'สีสัน / ความอิ่มสี'], controls: [range('hue', ['Hue', 'สีสัน'], -180, 180, 0), range('sat', ['Saturation', 'ความอิ่มสี'], -100, 100, 0), range('light', ['Lightness', 'ความสว่าง'], -100, 100, 0), check('colorize', ['Colorize', 'ย้อมสีเดียว'])],
      apply: (l, v) => FilterEngine.applyHueSaturation(l, v.hue, v.colorize ? Math.max(10, v.sat + 50) : v.sat, v.light, v.colorize) },
    colorbalance: { title: ['Color Balance', 'สมดุลสี'], controls: [range('cr', ['Cyan ↔ Red', 'ฟ้า ↔ แดง'], -100, 100, 0), range('mg', ['Magenta ↔ Green', 'ม่วงแดง ↔ เขียว'], -100, 100, 0), range('yb', ['Yellow ↔ Blue', 'เหลือง ↔ น้ำเงิน'], -100, 100, 0)],
      apply: (l, v) => FilterEngine.applyColorBalance(l, v.cr, v.mg, v.yb) },
    threshold: { title: ['Threshold', 'ขาว-ดำตัดขอบ (Threshold)'], controls: [range('level', ['Threshold level', 'ระดับ'], 1, 255, 128)], apply: (l, v) => FilterEngine.applyThreshold(l, v.level) },
    posterize: { title: ['Posterize', 'ลดระดับสี (Posterize)'], controls: [range('levels', ['Levels', 'จำนวนระดับ'], 2, 32, 4)], apply: (l, v) => FilterEngine.applyPosterize(l, v.levels) },
    motionblur: { title: ['Motion Blur', 'เบลอแบบเคลื่อนไหว'], controls: [range('angle', ['Angle (°)', 'มุม (°)'], 0, 360, 0), range('distance', ['Distance (px)', 'ระยะ (px)'], 1, 60, 12)], apply: (l, v) => FilterEngine.applyMotionBlur(l, v.angle, v.distance) },
    radialblur: { title: ['Radial Blur', 'เบลอแบบหมุน'], controls: [range('amount', ['Amount', 'ความแรง'], 1, 100, 10)], apply: (l, v) => FilterEngine.applyRadialBlur(l, v.amount) },
    highpass: { title: ['High Pass', 'ไฮพาส (High Pass)'], controls: [range('radius', ['Radius (px)', 'รัศมี (px)'], 1, 30, 4)], apply: (l, v) => FilterEngine.applyHighPass(l, v.radius) },
    mosaic: { title: ['Pixelate (Mosaic)', 'โมเสก (Pixelate)'], controls: [range('cell', ['Cell size (px)', 'ขนาดช่อง (px)'], 2, 64, 12)], apply: (l, v) => FilterEngine.applyMosaic(l, v.cell) },
    noise: { title: ['Add Noise', 'เพิ่มนอยส์'], controls: [range('amount', ['Amount', 'ปริมาณ'], 1, 100, 20), check('gaussian', ['Gaussian', 'แบบเกาส์']), check('mono', ['Monochromatic', 'ขาวดำ'], true)], apply: (l, v) => FilterEngine.applyNoise(l, v.amount, v.gaussian, v.mono) },
    emboss: { title: ['Stylize: Emboss', 'สไตล์: ภาพนูน'], instant: true, apply: (l) => FilterEngine.applyEmboss(l) },
    findedges: { title: ['Stylize: Find Edges', 'สไตล์: หาขอบ'], instant: true, apply: (l) => FilterEngine.applyFindEdges(l) },
  };

  // ------------------------------------------------------------ dialog
  const modal = $('modal-adjust'), body = $('adjust-body');
  let session = null; // { key, def, layer, original, values }
  const label = (pair) => (th() ? pair[1] : pair[0]);

  function targetLayer() {
    const layer = engine.getActiveLayer();
    if (!layer) return null;
    if (layer.adjustment || layer.group) { alert(t('Pick a picture layer first.', 'เลือกเลเยอร์รูปภาพก่อน')); return null; }
    if (layer.textData && !confirm(t('This is a text layer. Applying a filter turns it into pixels (the text will no longer be editable). Continue?', 'นี่คือเลเยอร์ข้อความ ถ้าใส่ฟิลเตอร์ ข้อความจะกลายเป็นภาพและแก้ข้อความไม่ได้อีก ทำต่อไหม?'))) return null;
    return layer;
  }

  function runInstant(key) {
    const def = ADJUST[key]; const layer = targetLayer(); if (!layer) return;
    history.captureSnapshot(label(def.title));
    if (layer.textData) layer.textData = null;
    def.apply(layer, {}); engine.render(); engine.emit('layerChange');
  }

  function openAdjust(key) {
    closeMenus();
    const def = ADJUST[key]; if (!def) return;
    if (def.instant) { runInstant(key); return; }
    const layer = targetLayer(); if (!layer) return;
    const original = layer.ctx.getImageData(0, 0, layer.width, layer.height);
    const values = {}; (def.controls || []).forEach(c => { values[c.key] = c.value; });
    if (def.curves) values.points = CURVE_PRESETS.linear.map(([x, y]) => ({ x, y }));
    session = { key, def, layer, original, values };
    $('adjust-title').textContent = label(def.title);
    $('adjust-preview-label').textContent = t('Preview', 'ดูตัวอย่าง');
    $('adjust-cancel').textContent = t('Cancel', 'ยกเลิก');
    $('adjust-apply').textContent = t('Apply', 'ใช้งาน');
    body.innerHTML = '';
    if (def.curves) buildCurves(values);
    (def.controls || []).forEach(c => {
      const row = document.createElement('div'); row.className = c.type === 'check' ? 'check-row' : 'form-row';
      if (c.type === 'range') {
        row.innerHTML = `<label><span></span>: <output></output></label><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">`;
        row.querySelector('span').textContent = label(c.label);
        const out = row.querySelector('output'); const input = row.querySelector('input'); out.textContent = c.value;
        input.addEventListener('input', () => { values[c.key] = parseFloat(input.value); out.textContent = input.value; schedule(); });
      } else {
        row.innerHTML = `<input type="checkbox" ${c.value ? 'checked' : ''}> <span></span>`;
        row.querySelector('span').textContent = label(c.label);
        row.querySelector('input').addEventListener('change', (e) => { values[c.key] = e.target.checked; schedule(); });
        row.classList.add('adjust-check');
      }
      body.appendChild(row);
    });
    modal.classList.add('open');
    schedule();
  }

  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(preview); }
  function restore() { if (session) session.layer.ctx.putImageData(session.original, 0, 0); }
  function preview() {
    if (!session) return;
    restore();
    if ($('adjust-preview')?.checked) session.def.apply(session.layer, session.values);
    engine.render();
  }
  $('adjust-preview')?.addEventListener('change', schedule);

  function closeAdjust(apply) {
    if (!session) { modal?.classList.remove('open'); return; }
    const s = session; session = null;
    restore();
    if (apply) {
      history.captureSnapshot(label(s.def.title));
      if (s.layer.textData) s.layer.textData = null;
      s.def.apply(s.layer, s.values);
    }
    engine.render(); engine.emit('layerChange');
    modal?.classList.remove('open');
  }
  $('adjust-apply')?.addEventListener('click', () => closeAdjust(true));
  $('adjust-cancel')?.addEventListener('click', () => closeAdjust(false));
  $('adjust-close')?.addEventListener('click', () => closeAdjust(false));
  window.addEventListener('keydown', (e) => {
    if (!modal?.classList.contains('open')) return;
    if (e.key === 'Escape') closeAdjust(false);
    if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); closeAdjust(true); }
  });

  function buildCurves(values) {
    const wrap = document.createElement('div'); wrap.className = 'curves-wrap';
    wrap.innerHTML = `<div class="form-row"><label>${t('Preset', 'ค่าสำเร็จรูป')}</label><select class="curves-preset">
      <option value="linear">${t('Linear (default)', 'เส้นตรง (ค่าเริ่มต้น)')}</option><option value="scurve">${t('S-curve: more contrast', 'โค้ง S: คอนทราสต์มากขึ้น')}</option>
      <option value="brighten">${t('Brighten', 'สว่างขึ้น')}</option><option value="darken">${t('Darken', 'มืดลง')}</option><option value="fade">${t('Faded film', 'ฟิล์มซีด')}</option><option value="invert">${t('Invert', 'กลับสี')}</option></select></div>
      <canvas class="curves-canvas" width="256" height="256"></canvas>
      <p class="studio-help">${t('Drag points · click the line to add a point · double-click a point to remove it', 'ลากจุด · คลิกบนเส้นเพื่อเพิ่มจุด · ดับเบิลคลิกจุดเพื่อลบ')}</p>`;
    body.appendChild(wrap);
    const cv = wrap.querySelector('canvas'); const ctx = cv.getContext('2d');
    const draw = () => {
      ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = '#15161a'; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; for (let i = 64; i < 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(256, 0); ctx.stroke();
      const lut = curveLut(values.points); ctx.strokeStyle = '#28d7d1'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < 256; x++) ctx[x ? 'lineTo' : 'moveTo'](x, 255 - lut[x]); ctx.stroke(); ctx.lineWidth = 1;
      values.points.forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, 255 - p.y, 4.5, 0, Math.PI * 2); ctx.fill(); });
    };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(255, (e.clientX - r.left) * 256 / r.width)), y: Math.max(0, Math.min(255, 255 - (e.clientY - r.top) * 256 / r.height)) }; };
    const nearest = (q) => values.points.findIndex(p => Math.hypot(p.x - q.x, p.y - q.y) < 10);
    let drag = -1;
    cv.addEventListener('pointerdown', (e) => {
      const q = pos(e); drag = nearest(q);
      if (drag < 0) { values.points.push({ x: Math.round(q.x), y: Math.round(q.y) }); values.points.sort((a, b) => a.x - b.x); drag = nearest(q); }
      cv.setPointerCapture(e.pointerId); draw(); schedule();
    });
    cv.addEventListener('pointermove', (e) => {
      if (drag < 0) return; const q = pos(e); const pts = values.points; const p = pts[drag];
      const lo = drag > 0 ? pts[drag - 1].x + 1 : 0, hi = drag < pts.length - 1 ? pts[drag + 1].x - 1 : 255;
      p.x = Math.round(drag === 0 ? Math.min(q.x, hi) : drag === pts.length - 1 ? Math.max(q.x, lo) : Math.max(lo, Math.min(hi, q.x))); p.y = Math.round(q.y);
      draw(); schedule();
    });
    cv.addEventListener('pointerup', () => { drag = -1; });
    cv.addEventListener('dblclick', (e) => { const i = nearest(pos(e)); if (i > 0 && i < values.points.length - 1) { values.points.splice(i, 1); draw(); schedule(); } });
    wrap.querySelector('.curves-preset').addEventListener('change', (e) => { values.points = CURVE_PRESETS[e.target.value].map(([x, y]) => ({ x, y })); draw(); schedule(); });
    draw();
  }

  document.querySelectorAll('[data-adjust]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openAdjust(el.dataset.adjust); }));
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || document.querySelector('.modal-overlay.open')) return;
    const map = { l: 'levels', m: 'curves', u: 'huesat' }; const key = map[e.key.toLowerCase()];
    if (key) { e.preventDefault(); openAdjust(key); }
  });
  Object.assign(app, { openAdjust, curveLut });

  // =========================================================================
  // Studio: AI & Procedural Backdrop Generator
  // =========================================================================
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const stars = (c, w, h, r, count, maxR = 1.6) => { for (let i = 0; i < count; i++) { c.globalAlpha = 0.3 + r() * 0.7; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(r() * w, r() * h * 0.85, r() * maxR + 0.3, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1; };
  const BACKDROPS = {
    cyberpunk(c, w, h, r) {
      const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#07021a'); sky.addColorStop(0.55, '#3a0b5c'); sky.addColorStop(1, '#ff2a8a'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
      stars(c, w, h * 0.5, r, Math.round(w * h / 9000), 1.2);
      const glow = c.createRadialGradient(w * 0.5, h * 0.75, 0, w * 0.5, h * 0.75, w * 0.6); glow.addColorStop(0, 'rgba(0,240,255,0.35)'); glow.addColorStop(1, 'rgba(0,240,255,0)'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
      for (let layer = 0; layer < 2; layer++) {
        let x = -10; const base = h * (layer ? 0.98 : 0.9);
        while (x < w) {
          const bw = w * (0.04 + r() * 0.07), bh = h * (0.18 + r() * (layer ? 0.35 : 0.5));
          c.fillStyle = layer ? '#05010d' : '#140628'; c.fillRect(x, base - bh, bw, bh + h);
          for (let wy = base - bh + 8; wy < base - 6; wy += Math.max(6, h * 0.018)) for (let wx = x + 4; wx < x + bw - 4; wx += Math.max(6, w * 0.012)) {
            if (r() < 0.35) { c.fillStyle = r() < 0.5 ? 'rgba(0,240,255,0.85)' : 'rgba(255,60,180,0.85)'; c.fillRect(wx, wy, Math.max(2, w * 0.004), Math.max(2, h * 0.007)); }
          }
          x += bw + w * 0.005;
        }
      }
      c.strokeStyle = 'rgba(0,240,255,0.6)'; c.lineWidth = Math.max(1, h * 0.003);
      c.beginPath(); c.moveTo(0, h * 0.93); c.lineTo(w, h * 0.93); c.stroke();
    },
    synthwave(c, w, h, r) {
      const hz = h * 0.62;
      const sky = c.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#1a0638'); sky.addColorStop(0.6, '#7b1fa2'); sky.addColorStop(1, '#ff6e40'); c.fillStyle = sky; c.fillRect(0, 0, w, hz);
      stars(c, w, hz * 0.7, r, Math.round(w * h / 12000), 1.2);
      const R = Math.min(w, h) * 0.24; const sun = c.createLinearGradient(0, hz - R * 1.6, 0, hz); sun.addColorStop(0, '#ffe259'); sun.addColorStop(1, '#ff2e63');
      c.save(); c.beginPath(); c.arc(w / 2, hz - R * 0.35, R, 0, Math.PI * 2); c.clip(); c.fillStyle = sun; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 7; i++) { const y = hz - R * 0.35 + R * (0.05 + i * 0.14); c.fillRect(0, y, w, R * (0.02 + i * 0.012)); } c.restore();
      c.fillStyle = '#2a0845'; c.beginPath(); c.moveTo(0, hz); for (let x = 0; x <= w; x += w / 12) c.lineTo(x, hz - h * (0.03 + r() * 0.09)); c.lineTo(w, hz); c.fill();
      const ground = c.createLinearGradient(0, hz, 0, h); ground.addColorStop(0, '#2b0b3f'); ground.addColorStop(1, '#0b0217'); c.fillStyle = ground; c.fillRect(0, hz, w, h - hz);
      c.strokeStyle = '#ff3cac'; c.lineWidth = Math.max(1, h * 0.003);
      for (let i = 1; i < 14; i++) { const y = hz + (h - hz) * Math.pow(i / 13, 2.2); c.globalAlpha = 0.4 + i / 26; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (let i = -14; i <= 14; i++) { c.globalAlpha = 0.7; c.beginPath(); c.moveTo(w / 2 + i * w * 0.02, hz); c.lineTo(w / 2 + i * w * 0.16, h); c.stroke(); }
      c.globalAlpha = 1;
    },
    nebula(c, w, h, r) {
      c.fillStyle = '#03030c'; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'screen';
      const colors = ['rgba(130,40,255,0.55)', 'rgba(255,40,140,0.45)', 'rgba(0,180,255,0.45)', 'rgba(255,140,40,0.3)'];
      for (let i = 0; i < 18; i++) { const x = w * (0.2 + r() * 0.6), y = h * (0.2 + r() * 0.6), rad = Math.min(w, h) * (0.15 + r() * 0.35); const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, colors[i % colors.length]); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      c.globalCompositeOperation = 'source-over';
      stars(c, w, h / 0.85, r, Math.round(w * h / 2500), 1.4);
      for (let i = 0; i < 6; i++) { const x = r() * w, y = r() * h, s = Math.min(w, h) * (0.01 + r() * 0.015); const g = c.createRadialGradient(x, y, 0, x, y, s * 3); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(200,220,255,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - s * 3, y - s * 3, s * 6, s * 6); }
    },
    aurora(c, w, h, r) {
      const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#020a1a'); sky.addColorStop(0.7, '#06243a'); sky.addColorStop(1, '#0a3b44'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
      stars(c, w, h * 0.8, r, Math.round(w * h / 5000), 1.2);
      c.globalCompositeOperation = 'screen';
      for (let band = 0; band < 3; band++) {
        const baseY = h * (0.25 + band * 0.12), amp = h * (0.05 + r() * 0.06), freq = 1.5 + r() * 2, phase = r() * 6, tall = h * (0.18 + r() * 0.15);
        for (let x = 0; x < w; x += 2) {
          const y = baseY + Math.sin(x / w * Math.PI * freq + phase) * amp;
          const g = c.createLinearGradient(0, y - tall, 0, y); g.addColorStop(0, 'rgba(0,255,150,0)'); g.addColorStop(0.7, band === 1 ? 'rgba(60,255,170,0.22)' : 'rgba(20,220,140,0.16)'); g.addColorStop(1, 'rgba(150,255,210,0.35)');
          c.fillStyle = g; c.fillRect(x, y - tall, 2, tall);
        }
      }
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#020611'; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 9) c.lineTo(x, h * (0.72 + r() * 0.14)); c.lineTo(w, h); c.fill();
      c.fillStyle = '#01030a'; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 16) c.lineTo(x, h * (0.86 + r() * 0.08)); c.lineTo(w, h); c.fill();
    },
  };
  const bdModal = $('modal-backdrop'); let seed = Date.now() % 100000;
  const bdPreview = () => {
    const cv = $('backdrop-preview'); if (!cv) return;
    const s = Math.min(320 / engine.width, 200 / engine.height);
    cv.width = Math.max(1, Math.round(engine.width * s)); cv.height = Math.max(1, Math.round(engine.height * s));
    const ctx = cv.getContext('2d'); ctx.setTransform(s, 0, 0, s, 0, 0);
    BACKDROPS[$('backdrop-style').value](ctx, engine.width, engine.height, rng(seed));
  };
  const syncBdText = () => {
    $('backdrop-title').textContent = t('AI & Procedural Backdrop Generator', 'สร้างฉากหลังอัตโนมัติ');
    $('backdrop-name-label').textContent = t('Layer name', 'ชื่อเลเยอร์');
    $('backdrop-style-label').textContent = t('Style Preset:', 'สไตล์:');
    $('backdrop-reroll-label').textContent = t('New variation', 'สุ่มแบบใหม่');
    $('backdrop-generate').textContent = t('Generate Layer', 'สร้างเลเยอร์');
  };
  $('menu-backdrop')?.addEventListener('click', (e) => {
    e.stopPropagation(); closeMenus(); syncBdText();
    bdModal?.classList.add('open'); $('backdrop-name').value = $('backdrop-style').selectedOptions[0].textContent; bdPreview();
  });
  $('backdrop-style')?.addEventListener('change', () => { $('backdrop-name').value = $('backdrop-style').selectedOptions[0].textContent; bdPreview(); });
  $('backdrop-reroll')?.addEventListener('click', () => { seed = (seed * 7 + 13) % 1000003; bdPreview(); });
  $('backdrop-generate')?.addEventListener('click', () => {
    const style = $('backdrop-style').value; const name = ($('backdrop-name').value || style).trim().slice(0, 60);
    history.captureSnapshot(`Backdrop: ${name}`);
    const layer = engine.addLayer(name);
    BACKDROPS[style](layer.ctx, layer.width, layer.height, rng(seed));
    engine.render(); engine.emit('layerChange');
    bdModal?.classList.remove('open');
    seed = (seed * 7 + 13) % 1000003;
  });
  Object.assign(app, { backdrops: BACKDROPS });
});
