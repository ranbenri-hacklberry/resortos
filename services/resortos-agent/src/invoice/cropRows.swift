// Deskewed, upscaled crops of invoice description cells (for name suggestions).
// Build: swiftc -O src/invoice/cropRows.swift -o bin/invoice-crop
// Usage: invoice-crop <image_path> <out_dir>   (stdin: JSON [{id, x0, y0, x1, y1, skx, k, outH}])
//   x0..y1: normalized box, TOP-LEFT origin; skx: normalized x where the row's y is measured;
//   k: Vision skew (dy_up = k * dx, normalized); outH: output height in px.
// stdout: JSON [{id, path, w, h}]
import Foundation
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
guard a.count >= 3 else { FileHandle.standardError.write("Usage: invoice-crop <image> <out_dir>\n".data(using: .utf8)!); exit(2) }
guard let img = NSImage(contentsOf: URL(fileURLWithPath: a[1])), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("[]"); exit(1) }
let W = Double(cg.width), H = Double(cg.height)
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let specs = try JSONSerialization.jsonObject(with: input) as? [[String: Any]] else { print("[]"); exit(1) }
var out: [[String: Any]] = []
for s in specs {
  let id = String(describing: s["id"] ?? "x")
  let n = { (k: String) -> Double in (s[k] as? NSNumber)?.doubleValue ?? 0 }
  let x0 = n("x0") * W, y0 = n("y0") * H, x1 = n("x1") * W, y1 = n("y1") * H
  let skx = n("skx") * W, k = n("k"), outH = max(16.0, n("outH"))
  let w = max(1.0, x1 - x0), h = max(1.0, y1 - y0)
  let slope = -k * H / W               // dy (top-left px) per dx px
  let sc = outH / h
  let ow = Int((w * sc).rounded()), oh = Int(outH.rounded())
  guard let ctx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: ow, height: oh))
  ctx.interpolationQuality = .high
  // dest_bl = sc * ([1,0; s,1] * src_bl + (-x0, h - H + y0 - s*skx))
  let t = CGAffineTransform(a: sc, b: sc * slope, c: 0, d: sc, tx: -sc * x0, ty: sc * (h - H + y0 - slope * skx))
  ctx.concatenate(t)
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
  guard let res = ctx.makeImage() else { continue }
  let p = (a[2] as NSString).appendingPathComponent("crop-\(id).png")
  if let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: p) as CFURL, UTType.png.identifier as CFString, 1, nil) {
    CGImageDestinationAddImage(dst, res, nil); CGImageDestinationFinalize(dst)
    out.append(["id": id, "path": p, "w": ow, "h": oh])
  }
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: out))
