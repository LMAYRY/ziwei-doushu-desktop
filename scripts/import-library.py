"""Import a local PDF or folder into the private bookshelf on macOS."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / ".local-library" / "books"


def split_page(text):
    text = re.sub(r"(?<=[\u3400-\u9fff])[ \t]*\n[ \t]*(?=[\u3400-\u9fff])", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    current = ""
    for sentence in re.findall(r"[^。！？；]+[。！？；]*|[。！？；]+", text):
        if current and len(current + sentence) > 140:
            yield current
            current = ""
        while len(sentence) > 240:
            yield sentence[:160]
            sentence = sentence[160:]
        current += sentence
    if current:
        yield current


def import_pdf(path, extractor, school):
    with path.open("rb") as source:
        digest = hashlib.sha256()
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    destination = LIBRARY / digest.hexdigest()[:24]
    if destination.exists():
        print(f"已存在 {path.name}", flush=True)
        return
    result = subprocess.run([str(extractor), str(path)], check=True, capture_output=True)
    pages = json.loads(result.stdout)
    chunks = [{"page": number, "text": chunk}
              for number, text in enumerate(pages, 1) for chunk in split_page(text)]
    with tempfile.TemporaryDirectory(prefix=".import-", dir=LIBRARY) as temp:
        stage = Path(temp)
        shutil.copyfile(path, stage / "book.pdf")
        (stage / "book.json").write_text(json.dumps({
            "title": path.stem,
            "school": school,
            "pageCount": len(pages),
            "textPages": sum(bool(page.strip()) for page in pages),
            "chunks": chunks,
        }, ensure_ascii=False), encoding="utf-8")
        stage.rename(destination)
    print(f"已导入 {path.name}，{len(pages)} 页，{len(chunks)} 片段", flush=True)


def import_preview(source, school):
    data = json.loads(source.read_text(encoding="utf-8"))
    title = data["title"]
    page_count = int(data["pageCount"])
    pages = [data["pages"].get(str(number), "") for number in range(1, page_count + 1)]
    chunks = [{"page": number, "text": chunk}
              for number, text in enumerate(pages, 1) for chunk in split_page(text)]
    if not chunks:
        raise SystemExit("预览没有可用正文")
    book_id = hashlib.sha256(("preview:" + title).encode()).hexdigest()[:24]
    directory = LIBRARY / book_id
    directory.mkdir(parents=True, exist_ok=True)
    image_pages = []
    for number, filename in data.get("pageImages", {}).items():
        page = int(number)
        if 1 <= page <= page_count:
            image = source.parent / Path(filename).name
            if image.is_file() and image.suffix.lower() == ".png":
                shutil.copyfile(image, directory / f"page-{page}.png")
                image_pages.append(page)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, delete=False) as temp:
        json.dump({
            "title": title,
            "school": school,
            "pageCount": page_count,
            "textPages": sum(bool(page.strip()) for page in pages),
            "sourceKind": "preview",
            "imagePages": sorted(image_pages),
            "chunks": chunks,
        }, temp, ensure_ascii=False)
    Path(temp.name).replace(directory / "book.json")
    print(f"已导入预览《{title}》，{sum(bool(page.strip()) for page in pages)}/{page_count} 页有文字，{len(chunks)} 片段", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--vectors", action="store_true", help="同时为新导入的书生成本地向量")
    parser.add_argument("--school", help="只在能从书目确认时标注流派")
    parser.add_argument("--preview-json", action="store_true", help="导入带页码的网盘预览文字 JSON")
    args = parser.parse_args()
    source = args.source.resolve()
    LIBRARY.mkdir(parents=True, exist_ok=True)
    failures = []
    if args.preview_json:
        import_preview(source, args.school)
    else:
        paths = sorted(source.rglob("*")) if source.is_dir() else [source]
        paths = [path for path in paths if path.is_file() and path.suffix.lower() == ".pdf"]
        if not paths:
            parser.error("找不到 PDF")
        with tempfile.TemporaryDirectory() as temp:
            extractor = Path(temp) / "extract"
            subprocess.run(["swiftc", "-module-cache-path", str(Path(temp) / "cache"), str(ROOT / "scripts" / "extract-library-pdf.swift"), "-o", str(extractor)], check=True)
            for path in paths:
                try:
                    import_pdf(path, extractor, args.school)
                except (OSError, ValueError, subprocess.CalledProcessError) as error:
                    failures.append(path)
                    print(f"导入失败 {path.name}：{error}", flush=True)
    if args.vectors:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "library-vectors.py"), "build", str(LIBRARY.parent)], check=True)
    if failures:
        raise SystemExit(f"{len(failures)} 本导入失败")


if __name__ == "__main__":
    main()
