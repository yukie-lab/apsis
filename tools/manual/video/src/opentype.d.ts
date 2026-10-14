// The parts of opentype.js 2.0.0 that the video frames use (the package has no type declarations).
declare module 'opentype.js' {
  export interface PathData { toPathData(options: { decimalPlaces?: number; flipY?: boolean }): string }
  export interface Glyph { advanceWidth?: number; getPath(x: number, y: number, fontSize: number): PathData }
  export interface Font {
    unitsPerEm: number;
    hasChar(c: string): boolean;
    charToGlyph(c: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
