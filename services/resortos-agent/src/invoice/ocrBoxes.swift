// Apple Vision OCR with bounding boxes for supplier invoices (Chloe invoice intake).
// Fixed config: accurate, ar-SA + en-US, no language correction (best digit/SKU recall on Israeli invoices).
// Hebrew is NOT supported by Apple Vision on macOS 26 — Hebrew names come from inventory or the manager.
// Build: swiftc -O src/invoice/ocrBoxes.swift -o bin/apple-vision-ocr-boxes
// Usage: apple-vision-ocr-boxes <image_path>   -> JSON [{text, confidence, x, y, w, h}] (normalized, origin bottom-left)
import Foundation
import Vision
import AppKit
let a = CommandLine.arguments
guard a.count >= 2 else { FileHandle.standardError.write("Usage: apple-vision-ocr-boxes <image_path>\n".data(using: .utf8)!); exit(2) }
let url = URL(fileURLWithPath: a[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("[]"); exit(1) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
req.recognitionLanguages = ["ar-SA", "en-US"]
let h = VNImageRequestHandler(cgImage: cg, options: [:])
do { try h.perform([req]) } catch { print("[]"); exit(1) }
var out: [[String: Any]] = []
for o in req.results ?? [] {
  if let c = o.topCandidates(1).first {
    let b = o.boundingBox
    out.append(["text": c.string, "confidence": c.confidence, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height])
  }
}
let d = try JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(d)
