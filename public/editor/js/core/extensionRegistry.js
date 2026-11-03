class ExtensionRegistry {
  static STORAGE_KEY = 'photoearnai.extensions.v1';
  static LIMITS = { tools: 24, presets: 48, filters: 32, plugins: 24, fonts: 48, watermarks: 12 };
  constructor() {
    this.data = { version: 1, tools: [], presets: [], filters: [], plugins: [], fonts: [], watermarks: [] };
    this.load();
  }
  load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ExtensionRegistry.STORAGE_KEY) || '{}');
      for (const key of Object.keys(this.data)) {
        if (key !== 'version' && Array.isArray(parsed[key])) this.data[key] = parsed[key].slice(0, ExtensionRegistry.LIMITS[key]);
      }
    } catch (error) {
      console.warn('PhotoEarnAI extension store reset:', error);
    }
  }
  persist() {
    try { localStorage.setItem(ExtensionRegistry.STORAGE_KEY, JSON.stringify(this.data)); }
    catch (error) { console.warn('PhotoEarnAI extension store unavailable:', error); }
  }
  normalizeName(name, fallback = 'Untitled extension') {
    return String(name || fallback).trim().replace(/\s+/g, ' ').slice(0, 64) || fallback;
  }
  add(type, record) {
    if (!Object.prototype.hasOwnProperty.call(this.data, type)) throw new Error(`Unknown extension type: ${type}`);
    if (this.data[type].length >= ExtensionRegistry.LIMITS[type]) throw new Error(`${type} limit reached`);
    const next = { id: `${type}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString(), ...record };
    next.name = this.normalizeName(next.name);
    this.data[type].push(next);
    this.persist();
    return next;
  }
  remove(type, id) {
    if (!this.data[type]) return false;
    const before = this.data[type].length;
    this.data[type] = this.data[type].filter((item) => item.id !== id);
    if (this.data[type].length !== before) this.persist();
    return before !== this.data[type].length;
  }
  list(type) { return this.data[type] ? [...this.data[type]] : []; }
  export() { return JSON.parse(JSON.stringify(this.data)); }
  import(snapshot) {
    if (!snapshot || snapshot.version !== 1) throw new Error('Unsupported extension snapshot');
    for (const type of Object.keys(this.data)) {
      if (type !== 'version' && Array.isArray(snapshot[type])) this.data[type] = snapshot[type].slice(0, ExtensionRegistry.LIMITS[type]);
    }
    this.persist();
  }
  find(type, id) { return this.data[type]?.find((item) => item.id === id) || null; }
}
window.ExtensionRegistry = ExtensionRegistry;
