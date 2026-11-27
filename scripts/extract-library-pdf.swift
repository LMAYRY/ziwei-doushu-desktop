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

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0 else {
    FileHandle.standardError.write(Data("Unable to open PDF\n".utf8))
    exit(1)
}
var pages = [String]()
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { pages.append(""); continue }
    let text = page.string ?? ""
    // 文字层汉字太少（只有页码或乱码）就当扫描页 OCR，取汉字更多的结果。
    if hanCount(text) >= 60 {
        pages.append(text)
        continue
    }
    let image = page.thumbnail(of: CGSize(width: 2400, height: 2400), for: .cropBox)
    var rect = CGRect(origin: .zero, size: image.size)
    guard let pixels = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        pages.append(text)
        continue
    }
    let recognized = await recognize(pixels)
    pages.append(hanCount(recognized) > hanCount(text) ? recognized : text)
}
FileHandle.standardOutput.write(try JSONEncoder().encode(pages))
