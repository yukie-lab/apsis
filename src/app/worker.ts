/// <reference lib="webworker" />
/** Engine worker: long calculations do not stop the user interface. */
import { EngineCore, EngineError } from './engineCore';
import type { RequestMessage, ReplyMessage } from './protocol';

const core = new EngineCore();
const post = (m: ReplyMessage, transfer: Transferable[] = []): void => { (self as DedicatedWorkerGlobalScope).postMessage(m, transfer); };

/** Buffers of the typed arrays in a result: they move to the page with no copy. */
function buffers(x: unknown, out: Transferable[] = [], depth = 0): Transferable[] {
  if (depth > 4 || typeof x !== 'object' || x === null) return out;
  if (ArrayBuffer.isView(x)) { if (!out.includes(x.buffer as ArrayBuffer)) out.push(x.buffer as ArrayBuffer); return out; }
  if (Array.isArray(x)) return out;
  for (const v of Object.values(x)) buffers(v, out, depth + 1);
  return out;
}

self.onmessage = (e: MessageEvent<RequestMessage>): void => {
  const { id, method, args } = e.data;
  try {
    const result = core.call(method, args, (progress) => post({ id, kind: 'progress', progress }));
    post({ id, kind: 'result', result }, buffers(result));
  } catch (err) {
    const ee = err instanceof EngineError ? err : new EngineError('internal', String(err));
    post({ id, kind: 'error', code: ee.code, detail: ee.message });
  }
};
