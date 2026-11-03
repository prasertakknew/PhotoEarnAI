/**
 * HistoryManager - multi-step Undo / Redo.
 *
 * Model: call captureSnapshot(name) right BEFORE a change. Each undo entry keeps
 * the document as it was before that change, so Undo restores it and moves the
 * current document onto the redo stack (and Redo does the reverse). Whole layers
 * are cloned, so masks, text data, styles, size changes (crop) and layer order
 * all come back exactly.
 */
class HistoryManager {
  constructor(engine, historyListElement) {
    this.engine = engine;
    this.listEl = historyListElement;
    this.undoStack = [];
    this.redoStack = [];
    this.maxStates = 40;
    this.baseName = 'Open Document';
    // The first capture after a fresh start/clear only names the starting point.
    this.pendingBaseline = true;
  }

  serialize() {
    const e = this.engine;
    return {
      width: e.width,
      height: e.height,
      docName: e.docName,
      activeLayerIndex: e.activeLayerIndex,
      layers: e.layers.map((l) => { const c = l.clone(l.name); c.id = l.id; return c; })
    };
  }

  /**
   * Record the current document as the state to return to when the next change is undone.
   */
  captureSnapshot(actionName = 'Edit') {
    if (this.pendingBaseline) {
      this.pendingBaseline = false;
      this.baseName = actionName;
      this.updateUI();
      return;
    }
    this.undoStack.push({ name: actionName, state: this.serialize() });
    if (this.undoStack.length > this.maxStates) this.undoStack.shift();
    this.redoStack = [];
    this.updateUI();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ name: entry.name, state: this.serialize() });
    this.restoreState(entry.state);
    this.updateUI();
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ name: entry.name, state: this.serialize() });
    this.restoreState(entry.state);
    this.updateUI();
    return true;
  }

  /** Drop the most recent undo step without restoring it (used when a stroke is cancelled). */
  discardLast() {
    const entry = this.undoStack.pop();
    if (entry) this.restoreState(entry.state);
    this.updateUI();
  }

  /** Jump to a history position: 0 = starting point, n = after the n-th step. */
  jumpTo(position) {
    let guard = 200;
    while (this.undoStack.length > position && guard--) this.undo();
    while (this.undoStack.length < position && this.redoStack.length && guard--) this.redo();
  }

  restoreState(state) {
    const e = this.engine;
    if (state.width !== e.width || state.height !== e.height) {
      e.width = state.width; e.height = state.height;
      e.displayCanvas.width = state.width; e.displayCanvas.height = state.height;
      e.centerAndFitViewport();
    }
    e.layers = state.layers.map((l) => { const c = l.clone(l.name); c.id = l.id; return c; });
    e.activeLayerIndex = Math.max(0, Math.min(state.activeLayerIndex, e.layers.length - 1));
    e.render();
    e.emit('layerChange');
    e.emit('historyChange');
  }

  updateUI() {
    this.engine.emit?.('historyChange');
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    const position = this.undoStack.length;
    const addItem = (label, pos, dimmed) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item' + (pos === position ? ' active' : '') + (dimmed ? ' dimmed' : '');
      itemEl.textContent = label;
      itemEl.title = dimmed ? 'Click to redo up to here' : 'Click to go back to here';
      itemEl.addEventListener('click', () => this.jumpTo(pos));
      this.listEl.appendChild(itemEl);
    };
    addItem(this.baseName, 0, false);
    this.undoStack.forEach((entry, idx) => addItem(entry.name, idx + 1, false));
    this.redoStack.slice().reverse().forEach((entry, idx) => addItem(entry.name, position + idx + 1, true));
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  /**
   * clear() before loading a new document: the next capture names the start.
   * clear('Name') to forget steps but keep the current document as the start.
   */
  clear(baseName) {
    this.undoStack = [];
    this.redoStack = [];
    if (baseName) { this.baseName = baseName; this.pendingBaseline = false; }
    else this.pendingBaseline = true;
    this.updateUI();
  }
}

window.HistoryManager = HistoryManager;
