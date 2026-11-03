/**
 * File features: Photopea-style New Project window (template previews, size
 * presets, units/DPI/background), "Open Image as Layers", and real exports
 * (WEBP, WEBM, BMP, SVG, AI, APNG, ICO).
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = window.photoearnai;
  if (!app) return;
  const { engine, history } = app;
  const $ = (id) => document.getElementById(id);
  const th = () => window.PhotoEarnI18n?.language === 'th';
  const t = (en, thai) => (th() ? thai : en);
  const notice = (message, ms = 4200) => { const n = document.createElement('div'); n.className = 'feature-toast'; n.textContent = message; document.body.appendChild(n); setTimeout(() => n.remove(), ms); };
  const fail = (err) => { console.error(err); alert(`PhotoEarnAI: ${err?.message || err}`); };
  const baseName = () => (engine.docName || 'PhotoEarnAI').replace(/\.[^/.]+$/, '') || 'PhotoEarnAI';
  const download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const make = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const flatten = (bg = null) => {
    engine.render();
    const c = make(engine.width, engine.height); const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(engine.displayCanvas, 0, 0);
    return c;
  };
  const closeMenus = () => document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('open'));

  // Extra menu translations
  if (window.PhotoEarnI18n) {
    Object.assign(PhotoEarnI18n.keyMap, {
      'Open Image as Layers...': ['เปิดรูปภาพเป็นเลเยอร์...', 'Open Image as Layers...'],
      'Open PSD...': ['เปิดไฟล์ PSD...', 'Open PSD...'], 'Open Video as Layers...': ['เปิดวิดีโอเป็นเลเยอร์...', 'Open Video as Layers...'],
      'Export as PSD': ['ส่งออกเป็น PSD', 'Export as PSD'], 'Export as WEBP': ['ส่งออกเป็น WEBP', 'Export as WEBP'],
      'Export as BMP': ['ส่งออกเป็น BMP', 'Export as BMP'], 'Export as SVG': ['ส่งออกเป็น SVG', 'Export as SVG'],
      'Export as AI': ['ส่งออกเป็น AI', 'Export as AI'], 'Export as PNG (APNG)': ['ส่งออกเป็น PNG (APNG)', 'Export as PNG (APNG)'],
      'Export as ICO': ['ส่งออกเป็น ICO', 'Export as ICO'], 'Export as MP4': ['ส่งออกเป็น MP4', 'Export as MP4'],
      'Export as WEBM': ['ส่งออกเป็น WEBM', 'Export as WEBM'], 'Export as GIF': ['ส่งออกเป็น GIF', 'Export as GIF'],
    });
    PhotoEarnI18n.refresh();
  }

  // =========================================================================
  // Open Image as Layers (like Open Video as Layers: each picture = new layer)
  // =========================================================================
  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t(`Could not read ${file.name}`, `อ่านไฟล์ ${file.name} ไม่ได้`))); };
    img.src = url;
  });

  async function placeImageFiles(files) {
    const list = [...files].filter(f => f && (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(f.name)));
    if (!list.length) return;
    try {
      history.captureSnapshot(list.length > 1 ? `Open ${list.length} Images as Layers` : 'Open Image as Layer');
      let added = 0;
      for (const file of list) {
        const img = await loadImage(file);
        const iw = img.naturalWidth || img.width || engine.width, ih = img.naturalHeight || img.height || engine.height;
        const s = Math.min(1, engine.width / iw, engine.height / ih);
        const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
        const layer = new Layer(file.name.replace(/\.[^/.]+$/, '') || 'Image', engine.width, engine.height);
        layer.ctx.imageSmoothingQuality = 'high';
        layer.ctx.drawImage(img, Math.round((engine.width - w) / 2), Math.round((engine.height - h) / 2), w, h);
        engine.layers.push(layer);
        added++;
      }
      engine.activeLayerIndex = engine.layers.length - 1;
      engine.render(); engine.emit('layerChange');
      notice(t(`${added} picture(s) added as new layers`, `เพิ่มรูป ${added} รูปเป็นเลเยอร์ใหม่แล้ว`));
    } catch (err) { history.discardLast?.(); fail(err); }
  }
  Object.assign(app, { placeImageFiles });
  const placeInput = $('file-input-place');
  $('menu-place-image')?.addEventListener('click', () => { closeMenus(); placeInput?.click(); });
  placeInput?.addEventListener('change', (e) => { placeImageFiles(e.target.files || []); e.target.value = ''; });

  // =========================================================================
  // New Project window
  // =========================================================================
  const PRESETS = {
    Social: [['FB Page Cover', 1640, 664], ['FB Event Image', 1920, 1080], ['FB Group Header', 1640, 856], ['Instagram', 1080, 1080], ['Insta Story', 1080, 1920], ['Insta Portrait', 1080, 1350], ['YouTube Thumbnail', 1280, 720], ['YouTube Profile', 800, 800], ['YouTube Cover', 2560, 1440], ['X / Twitter Profile', 400, 400], ['X / Twitter Header', 1500, 500], ['TikTok Video', 1080, 1920], ['LINE Rich Menu', 2500, 1686], ['LinkedIn Banner', 1584, 396]],
    Print: [['A3', 297, 420, 'mm', 300], ['A4', 210, 297, 'mm', 300], ['A5', 148, 210, 'mm', 300], ['A6', 105, 148, 'mm', 300], ['Letter', 8.5, 11, 'in', 300], ['Legal', 8.5, 14, 'in', 300], ['Tabloid', 11, 17, 'in', 300], ['Business Card', 3.5, 2, 'in', 300], ['Postcard', 6, 4, 'in', 300], ['Poster 18×24', 18, 24, 'in', 150]],
    Photo: [['4 × 6 in', 4, 6, 'in', 300], ['5 × 7 in', 5, 7, 'in', 300], ['8 × 10 in', 8, 10, 'in', 300], ['10 × 15 cm', 10, 15, 'cm', 300], ['13 × 18 cm', 13, 18, 'cm', 300], ['Square 10 cm', 10, 10, 'cm', 300], ['Passport 35×45 mm', 35, 45, 'mm', 300]],
    Screen: [['VGA', 640, 480], ['SVGA', 800, 600], ['XGA', 1024, 768], ['HD 720p', 1280, 720], ['Full HD 1080p', 1920, 1080], ['QHD 1440p', 2560, 1440], ['4K UHD', 3840, 2160], ['MacBook Air', 2560, 1664], ['Desktop 1366', 1366, 768]],
    Mobile: [['iPhone 4', 640, 960], ['iPhone 5', 640, 1136], ['iPhone 6 7 8', 750, 1334], ['iPhone 6+ 7+ 8+', 1080, 1920], ['iPhone X', 1125, 2436], ['iPhone 15 Pro', 1179, 2556], ['Samsung A5', 720, 1280], ['Samsung S5', 1080, 1920], ['Samsung S8+', 1440, 2960], ['Google Pixel', 1080, 1920], ['iPad Mini 4', 1536, 2048], ['iPad Air 2', 1536, 2048], ['iPad Pro 10.5"', 1668, 2224], ['iPad Pro 12.9"', 2048, 2732]],
    Ads: [['Medium Rectangle', 300, 250], ['Large Rectangle', 336, 280], ['Leaderboard', 728, 90], ['Half Page', 300, 600], ['Wide Skyscraper', 160, 600], ['Billboard', 970, 250], ['Mobile Banner', 320, 50], ['Large Mobile Banner', 320, 100]],
    '2ᴺ': [['64 × 64', 64, 64], ['128 × 128', 128, 128], ['256 × 256', 256, 256], ['512 × 512', 512, 512], ['1024 × 1024', 1024, 1024], ['2048 × 2048', 2048, 2048], ['4096 × 4096', 4096, 4096]],
  };
  const CAT_TH = { Social: 'โซเชียล', Print: 'งานพิมพ์', Photo: 'ภาพถ่าย', Screen: 'หน้าจอ', Mobile: 'มือถือ', Ads: 'โฆษณา', '2ᴺ': '2ᴺ' };
  const PALETTES = [
    { bg: '#d8c4f6', fg: '#7a2be2', ink: '#2c1147', soft: '#f6efff', hot: '#ffcf3f' },
    { bg: '#c8efe2', fg: '#0e9672', ink: '#083a2d', soft: '#effcf6', hot: '#ff6b6b' },
    { bg: '#ffd8c4', fg: '#e8590c', ink: '#4a1c04', soft: '#fff3ea', hot: '#2f9e44' },
    { bg: '#cfe1ff', fg: '#1c5fe6', ink: '#0b2457', soft: '#eef4ff', hot: '#ff922b' },
    { bg: '#ffd3e5', fg: '#d6336c', ink: '#4d0f27', soft: '#fff0f6', hot: '#22b8cf' },
    { bg: '#fff0b0', fg: '#d99a00', ink: '#3b2e00', soft: '#fffbe6', hot: '#7048e8' },
  ];
  let paletteOffset = 0;
  const sampleImg = new Image(); let sampleReady = false;
  sampleImg.onload = () => { sampleReady = true; if ($('modal-new-doc')?.classList.contains('open')) renderTemplates(); };
  sampleImg.src = 'assets/sample.jpg';

  const scratch = make(8, 8).getContext('2d');
  const fontOf = (s) => `${s.style || ''} ${s.weight || 400} ${s.size}px ${s.font || 'Arial, sans-serif'}`.trim();
  /** Shrink text so its widest line fits maxW. */
  const fit = (spec, maxW) => {
    for (let i = 0; i < 40; i++) {
      scratch.font = fontOf(spec);
      const widest = Math.max(...String(spec.content).split('\n').map(l => scratch.measureText(l).width));
      if (widest <= maxW || spec.size <= 6) break;
      spec.size = Math.max(6, Math.floor(spec.size * Math.max(0.6, maxW / widest)));
    }
    spec.size = Math.round(spec.size);
    return spec;
  };
  const coverImage = (ctx, img, x, y, w, h) => {
    const s = Math.max(w / img.width, h / img.height); const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  };
  const star = (ctx, cx, cy, spikes, outer, inner) => {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? inner : outer; const a = (Math.PI * i) / spikes - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.closePath();
  };
  const T = (w, h, k = 1) => Math.min(h * 0.2, w * 0.1) * k;
  const text = (name, content, o) => ({ name, text: { content, color: '#ffffff', weight: 400, font: "'Segoe UI', Arial, sans-serif", align: 'center', ...o } });
  const pix = (name, draw) => ({ name, draw });

  // Each template returns layers bottom → top. Text layers stay editable (Studio → Text).
  const TEMPLATES = [
    { id: 'frame', name: 'Simple Frame', tags: 'simple frame border minimal', build: (w, h, p) => {
      const b = Math.round(Math.min(w, h) * 0.05);
      return [pix('Background', c => { c.fillStyle = p.bg; c.fillRect(0, 0, w, h); }),
        pix('Border', c => { c.fillStyle = p.fg; c.fillRect(0, 0, w, b); c.fillRect(0, h - b, w, b); c.fillRect(0, 0, b, h); c.fillRect(w - b, 0, b, h); }),
        text('Subtitle', 'Edit any text in Studio → Text', fit({ x: w / 2, y: h * 0.5 + T(w, h) * 0.75, size: T(w, h, 0.32), color: p.ink }, w * 0.8)),
        text('Title', 'Your Big Idea', fit({ x: w / 2, y: h * 0.5 - T(w, h) * 0.6, size: T(w, h), color: p.ink }, w * 0.8))];
    } },
    { id: 'photo', name: 'Photo Title', photo: true, tags: 'photo picture cover headline', build: (w, h, p) => [
      pix('Photo', c => { if (sampleReady) coverImage(c, sampleImg, 0, 0, w, h); else { c.fillStyle = '#333'; c.fillRect(0, 0, w, h); } }),
      pix('Shade', c => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      text('Subtitle', 'Before the day is done.', fit({ x: w * 0.07, y: h * 0.5 + T(w, h) * 0.45, size: T(w, h, 0.32), weight: 700, align: 'left' }, w * 0.8)),
      text('Title', 'Shine Bright!', fit({ x: w * 0.07, y: h * 0.5 - T(w, h) * 0.7, size: T(w, h, 1.05), font: 'Georgia, serif', style: 'italic', weight: 700, align: 'left' }, w * 0.86))] },
    { id: 'dark', name: 'Dark Quote', tags: 'dark bold quote', build: (w, h, p) => {
      const b = Math.round(Math.min(w, h) * 0.03);
      return [pix('Background', c => { c.fillStyle = '#26110f'; c.fillRect(0, 0, w, h); }),
        pix('Border', c => { c.strokeStyle = '#8a3b33'; c.lineWidth = b; c.strokeRect(b * 1.5, b * 1.5, w - b * 3, h - b * 3); }),
        text('Subtitle', 'small steps, every single day', fit({ x: w / 2, y: h * 0.5 + T(w, h) * 0.65, size: T(w, h, 0.3), color: '#e9c9c2' }, w * 0.8)),
        text('Title', 'Dream Big', fit({ x: w / 2, y: h * 0.5 - T(w, h) * 0.6, size: T(w, h, 1.1), font: 'Georgia, serif', style: 'italic', weight: 700 }, w * 0.8))];
    } },
    { id: 'circles', name: 'Bubbles', symbols: true, tags: 'circles bubbles summer fun shapes', build: (w, h, p) => [
      pix('Background', c => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, p.fg); g.addColorStop(1, p.hot); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      pix('Circles', c => { const m = Math.min(w, h); [[0.12, 0.2, 0.22], [0.88, 0.25, 0.16], [0.8, 0.85, 0.28], [0.18, 0.88, 0.12], [0.5, 0.08, 0.07]].forEach(([x, y, r], i) => { c.globalAlpha = 0.18 + i * 0.05; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w * x, h * y, m * r, 0, Math.PI * 2); c.fill(); }); c.globalAlpha = 1; }),
      text('Subtitle', 'GOOD TIMES · GOOD FRIENDS', fit({ x: w / 2, y: h * 0.5 + T(w, h) * 0.6, size: T(w, h, 0.28), weight: 700 }, w * 0.8)),
      text('Title', 'SUMMER VIBES', fit({ x: w / 2, y: h * 0.5 - T(w, h) * 0.6, size: T(w, h, 1.1), font: 'Impact, sans-serif' }, w * 0.86))] },
    { id: 'sale', name: 'Sale Badge', symbols: true, tags: 'sale shop discount badge promo', build: (w, h, p) => {
      const m = Math.min(w, h);
      return [pix('Background', c => { c.fillStyle = p.soft; c.fillRect(0, 0, w, h); c.fillStyle = p.bg; for (let x = -h; x < w; x += m * 0.12) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.lineTo(x + h + m * 0.05, 0); c.lineTo(x + m * 0.05, h); c.fill(); } }),
        pix('Badge', c => { c.fillStyle = p.hot; star(c, w * 0.5, h * 0.5, 16, m * 0.42, m * 0.36); c.fill(); }),
        text('Offer', 'UP TO 50% OFF', fit({ x: w / 2, y: h * 0.5 + m * 0.07, size: m * 0.07, weight: 700 }, m * 0.6)),
        text('Title', 'BIG SALE', fit({ x: w / 2, y: h * 0.5 - m * 0.15, size: m * 0.16, font: 'Impact, sans-serif' }, m * 0.62))];
    } },
    { id: 'split', name: 'Split Photo', photo: true, tags: 'split photo product modern', build: (w, h, p) => [
      pix('Color Panel', c => { c.fillStyle = p.fg; c.fillRect(0, 0, w, h); }),
      pix('Photo', c => { if (sampleReady) coverImage(c, sampleImg, w * 0.5, 0, w * 0.5, h); }),
      text('Subtitle', 'New collection is here', fit({ x: w * 0.06, y: h * 0.5 + T(w, h) * 0.4, size: T(w, h, 0.28), align: 'left', color: p.soft }, w * 0.4)),
      text('Title', 'Fresh\nLook', fit({ x: w * 0.06, y: h * 0.5 - T(w, h) * 1.6, size: T(w, h, 0.85), weight: 700, align: 'left' }, w * 0.4))] },
    { id: 'minimal', name: 'Minimal Line', tags: 'minimal clean white business', build: (w, h, p) => [
      pix('Background', c => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); }),
      pix('Accent Line', c => { c.fillStyle = p.fg; c.fillRect(w * 0.08, h * 0.5 - Math.max(2, h * 0.006), w * 0.14, Math.max(4, h * 0.012)); }),
      text('Subtitle', 'Design · Photo · Story', fit({ x: w * 0.08, y: h * 0.5 + T(w, h) * 0.25, size: T(w, h, 0.3), align: 'left', color: '#666666' }, w * 0.84)),
      text('Title', 'Minimal Studio', fit({ x: w * 0.08, y: h * 0.5 - T(w, h) * 1.15, size: T(w, h, 0.85), weight: 700, align: 'left', color: '#111111' }, w * 0.84))] },
    { id: 'event', name: 'Event Poster', symbols: true, tags: 'event music party poster night', build: (w, h, p) => [
      pix('Background', c => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#120a2a'); g.addColorStop(1, p.fg); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      pix('Rings', c => { const m = Math.min(w, h); c.strokeStyle = p.hot; for (let i = 1; i <= 5; i++) { c.globalAlpha = 0.5 / i; c.lineWidth = m * 0.01; c.beginPath(); c.arc(w / 2, h * 0.42, m * 0.08 * i, 0, Math.PI * 2); c.stroke(); } c.globalAlpha = 1; }),
      text('Date', 'SATURDAY · 8 PM', fit({ x: w / 2, y: h * 0.7, size: T(w, h, 0.3), weight: 700, color: p.hot }, w * 0.8)),
      text('Title', 'LIVE MUSIC', fit({ x: w / 2, y: h * 0.42 - T(w, h) * 0.55, size: T(w, h, 1.1), font: 'Impact, sans-serif' }, w * 0.86))] },
    { id: 'polaroid', name: 'Instant Photo', photo: true, tags: 'polaroid photo memory card', build: (w, h, p) => {
      const m = Math.min(w, h); const cw = m * 0.7, ch = cw * 1.15; const x = (w - cw) / 2, y = (h - ch) / 2;
      return [pix('Background', c => { c.fillStyle = p.bg; c.fillRect(0, 0, w, h); }),
        pix('Card', c => { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x + m * 0.015, y + m * 0.02, cw, ch); c.fillStyle = '#ffffff'; c.fillRect(x, y, cw, ch); }),
        pix('Photo', c => { const pad = cw * 0.07; if (sampleReady) coverImage(c, sampleImg, x + pad, y + pad, cw - pad * 2, cw - pad * 2); }),
        text('Caption', 'best day ever', fit({ x: w / 2, y: y + cw + (ch - cw) * 0.2, size: cw * 0.08, font: "'Segoe Print', 'Comic Sans MS', cursive", color: '#333333' }, cw * 0.86))];
    } },
    { id: 'gradient', name: 'Gradient Hero', tags: 'gradient hero hello colorful', build: (w, h, p) => [
      pix('Background', c => { const g = c.createLinearGradient(0, h, w, 0); g.addColorStop(0, p.fg); g.addColorStop(1, p.hot); c.fillStyle = g; c.fillRect(0, 0, w, h); }),
      text('Subtitle', 'Make something wonderful today', fit({ x: w / 2, y: h * 0.5 + T(w, h) * 0.6, size: T(w, h, 0.3) }, w * 0.8)),
      text('Title', 'Hello, World', fit({ x: w / 2, y: h * 0.5 - T(w, h) * 0.65, size: T(w, h, 1.1), weight: 700 }, w * 0.86))] },
  ];

  const drawText = (ctx, s) => {
    ctx.save(); ctx.fillStyle = s.color || '#fff'; ctx.font = fontOf(s); ctx.textBaseline = 'top'; ctx.textAlign = s.align || 'left';
    String(s.content).split('\n').forEach((line, i) => ctx.fillText(line, s.x || 0, (s.y || 0) + i * s.size * 1.2));
    ctx.restore();
  };

  // ------------------------------------------------------------ settings state
  const UNIT_PER_INCH = { in: 1, cm: 2.54, mm: 25.4, pt: 72 };
  const state = { pxW: 1280, pxH: 720, unit: 'px', dpi: 72, cat: 'Social', preset: null };
  const inW = $('new-doc-width'), inH = $('new-doc-height'), inUnit = $('np-unit'), inDpi = $('np-dpi'), inDpiUnit = $('np-dpi-unit');
  const toPx = (v, unit = state.unit) => unit === 'px' ? v : v * state.dpi / UNIT_PER_INCH[unit];
  const fromPx = (px, unit = state.unit) => unit === 'px' ? px : px * UNIT_PER_INCH[unit] / state.dpi;
  const fmt = (v) => state.unit === 'px' ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
  const clampPx = (v) => Math.max(1, Math.min(10000, Math.round(v || 1)));
  const syncInputs = () => { inW.value = fmt(fromPx(state.pxW)); inH.value = fmt(fromPx(state.pxH)); inUnit.value = state.unit; inDpi.value = inDpiUnit.value === 'cm' ? Math.round(state.dpi / 2.54 * 100) / 100 : state.dpi; updateInfo(); };
  const updateInfo = () => {
    const mb = state.pxW * state.pxH * 4 / 1048576;
    const el = $('np-size-info'); if (!el) return;
    el.textContent = `${state.pxW} × ${state.pxH} px · ${mb < 1 ? (mb * 1024).toFixed(0) + ' KB' : mb.toFixed(1) + ' MB'}`;
    el.classList.toggle('warn', state.pxW * state.pxH > 16_000_000);
    if (state.pxW * state.pxH > 16_000_000) el.textContent += t(' · very large: may be slow on phones', ' · ใหญ่มาก อาจช้าบนมือถือ');
  };
  let tplTimer = 0;
  const queueTemplates = () => { clearTimeout(tplTimer); tplTimer = setTimeout(renderTemplates, 120); };
  const readInputs = () => {
    state.pxW = clampPx(toPx(parseFloat(inW.value) || 1));
    state.pxH = clampPx(toPx(parseFloat(inH.value) || 1));
    state.preset = null; markPreset(); updateInfo(); queueTemplates();
  };
  inW?.addEventListener('input', readInputs); inH?.addEventListener('input', readInputs);
  inUnit?.addEventListener('change', () => { state.unit = inUnit.value; syncInputs(); });
  inDpi?.addEventListener('input', () => { const v = parseFloat(inDpi.value) || 72; state.dpi = Math.max(1, Math.min(2400, inDpiUnit.value === 'cm' ? v * 2.54 : v)); if (state.unit !== 'px') readInputs(); else updateInfo(); });
  inDpiUnit?.addEventListener('change', syncInputs);
  $('np-swap')?.addEventListener('click', () => { [state.pxW, state.pxH] = [state.pxH, state.pxW]; syncInputs(); state.preset = null; markPreset(); queueTemplates(); });
  const bgSel = $('new-doc-bg'), bgColor = $('np-bg-color');
  const syncBg = () => { if (!bgSel || !bgColor) return; const map = { white: '#ffffff', black: '#000000' }; if (map[bgSel.value]) bgColor.value = map[bgSel.value]; bgColor.classList.toggle('transparent', bgSel.value === 'transparent'); };
  bgSel?.addEventListener('change', syncBg);
  bgColor?.addEventListener('input', () => { bgSel.value = 'custom'; syncBg(); });

  // ------------------------------------------------------------ presets
  const catsEl = $('np-cats'), gridEl = $('np-preset-grid');
  const markPreset = () => gridEl?.querySelectorAll('.np-preset').forEach(el => el.classList.toggle('active', el.dataset.key === state.preset));
  function renderCats() {
    if (!catsEl) return;
    catsEl.innerHTML = '';
    Object.keys(PRESETS).forEach(cat => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'np-cat' + (cat === state.cat ? ' active' : '');
      b.textContent = th() ? CAT_TH[cat] : cat; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { state.cat = cat; renderCats(); renderPresets(); });
      catsEl.appendChild(b);
    });
  }
  function renderPresets() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    PRESETS[state.cat].forEach(([name, w, h, unit = 'px', dpi = 72]) => {
      const key = `${state.cat}:${name}`;
      const card = document.createElement('button'); card.type = 'button'; card.className = 'np-preset'; card.dataset.key = key;
      const box = 54; const s = box / Math.max(w, h);
      card.innerHTML = `<span class="np-thumb"><span style="width:${Math.max(4, w * s)}px;height:${Math.max(4, h * s)}px"></span></span><strong></strong><small></small>`;
      card.querySelector('strong').textContent = name;
      card.querySelector('small').textContent = `${w} × ${h} ${unit}`;
      card.addEventListener('click', () => {
        state.unit = unit; state.dpi = dpi;
        state.pxW = clampPx(toPx(w, unit)); state.pxH = clampPx(toPx(h, unit));
        state.preset = key; syncInputs(); markPreset(); queueTemplates();
      });
      gridEl.appendChild(card);
    });
    markPreset();
  }

  // ------------------------------------------------------------ templates
  const listEl = $('np-template-list');
  const visibleTemplates = () => {
    const sym = $('np-with-symbols')?.checked !== false, photo = $('np-with-photo')?.checked !== false;
    const kw = ($('np-keywords')?.value || '').trim().toLowerCase();
    return TEMPLATES.filter(tp => (sym || !tp.symbols) && (photo || !tp.photo) && (!kw || `${tp.name} ${tp.tags}`.toLowerCase().includes(kw)));
  };
  function renderTemplates() {
    if (!listEl) return;
    listEl.innerHTML = '';
    const w = state.pxW, h = state.pxH;
    const maxW = Math.max(160, (listEl.clientWidth || 280) - 8), maxH = 300;
    const s = Math.min(maxW / w, maxH / h);
    const items = visibleTemplates();
    if (!items.length) { listEl.innerHTML = `<p class="np-empty">${t('No templates match.', 'ไม่พบเทมเพลต')}</p>`; return; }
    items.forEach((tp, i) => {
      const pal = PALETTES[(i + paletteOffset) % PALETTES.length];
      const c = make(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
      const ctx = c.getContext('2d'); ctx.setTransform(s, 0, 0, s, 0, 0);
      tp.build(w, h, pal).forEach(spec => { if (spec.draw) { ctx.save(); spec.draw(ctx, w, h); ctx.restore(); } else drawText(ctx, spec.text); });
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'np-template';
      btn.title = t(`Open "${tp.name}" as template.psd`, `เปิด "${tp.name}" เป็น template.psd`);
      btn.appendChild(c);
      const label = document.createElement('span'); label.textContent = tp.name; btn.appendChild(label);
      btn.addEventListener('click', () => openTemplate(tp, pal));
      listEl.appendChild(btn);
    });
  }
  ['np-with-symbols', 'np-with-photo'].forEach(id => $(id)?.addEventListener('change', renderTemplates));
  $('np-keywords')?.addEventListener('input', queueTemplates);
  $('np-shuffle')?.addEventListener('click', () => { paletteOffset = (paletteOffset + 1) % PALETTES.length; renderTemplates(); });

  function openTemplate(tp, pal) {
    const w = state.pxW, h = state.pxH;
    engine.newDocument('template.psd', w, h, 'transparent');
    engine.dpi = Math.round(state.dpi);
    engine.layers = [];
    tp.build(w, h, pal).forEach(spec => {
      const layer = new Layer(spec.name, w, h);
      if (spec.draw) spec.draw(layer.ctx, w, h);
      else { layer.textData = { ...spec.text }; if (app.renderTextLayer) app.renderTextLayer(layer); else drawText(layer.ctx, spec.text); }
      engine.layers.push(layer);
    });
    engine.activeLayerIndex = engine.layers.length - 1;
    engine.centerAndFitViewport(); engine.render(); engine.emit('layerChange');
    history.clear(); history.captureSnapshot('Open template.psd');
    closeNewProject();
    notice(t(`template.psd opened (${tp.name}) · edit the text in Studio → Text`, `เปิด template.psd แล้ว (${tp.name}) · แก้ข้อความได้ที่ สตูดิโอ → ข้อความ`));
  }

  // ------------------------------------------------------------ open / create
  const modal = $('modal-new-doc');
  const LABELS = { title: ['New Project', 'โปรเจกต์ใหม่'], symbols: ['With Symbols', 'มีรูปทรง'], photo: ['With Photo', 'มีรูปภาพ'], keywords: ['Keywords:', 'คำค้น:'], name: ['Name', 'ชื่อ'], width: ['Width', 'กว้าง'], height: ['Height', 'สูง'], background: ['Background', 'พื้นหลัง'], create: ['Create', 'สร้าง'], hint: ['Tip: click a template on the left to open it as template.psd with editable layers.', 'เคล็ดลับ: คลิกเทมเพลตด้านซ้ายเพื่อเปิดเป็น template.psd ที่แก้ไขเลเยอร์ได้'] };
  const applyLabels = () => {
    document.querySelectorAll('[data-np]').forEach(el => { const l = LABELS[el.dataset.np]; if (l) el.textContent = th() ? l[1] : l[0]; });
    const cropLabels = { mode: ['Crop:', 'ครอบตัด:'], source: ['From:', 'จาก:'] };
    document.querySelectorAll('[data-crop-i18n]').forEach(el => { const l = cropLabels[el.dataset.cropI18n]; if (l) el.textContent = th() ? l[1] : l[0]; });
    const opts = { layer: ['New layer (keep original)', 'เลเยอร์ใหม่ (รูปเดิมไม่หาย)'], canvas: ['Crop whole canvas', 'ครอบทั้งเอกสาร'] };
    $('opt-crop-mode')?.querySelectorAll('option').forEach(o => { const l = opts[o.value]; if (l) o.textContent = th() ? l[1] : l[0]; });
    const src = { layer: ['Selected layer', 'เลเยอร์ที่เลือก'], visible: ['All visible layers', 'ทุกเลเยอร์ที่มองเห็น'] };
    $('opt-crop-source')?.querySelectorAll('option').forEach(o => { const l = src[o.value]; if (l) o.textContent = th() ? l[1] : l[0]; });
  };
  window.addEventListener('photoearnai:language', () => { applyLabels(); renderCats(); if (modal?.classList.contains('open')) renderTemplates(); });
  applyLabels();

  function openNewProject() {
    closeMenus();
    modal?.classList.add('open');
    syncInputs(); syncBg(); renderCats(); renderPresets();
    requestAnimationFrame(renderTemplates);
  }
  function closeNewProject() { modal?.classList.remove('open'); }
  // Replace the old listeners on the menu / dropzone with the full dialog.
  ['menu-new-doc', 'btn-dropzone-new'].forEach(id => { const el = $(id); if (!el) return; const clone = el.cloneNode(true); el.replaceWith(clone); clone.addEventListener('click', (e) => { e.stopPropagation(); openNewProject(); }); });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n' && modal?.classList.contains('open')) e.preventDefault();
    if (e.key === 'Escape' && modal?.classList.contains('open')) closeNewProject();
    if (e.key === 'Enter' && modal?.classList.contains('open') && e.target?.tagName === 'INPUT') { e.preventDefault(); $('btn-create-doc')?.click(); }
  });
  modal?.addEventListener('pointerdown', (e) => { if (e.target === modal) closeNewProject(); });

  $('btn-create-doc')?.addEventListener('click', () => {
    readInputs();
    const name = ($('new-doc-name')?.value || '').trim() || 'New Project';
    const bg = bgSel?.value === 'custom' ? (bgColor?.value || '#ffffff') : (bgSel?.value || 'white');
    engine.newDocument(name, state.pxW, state.pxH, bg);
    engine.dpi = Math.round(state.dpi);
    engine.render(); engine.emit('layerChange');
    history.clear(); history.captureSnapshot('New Project');
    closeNewProject();
    notice(t(`New project ${state.pxW} × ${state.pxH} px created · File → Open Image as Layers adds pictures`, `สร้างโปรเจกต์ใหม่ ${state.pxW} × ${state.pxH} px แล้ว · เพิ่มรูปได้ที่ ไฟล์ → เปิดรูปภาพเป็นเลเยอร์`));
  });
  Object.assign(app, { openNewProject });

  // =========================================================================
  // Exports
  // =========================================================================
  const run = async (label, fn) => {
    closeMenus();
    try { const r = await fn(); if (r) notice(t(`${r} saved`, `บันทึก ${r} แล้ว`)); }
    catch (err) { fail(err); }
  };
  const ffmpegEncode = async (inputName, inputBlob, args, outName) => {
    const video = app.video || new FfmpegWasmAdapter(engine);
    notice(t('Preparing the encoder (first time takes a while)...', 'กำลังเตรียมตัวแปลงไฟล์ (ครั้งแรกอาจใช้เวลาสักครู่)...'), 6000);
    const ff = await video.load();
    await ff.writeFile(inputName, new Uint8Array(await inputBlob.arrayBuffer()));
    await ff.exec(args);
    return ff.readFile(outName);
  };

  // ---- WEBP
  async function exportWebp() {
    const c = flatten();
    let blob = await canvasToBlob(c, 'image/webp', 0.92);
    if (!blob || blob.type !== 'image/webp') {
      // Safari can't encode WEBP from a canvas: encode with ffmpeg instead.
      const png = await canvasToBlob(c, 'image/png');
      const data = await ffmpegEncode('in.png', png, ['-i', 'in.png', '-c:v', 'libwebp', '-quality', '90', 'out.webp'], 'out.webp');
      blob = new Blob([data], { type: 'image/webp' });
    }
    const name = `${baseName()}.webp`; download(blob, name); return name;
  }

  // ---- BMP (24-bit, flattened on white)
  function bmpBlob(canvas) {
    const w = canvas.width, h = canvas.height; const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const row = (w * 3 + 3) & ~3; const size = 54 + row * h; const buf = new ArrayBuffer(size); const v = new DataView(buf); const u8 = new Uint8Array(buf);
    const ppm = Math.round((engine.dpi || 72) / 0.0254);
    v.setUint8(0, 0x42); v.setUint8(1, 0x4d); v.setUint32(2, size, true); v.setUint32(10, 54, true);
    v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
    v.setUint32(30, 0, true); v.setUint32(34, row * h, true); v.setInt32(38, ppm, true); v.setInt32(42, ppm, true);
    for (let y = 0; y < h; y++) {
      const o = 54 + (h - 1 - y) * row;
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u8[o + x * 3] = src[i + 2]; u8[o + x * 3 + 1] = src[i + 1]; u8[o + x * 3 + 2] = src[i]; }
    }
    return new Blob([buf], { type: 'image/bmp' });
  }
  async function exportBmp() { const name = `${baseName()}.bmp`; download(bmpBlob(flatten('#ffffff')), name); return name; }

  // ---- SVG (one group per layer; text layers stay real, editable SVG text)
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
  const blendCss = (m) => m === 'source-over' ? 'normal' : m;
  async function exportSvg() {
    const W = engine.width, H = engine.height;
    const parts = [`<?xml version="1.0" encoding="UTF-8"?>`, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, `<title>${esc(engine.docName)}</title>`];
    for (const layer of engine.layers) {
      if (layer.group || layer.adjustment) continue;
      const attrs = [`id="${esc(layer.id)}"`, `inkscape:groupmode="layer"`, `inkscape:label="${esc(layer.name)}"`];
      if (layer.opacity < 1) attrs.push(`opacity="${layer.opacity.toFixed(3)}"`);
      const style = []; if (!layer.visible) style.push('display:none'); if (layer.blendMode !== 'source-over') style.push(`mix-blend-mode:${blendCss(layer.blendMode)}`);
      if (style.length) attrs.push(`style="${style.join(';')}"`);
      parts.push(`<g ${attrs.join(' ')}>`);
      const tx = layer.textData;
      if (tx && tx.content && !layer.mask) {
        const size = tx.size || 48; const anchor = tx.align === 'center' ? 'middle' : tx.align === 'right' ? 'end' : 'start';
        const fam = esc(tx.font || 'Arial, sans-serif');
        String(tx.content).split('\n').forEach((line, i) => {
          parts.push(`<text x="${(layer.x + (tx.x || 0)).toFixed(1)}" y="${(layer.y + (tx.y || 0) + size * 0.8 + i * size * 1.2).toFixed(1)}" font-family="${fam}" font-size="${size}" font-weight="${tx.weight || 400}"${tx.style ? ` font-style="${esc(tx.style)}"` : ''} fill="${esc(tx.color || '#000')}" text-anchor="${anchor}">${esc(line)}</text>`);
        });
      } else {
        const png = layer.getRenderSource().toDataURL('image/png');
        parts.push(`<image x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" xlink:href="${png}" href="${png}"/>`);
      }
      parts.push('</g>');
    }
    parts.push('</svg>');
    const name = `${baseName()}.svg`; download(new Blob([parts.join('\n')], { type: 'image/svg+xml' }), name); return name;
  }

  // ---- AI (PDF-compatible Illustrator file; Illustrator, Inkscape, Affinity and Photopea open it)
  async function exportAi() {
    const c = flatten('#ffffff');
    const jpg = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.95)).arrayBuffer());
    const dpi = engine.dpi || 72; const wPt = (c.width * 72 / dpi).toFixed(2), hPt = (c.height * 72 / dpi).toFixed(2);
    const enc = new TextEncoder(); const chunks = []; const offsets = []; let pos = 0;
    const push = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
    const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /ArtBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(6, () => push(`<< /Title (${baseName().replace(/[()\\]/g, '')}) /Creator (PhotoEarnAI) /Producer (PhotoEarnAI) >>`));
    const xref = pos;
    push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const name = `${baseName()}.ai`; download(new Blob(chunks, { type: 'application/pdf' }), name); return name;
  }

  // ---- APNG (video frame layers become animation frames; otherwise a single-frame PNG)
  const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length); const v = new DataView(out.buffer);
    v.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8); v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
  };
  const parsePng = (bytes) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 8; let ihdr = null; const idat = [];
    while (p < bytes.length) { const len = v.getUint32(p); const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8)); const data = bytes.subarray(p + 8, p + 8 + len); if (type === 'IHDR') ihdr = data; else if (type === 'IDAT') idat.push(data); p += 12 + len; }
    return { ihdr, idat };
  };
  const frameCanvases = () => {
    const frames = app.video?.getVideoFrames?.() || [];
    if (!frames.length) return [{ canvas: flatten(), delay: 0 }];
    return frames.map(f => { const c = make(engine.width, engine.height); app.video.composeFrame(f, c.getContext('2d')); return { canvas: c, delay: f.frameDelay || 500 }; });
  };
  async function exportApng() {
    const frames = frameCanvases();
    const out = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]; let seq = 0;
    for (let i = 0; i < frames.length; i++) {
      const png = parsePng(new Uint8Array(await (await canvasToBlob(frames[i].canvas, 'image/png')).arrayBuffer()));
      if (i === 0) { out.push(chunk('IHDR', png.ihdr)); const ac = new Uint8Array(8); const av = new DataView(ac.buffer); av.setUint32(0, frames.length); av.setUint32(4, 0); out.push(chunk('acTL', ac)); }
      const fc = new Uint8Array(26); const fv = new DataView(fc.buffer);
      fv.setUint32(0, seq++); fv.setUint32(4, engine.width); fv.setUint32(8, engine.height); fv.setUint32(12, 0); fv.setUint32(16, 0);
      fv.setUint16(20, Math.min(65535, frames[i].delay || 100)); fv.setUint16(22, 1000); fc[24] = 0; fc[25] = 0;
      out.push(chunk('fcTL', fc));
      for (const d of png.idat) {
        if (i === 0) out.push(chunk('IDAT', d));
        else { const fd = new Uint8Array(4 + d.length); new DataView(fd.buffer).setUint32(0, seq++); fd.set(d, 4); out.push(chunk('fdAT', fd)); }
      }
    }
    out.push(chunk('IEND', new Uint8Array(0)));
    const name = `${baseName()}${frames.length > 1 ? '-animated' : ''}.png`; download(new Blob(out, { type: 'image/apng' }), name);
    return frames.length > 1 ? `${name} (${frames.length} frames)` : name;
  }

  // ---- ICO (PNG-compressed icons 16…256 px)
  async function exportIco() {
    const src = flatten(); const sizes = [16, 24, 32, 48, 64, 128, 256]; const images = [];
    for (const s of sizes) {
      const c = make(s, s); const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      const k = Math.min(s / src.width, s / src.height); const w = src.width * k, h = src.height * k;
      ctx.drawImage(src, (s - w) / 2, (s - h) / 2, w, h);
      images.push(new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer()));
    }
    const header = new Uint8Array(6 + 16 * sizes.length); const v = new DataView(header.buffer);
    v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true); let offset = header.length;
    sizes.forEach((s, i) => { const o = 6 + i * 16; header[o] = s >= 256 ? 0 : s; header[o + 1] = s >= 256 ? 0 : s; v.setUint16(o + 4, 1, true); v.setUint16(o + 6, 32, true); v.setUint32(o + 8, images[i].length, true); v.setUint32(o + 12, offset, true); offset += images[i].length; });
    const name = `${baseName()}.ico`; download(new Blob([header, ...images], { type: 'image/x-icon' }), name); return name;
  }

  // ---- WEBM (video frame layers, or a 3-second clip of the picture)
  async function exportWebm() {
    const frames = frameCanvases(); const still = frames.length === 1 && !frames[0].delay;
    const maxSide = 1920; const k = Math.min(1, maxSide / Math.max(engine.width, engine.height));
    const w = Math.max(2, Math.round(engine.width * k / 2) * 2), h = Math.max(2, Math.round(engine.height * k / 2) * 2);
    const c = make(w, h); const ctx = c.getContext('2d');
    const mime = typeof MediaRecorder !== 'undefined' && c.captureStream ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) : null;
    const name = `${baseName()}.webm`;
    if (mime) {
      notice(t('Recording WEBM…', 'กำลังบันทึก WEBM…'), 3000);
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 }); const parts = [];
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      const stopped = new Promise((res, rej) => { rec.onstop = res; rec.onerror = () => rej(new Error('Video recorder failed')); });
      const paint = (f) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(f.canvas, 0, 0, w, h); };
      paint(frames[0]); rec.start(200);
      for (const f of frames) {
        const hold = still ? 3000 : (f.delay || 500); const end = performance.now() + hold;
        while (performance.now() < end) { paint(f); await new Promise(r => setTimeout(r, 33)); }
      }
      rec.stop(); await stopped;
      download(new Blob(parts, { type: 'video/webm' }), name); return name;
    }
    // Browsers without a WEBM recorder (Safari): encode with ffmpeg.
    const video = app.video || new FfmpegWasmAdapter(engine); const ff = await video.load();
    for (let i = 0; i < frames.length; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(frames[i].canvas, 0, 0, w, h); await ff.writeFile(`w-${String(i + 1).padStart(3, '0')}.png`, new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer())); }
    const rate = still ? '1' : String(Math.max(0.1, 1000 / (frames[0].delay || 500)));
    const args = still ? ['-loop', '1', '-t', '3', '-i', 'w-001.png', '-r', '10', '-c:v', 'libvpx', '-b:v', '2M', '-pix_fmt', 'yuv420p', 'out.webm'] : ['-framerate', rate, '-i', 'w-%03d.png', '-c:v', 'libvpx', '-b:v', '2M', '-pix_fmt', 'yuv420p', 'out.webm'];
    await ff.exec(args); const data = await ff.readFile('out.webm');
    download(new Blob([data], { type: 'video/webm' }), name); return name;
  }

  const bind = (id, label, fn) => $(id)?.addEventListener('click', () => run(label, fn));
  bind('menu-export-webp', 'WEBP', exportWebp);
  bind('menu-export-bmp', 'BMP', exportBmp);
  bind('menu-export-svg', 'SVG', exportSvg);
  bind('menu-export-ai', 'AI', exportAi);
  bind('menu-export-apng', 'APNG', exportApng);
  bind('menu-export-ico', 'ICO', exportIco);
  bind('menu-export-webm', 'WEBM', exportWebm);
  Object.assign(app, { exporters: { webp: exportWebp, bmp: exportBmp, svg: exportSvg, ai: exportAi, apng: exportApng, ico: exportIco, webm: exportWebm } });
});
