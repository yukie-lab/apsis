/**
 * Name labels of the 3D scene: HTML elements above the canvas. A label is a button: the user selects it to look
 * at its object. Labels that would cover a label with a higher priority are not shown.
 */
export interface LabelStyle { priority: number; className?: string }

interface Item { el: HTMLButtonElement; text: string; width: number; used: boolean }

export class Labels {
  private readonly items = new Map<string, Item>();
  private readonly boxes: number[] = [];

  constructor(private readonly layer: HTMLElement, private readonly onPick: (id: string) => void) {}

  begin(): void {
    this.boxes.length = 0;
    for (const it of this.items.values()) it.used = false;
  }
  /** x, y: position of the object on the screen, CSS pixels from the top left corner of the layer. */
  place(id: string, text: string, x: number, y: number, className = ''): boolean {
    let it = this.items.get(id);
    if (!it) {
      const el = document.createElement('button');
      el.type = 'button';
      el.addEventListener('click', () => this.onPick(id));
      // A drag on the view must be possible from a label: the label does not keep the pointer.
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.layer.appendChild(el);
      it = { el, text: '', width: 0, used: false };
      this.items.set(id, it);
    }
    if (it.text !== text) { it.text = text; it.el.textContent = text; it.width = 0; }
    const cls = 'lbl ' + className;
    if (it.el.className !== cls) { it.el.className = cls; it.width = 0; }
    if (!it.width) it.width = it.el.offsetWidth || 7 * text.length + 12;
    const x0 = x + 9, y0 = y - 9, x1 = x0 + it.width, y1 = y0 + 18;
    const b = this.boxes;
    for (let k = 0; k < b.length; k += 4) {
      if (x0 < b[k + 2] && x1 > b[k] && y0 < b[k + 3] && y1 > b[k + 1]) return false;
    }
    b.push(x0, y0, x1, y1);
    it.used = true;
    it.el.style.transform = `translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px)`;
    if (it.el.hidden) it.el.hidden = false;
    return true;
  }
  end(): void {
    for (const it of this.items.values()) if (!it.used && !it.el.hidden) it.el.hidden = true;
  }
  dispose(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
  }
}
