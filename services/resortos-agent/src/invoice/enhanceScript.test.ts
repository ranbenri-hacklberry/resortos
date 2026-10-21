import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PY = process.env.CHLOE_PYTHON || '/opt/homebrew/bin/python3';
const SCRIPT = path.resolve(__dirname, '../../scripts/invoice_enhance.py');
let hasCv = false;
try { execFileSync(PY, ['-c', 'import cv2'], { stdio: 'ignore' }); hasCv = true; } catch { /* skip */ }

describe.skipIf(!hasCv)('scripts/invoice_enhance.py (local OpenCV, synthetic photo)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'enh-'));
  const src = path.join(dir, 'in.jpg');
  execFileSync(PY, ['-c', `import cv2,numpy as np
img=np.full((1200,900,3),60,np.uint8)
cv2.fillPoly(img,[np.array([[150,120],[760,180],[720,1050],[120,990]],np.int32)],(235,235,235))
cv2.imwrite(${JSON.stringify(src)},img)`]);
  it('finds the paper and crops it out of the background', () => {
    const out = path.join(dir, 'out.jpg');
    const r = JSON.parse(execFileSync(PY, [SCRIPT, src, out]).toString());
    expect(r).toMatchObject({ ok: true, method: 'contour' });
    expect(r.w).toBeLessThan(900); expect(r.h).toBeLessThan(1200);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(src)).toBe(true); // original untouched
  });
  it('uses explicit corners when given', () => {
    const out = path.join(dir, 'out2.jpg');
    const r = JSON.parse(execFileSync(PY, [SCRIPT, src, out, '[[0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9]]']).toString());
    expect(r.method).toBe('corners');
  });
});
