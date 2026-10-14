// TeX formula -> SVG paths (MathJax, New Computer Modern glyphs). The SVG has no font: each glyph is a path.
import { mathjax } from '@mathjax/src/mjs/mathjax.js';
import { TeX } from '@mathjax/src/mjs/input/tex.js';
import { SVG } from '@mathjax/src/mjs/output/svg.js';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/mjs/handlers/html.js';
import '@mathjax/src/mjs/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/mjs/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/mjs/input/tex/html/HtmlConfiguration.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/mjs/svg.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'color', 'html'] }),
  OutputJax: new SVG({ fontData: MathJaxNewcmFont, fontCache: 'none' }),
});
const cache = new Map();

/** SVG text of a formula (the outer <svg> element only). */
export async function texToSvg(src, display = true) {
  const key = (display ? 'D' : 'I') + src;
  if (!cache.has(key)) {
    const node = await doc.convertPromise(src, { display });
    const html = adaptor.outerHTML(node);
    const start = html.indexOf('<svg'), end = html.lastIndexOf('</svg>') + 6;
    cache.set(key, html.slice(start, end));
  }
  return cache.get(key);
}
