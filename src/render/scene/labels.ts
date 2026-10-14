/**
 * Name labels of the 3D scene: HTML elements above the canvas. A label is a button: the user selects it to look
 * at its object. A label that would cover a label or a mark with a higher priority is not shown.
 */
interface Item { el: HTMLButtonElement; text: string; width: number; used: boolean; left: boolean }
interface Request { id: string; text: string; x: number; y: number; className: string; xLeft: number; priority: number; y2: number }

/** Half of the width of the mark of an object (CSS pixels). The box of a label includes the mark. */
const MARK = 6;
/** A label on the left side goes back to the right side when the right side is free with this margin (CSS pixels). */
const SIDE_MARGIN = 12;

export class Labels {
  private readonly items = new Map<string, Item>();
  private readonly boxes: number[] = [];
  private readonly requests: Request[] = [];
  private count = 0;
  private width = 0;
  private readonly covered: number[] = [];
  private measured = -1e9;

  constructor(private readonly layer: HTMLElement, private readonly onPick: (id: string) => void) {}

  /** Boxes of the panels above the view (the elements with the attribute data-cover): the view shows no name there. */
  private measure(): void {
    this.covered.length = 0;
    const root = this.layer.parentElement;
    if (!root) return;
    const o = this.layer.getBoundingClientRect();
    for (const el of root.querySelectorAll('[data-cover]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.covered.push(r.left - o.left, r.top - o.top, r.right - o.left, r.bottom - o.top);
    }
  }
  /** width: width of the layer (CSS pixels). */
  begin(width = 0): void {
    this.width = width;
    // The panels move rarely: four measurements each second are sufficient.
    const now = performance.now();
    if (now - this.measured > 250) { this.measured = now; this.measure(); }
    this.boxes.length = 0;
    for (const v of this.covered) this.boxes.push(v);
    this.count = 0;
    for (const it of this.items.values()) it.used = false;
  }
  /**
   * Adds a label for this frame. The labels get their positions in end(), in the sequence of their priority.
   * x, y: position of the object on the screen, CSS pixels from the top left corner of the layer.
   * xLeft: position for a label on the left side of the object. A label is on the right side of its object. If
   * the label would go across the right edge of the layer there, or would cover a label or a mark, it is on the
   * left side. A label shows only if one of the two sides is free.
   * priority: a label with a larger number gets its position first.
   * y2: a second position for the label, used if the two sides are not free at y (NaN = no second position).
   */
  place(id: string, text: string, x: number, y: number, className = '', xLeft = x, priority = 0, y2 = NaN): void {
    let r = this.requests[this.count];
    if (!r) { r = { id, text, x, y, className, xLeft, priority, y2 }; this.requests.push(r); }
    else { r.id = id; r.text = text; r.x = x; r.y = y; r.className = className; r.xLeft = xLeft; r.priority = priority; r.y2 = y2; }
    this.count++;
  }
  private free(x0: number, y0: number, x1: number, y1: number): boolean {
    const b = this.boxes;
    for (let k = 0; k < b.length; k += 4) {
      if (x0 < b[k + 2] && x1 > b[k] && y0 < b[k + 3] && y1 > b[k + 1]) return false;
    }
    return true;
  }
  private put(r: Request, y: number): boolean {
    let it = this.items.get(r.id);
    if (!it) {
      const el = document.createElement('button');
      const id = r.id;
      el.type = 'button';
      el.addEventListener('click', () => this.onPick(id));
      // A drag on the view must be possible from a label: the label does not keep the pointer.
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.hidden = true;
      this.layer.appendChild(el);
      it = { el, text: '', width: 0, used: false, left: false };
      this.items.set(id, it);
    }
    if (it.text !== r.text) { it.text = r.text; it.el.textContent = r.text; it.width = 0; }
    const cls = 'lbl ' + r.className;
    if (it.el.className !== cls) { it.el.className = cls; it.width = 0; }
    if (!it.width) {
      // A hidden element has no size.
      const hidden = it.el.hidden;
      if (hidden) { it.el.style.visibility = 'hidden'; it.el.hidden = false; }
      it.width = it.el.offsetWidth || 7 * r.text.length + 12;
      if (hidden) { it.el.hidden = true; it.el.style.visibility = ''; }
    }
    // Box of the label and its mark, on the right side and on the left side of the mark.
    const w = it.width, y0 = y - 9, y1 = y0 + 18;
    const r0 = r.x - MARK, r1 = r.x + 9 + w, l0 = r.xLeft - 9 - w, l1 = r.xLeft + MARK;
    const inLeft = l0 >= 0, inRight = this.width <= 0 || r1 <= this.width || !inLeft;
    // A label that is on the left side stays there while the right side is not free with a margin: a label
    // must not go from side to side when two objects move near each other.
    const m = it.left ? SIDE_MARGIN : 0;
    let right = inRight && this.free(r0 - m, y0 - m, r1 + m, y1 + m);
    const left = !right && inLeft && this.free(l0, y0, l1, y1);
    if (!right && !left && m > 0) right = inRight && this.free(r0, y0, r1, y1);
    if (!right && !left) return false;
    it.left = !right;
    const x0 = right ? r.x + 9 : l0;
    this.boxes.push(right ? r0 : l0, y0, right ? r1 : l1, y1);
    it.used = true;
    it.el.style.transform = `translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px)`;
    if (it.el.hidden) it.el.hidden = false;
    return true;
  }
  end(): void {
    // The sort keeps the sequence of the calls for labels with the same priority.
    const list = this.requests.slice(0, this.count).sort((a, b) => b.priority - a.priority);
    for (const r of list) if (!this.put(r, r.y) && r.y2 === r.y2) this.put(r, r.y2);
    for (const it of this.items.values()) if (!it.used && !it.el.hidden) it.el.hidden = true;
  }
  dispose(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
    this.requests.length = 0;
    this.count = 0;
  }
}
