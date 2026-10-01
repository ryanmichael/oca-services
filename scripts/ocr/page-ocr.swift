// Vision-framework OCR for one image, printing recognised lines to stdout.
//
// The choir packets are physical scans with NO text layer — `pdftotext` returns
// zero characters across all 354 pages we hold. macOS ships the Vision text
// recogniser, which needs no install, no network and no API key, and on the
// packets' typed text pages it is near-perfect: it reproduced the director's
// own "VESPRERS" typo and the "//" phrase marks exactly.
//
// On MUSIC pages it is only partial — lyrics come back syllable-hyphenated and
// interleaved with staff-line noise ("551 ald 88 a les"). That is expected and
// fine: the music pages carry settings of fixed hymns we already hold, while
// the typed pages carry the variable propers, which are what a review needs.
// scripts/choir-ocr.js classifies the two so a caller can tell them apart.
//
// Build (scripts/choir-ocr.js does this once and caches the binary):
//     swiftc -O scripts/ocr/page-ocr.swift -o <cache>/page-ocr
//
// macOS only. Callers must degrade gracefully elsewhere — this is an index over
// the scans, never a source of liturgical text.

import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
    FileHandle.standardError.write("usage: page-ocr <image>\n".data(using: .utf8)!)
    exit(2)
}

guard let image = NSImage(contentsOfFile: args[1]),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot read image: \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
// Language correction helps ordinary prose and hurts nothing here; the
// liturgical vocabulary it does not know comes back unchanged rather than
// "corrected" into something else.
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}

for observation in (request.results ?? []) {
    if let best = observation.topCandidates(1).first {
        print(best.string)
    }
}
