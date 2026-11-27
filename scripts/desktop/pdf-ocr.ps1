# Windows 自带 OCR（Windows.Data.Pdf 渲染页面 + Windows.Media.Ocr 识别），供「导入我的书」使用
# （lib/library-import/ocr.ts）。与 Mac 版 scripts/desktop/pdf-ocr.swift 的输入输出相同：
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pdf-ocr.ps1 <file.pdf> <page>[,<page>…]
#
# 每识别完一页输出一行 JSON：{"page":3,"text":"…"}。用 Windows 10/11 自带的 Windows PowerShell 5.1，
# 不需要另装运行库。需要系统装有中文 OCR 语言组件（设置 › 时间和语言 › 语言 › 中文 › 语言选项 › 光学字符识别）。
# 只认横排文字：竖排书识别效果很差（界面上有提示）。
param(
  [Parameter(Mandatory = $true)][string]$PdfPath,
  [Parameter(Mandatory = $true)][string]$Pages
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

# WinRT 异步调用 → .NET Task → 同步等待。
$asTaskOperation = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1
function Await($operation, [Type]$resultType) {
  $task = $asTaskOperation.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function AwaitAction($action) {
  $task = $asTaskAction.Invoke($null, @($action))
  $task.Wait(-1) | Out-Null
}

# 优先简体中文，其次繁体中文，再退到用户界面语言。
$engine = $null
foreach ($tag in @('zh-Hans-CN', 'zh-CN', 'zh-Hans', 'zh-Hant-TW', 'zh-TW', 'zh-Hant')) {
  $language = [Windows.Globalization.Language]::new($tag)
  if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($language)) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
    if ($engine) { break }
  }
}
if (-not $engine) {
  [Console]::Error.WriteLine('系统没有安装中文文字识别（OCR）语言组件')
  exit 3
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $PdfPath).Path)) ([Windows.Storage.StorageFile])
$document = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

foreach ($item in $Pages.Split(',')) {
  $number = 0
  if (-not [int]::TryParse($item, [ref]$number)) { continue }
  $text = ''
  if ($number -ge 1 -and $number -le $document.PageCount) {
    try {
      $page = $document.GetPage([uint32]($number - 1))
      $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
      # 与 Mac 版相同的渲染尺寸（长边约 2400 像素），并受 OCR 引擎的最大尺寸限制。
      $scale = [Math]::Min(2400 / [Math]::Max($page.Size.Width, $page.Size.Height), [Windows.Media.Ocr.OcrEngine]::MaxImageDimension / [Math]::Max($page.Size.Width, $page.Size.Height))
      $options.DestinationWidth = [uint32][Math]::Max(1, [Math]::Floor($page.Size.Width * $scale))
      $options.DestinationHeight = [uint32][Math]::Max(1, [Math]::Floor($page.Size.Height * $scale))
      $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
      AwaitAction ($page.RenderToStreamAsync($stream, $options))
      $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $lines = foreach ($line in $result.Lines) { $line.Text }
      # Windows OCR 会在中文字之间加空格，去掉。
      $text = (($lines -join "`n") -replace '(?<=[㐀-鿿])\s+(?=[㐀-鿿])', '')
      $bitmap.Dispose(); $stream.Dispose(); $page.Dispose()
    } catch {
      $text = ''
    }
  }
  $json = [ordered]@{ page = $number; text = $text } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
