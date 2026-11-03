/**
 * Small-screen helpers: slide-in Layers/History panel, two-finger pinch zoom/pan,
 * and keeping the canvas fitted when the screen rotates.
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = window.photoearnai;
  if (!app) return;
  const { engine, tools } = app;
  const body = document.body;
  const toggle = document.getElementById('btn-toggle-dock');
  const vp = engine.viewport;
  const small = () => window.matchMedia('(max-width: 900px)').matches;

  const setDock = (open) => {
    body.classList.toggle('dock-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
  };
  app.openDock = () => { if (small()) setDock(true); };
  toggle?.addEventListener('click', (e) => { e.stopPropagation(); setDock(!body.classList.contains('dock-open')); });
  vp.addEventListener('pointerdown', () => { if (small() && body.classList.contains('dock-open')) setDock(false); }, true);
  window.matchMedia('(max-width: 900px)').addEventListener('change', (e) => { if (!e.matches) setDock(false); });

  // ---------------------------------------------------------------- pinch zoom
  const touches = new Map();
  const suppressed = new Set();
  let pinch = null;
  const rel = (p) => { const r = vp.getBoundingClientRect(); return { x: p.x - r.left, y: p.y - r.top }; };
  const pair = () => { const [a, b] = [...touches.values()]; return { mid: rel({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !vp.contains(e.target)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      // Second finger: cancel whatever the first finger started and zoom/pan instead.
      tools.cancelStroke();
      tools.isPanning = false;
      const { mid, dist } = pair();
      pinch = { mid, dist, zoom: engine.zoom, panX: engine.panX, panY: engine.panY };
      touches.forEach((_, id) => suppressed.add(id));
      e.stopImmediatePropagation();
    } else if (touches.size > 2) {
      suppressed.add(e.pointerId);
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {
      const { mid, dist } = pair();
      const zoom = Math.max(0.05, Math.min(10, pinch.zoom * dist / pinch.dist));
      const docX = (pinch.mid.x - pinch.panX) / pinch.zoom;
      const docY = (pinch.mid.y - pinch.panY) / pinch.zoom;
      engine.zoom = zoom;
      engine.panX = mid.x - docX * zoom;
      engine.panY = mid.y - docY * zoom;
      engine.updateStageTransform();
    }
    if (suppressed.has(e.pointerId)) e.stopImmediatePropagation();
  }, true);

  const end = (e) => {
    if (e.pointerType !== 'touch') return;
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (suppressed.has(e.pointerId)) { suppressed.delete(e.pointerId); e.stopImmediatePropagation(); }
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);

  // Stop iOS Safari from zooming the whole page with a pinch or double tap.
  ['gesturestart', 'gesturechange'].forEach((type) => document.addEventListener(type, (e) => e.preventDefault(), { passive: false }));
  window.addEventListener('orientationchange', () => setTimeout(() => engine.centerAndFitViewport(), 250));
});
