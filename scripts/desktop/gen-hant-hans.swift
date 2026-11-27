// 生成繁体→简体单字对照表，供 lib/classics/retrieval.ts 检索时把繁体书和简体提问对齐。
// 只在开发机上用 macOS 自带的 ICU 转换生成一次，产物是普通 JSON，Windows 版运行时同样可用。
// 用法：swift scripts/desktop/gen-hant-hans.swift > lib/classics/hant-hans.json
import Foundation

var map: [String: String] = [:]
for code in 0x3400...0x9FFF {
  guard let scalar = Unicode.Scalar(code) else { continue }
  let char = String(Character(scalar))
  guard let converted = char.applyingTransform(StringTransform("Hant-Hans"), reverse: false),
        converted != char, converted.count == 1 else { continue }
  map[char] = converted
}
let data = try JSONSerialization.data(withJSONObject: map, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
