class BrushEngine {
  constructor() { this.settings = { size: 18, opacity: 1, hardness: .8, spacing: .18, scatter: 0, jitter: 0, texture: 0, dynamics: true, seed: 1 }; }
  configure(next = {}) { Object.assign(this.settings, next); }
  stamp(ctx, x, y, color, pressure = 1, erase = false) {
    const s = this.settings; const radius = Math.max(1, s.size * (s.dynamics ? (.55 + pressure * .45) : 1) / 2); const count = 1 + Math.round(s.scatter * 8); ctx.save(); ctx.globalAlpha = s.opacity * pressure; ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    for (let i = 0; i < count; i++) { const a = i ? Math.random() * Math.PI * 2 : 0; const d = i ? Math.random() * s.scatter * radius * 4 : 0; const px = x + Math.cos(a) * d; const py = y + Math.sin(a) * d; const gradient = ctx.createRadialGradient(px, py, radius * Math.max(0, s.hardness), px, py, radius); gradient.addColorStop(0, color); gradient.addColorStop(1, erase ? 'rgba(0,0,0,0)' : `${color}00`); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill(); if (s.texture) { ctx.globalAlpha *= .55; ctx.fillStyle = `rgba(255,255,255,${s.texture * .18})`; for (let j = 0; j < 3; j++) ctx.fillRect(px + (Math.random() - .5) * radius, py + (Math.random() - .5) * radius, 1, 1); } }
    ctx.restore();
  }
  stroke(ctx, points, color, pressure = 1, erase = false) { if (points.length < 1) return; const step = Math.max(1, this.settings.size * (1 - this.settings.spacing)); for (let i = 0; i < points.length; i++) { if (i % Math.ceil(step / 2) === 0 || i === points.length - 1) this.stamp(ctx, points[i].x, points[i].y, color, pressure, erase); } }
}
window.BrushEngine = new BrushEngine();
