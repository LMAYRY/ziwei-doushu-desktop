// Vision OCR for scanned PDF pages, used by 「导入我的书」 (lib/library-import/ocr.ts).
// Compiled by scripts/desktop/build.mjs into Contents/Resources/data/bin/ziwei-ocr.
// Same rendering and recognition settings as scripts/extract-library-pdf.swift (vertical text falls back to Live Text).
//
// Usage: ziwei-ocr <file.pdf> <page>[,<page>…]   (1-based page numbers)
// Prints one JSON line per page as soon as it is recognised: {"page":3,"text":"…"}
import Foundation
import PDFKit
import Vision
import VisionKit

// 竖排中文：Vision 的 VNRecognizeTextRequest 基本识别不出，改用 macOS 13 起的「实况文本」（VisionKit）。
// 实况文本要在主线程上回调，所以整个程序用 async 顶层代码，不能用信号量阻塞主线程。
func hanCount(_ text: String) -> Int {
    text.unicodeScalars.filter { (0x3400...0x9FFF).contains($0.value) || (0x20000...0x2FFFF).contains($0.value) }.count
}

func liveText(_ image: CGImage) async -> String? {
    guard #available(macOS 13.0, *) else { return nil }
    let analyzer = ImageAnalyzer()
    var configuration = ImageAnalyzer.Configuration([.text])
    configuration.locales = ["zh-Hant", "zh-Hans", "en-US"]
    return try? await analyzer.analyze(image, orientation: .up, configuration: configuration).transcript
}
/** 先用 Vision；识别出的汉字太少（多半是竖排）再用实况文本，取汉字多的结果。 */
func recognize(_ image: CGImage) async -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    var text = ""
    if (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil {
        text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
    if hanCount(text) < 60, let live = await liveText(image), hanCount(live) > hanCount(text) { return live }
    return text
}

struct PageText: Encodable {
    let page: Int
    let text: String
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fail("Usage: ziwei-ocr <file.pdf> <page>[,<page>…]") }
guard let document = PDFDocument(url: URL(fileURLWithPath: arguments[1])), !document.isLocked, document.pageCount > 0 else {
    fail("Unable to open PDF")
}
let pages = arguments[2].split(separator: ",").compactMap { Int($0) }
let encoder = JSONEncoder()
for number in pages {
    var text = ""
    if number >= 1, number <= document.pageCount, let page = document.page(at: number - 1) {
        let image = page.thumbnail(of: CGSize(width: 2400, height: 2400), for: .cropBox)
        var rect = CGRect(origin: .zero, size: image.size)
        if let pixels = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) {
            text = await recognize(pixels)
        }
    }
    var line = try encoder.encode(PageText(page: number, text: text))
    line.append(0x0A)
    FileHandle.standardOutput.write(line)
}
