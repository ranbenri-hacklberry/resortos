#!/usr/bin/env python3
"""Invoice photo clean-up (Ran 2026-10-21): crop the paper out of the background, fix perspective,
deskew, contrast + denoise. Local only (OpenCV), never touches the original file.
Usage: invoice_enhance.py <in> <out.jpg> [corners_json]
  corners_json: optional '[[x,y],...]' 4 points, normalized 0..1 top-left origin (e.g. from Grok).
stdout: {"ok":bool,"method":"contour|corners|none","w":int,"h":int}
"""
import sys, json
import cv2
import numpy as np

def order(pts):
    pts = np.array(pts, dtype="float32")
    s = pts.sum(1); d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype="float32")

def find_paper(img):
    h, w = img.shape[:2]
    scale = 1000.0 / max(h, w)
    small = cv2.resize(img, (int(w * scale), int(h * scale))) if scale < 1 else img.copy()
    if scale >= 1: scale = 1.0
    g = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    e = cv2.dilate(cv2.Canny(g, 50, 150), np.ones((3, 3), np.uint8), iterations=2)
    cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    area = small.shape[0] * small.shape[1]
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:8]:
        a = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(a) == 4 and cv2.contourArea(a) > 0.2 * area:
            return a.reshape(4, 2) / scale
    return None

def warp(img, quad):
    q = order(quad)
    wA = np.linalg.norm(q[2] - q[3]); wB = np.linalg.norm(q[1] - q[0])
    hA = np.linalg.norm(q[1] - q[2]); hB = np.linalg.norm(q[0] - q[3])
    W, H = int(max(wA, wB)), int(max(hA, hB))
    M = cv2.getPerspectiveTransform(q, np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], dtype="float32"))
    return cv2.warpPerspective(img, M, (W, H))

def enhance(img):
    img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

def main():
    src, dst = sys.argv[1], sys.argv[2]
    img = cv2.imread(src)
    if img is None:
        print(json.dumps({"ok": False, "method": "none", "error": "unreadable"})); return 1
    h, w = img.shape[:2]
    quad, method = None, "none"
    if len(sys.argv) > 3 and sys.argv[3]:
        try:
            c = json.loads(sys.argv[3])
            if isinstance(c, list) and len(c) == 4:
                quad = np.array([[float(p[0]) * w, float(p[1]) * h] for p in c], dtype="float32"); method = "corners"
        except Exception:
            quad = None
    if quad is None:
        quad = find_paper(img); method = "contour" if quad is not None else "none"
    out = warp(img, quad) if quad is not None else img
    if out.shape[0] < 200 or out.shape[1] < 200:
        out, method = img, "none"
    out = enhance(out)
    cv2.imwrite(dst, out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(json.dumps({"ok": True, "method": method, "w": int(out.shape[1]), "h": int(out.shape[0])}))
    return 0

if __name__ == "__main__":
    sys.exit(main())
