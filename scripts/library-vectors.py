"""Build or search BGE vectors for locally imported books."""

import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

mode, root = sys.argv[1:]
library = Path(root)
model = library / "taiwei-model"
sys.path.insert(0, str(model / "deps"))

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


class Encoder:
    def __init__(self):
        self.tokenizer = Tokenizer.from_file(str(model / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=512)
        self.tokenizer.enable_padding()
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(model / "model.onnx"), options, providers=["CPUExecutionProvider"])

    def encode(self, texts):
        batch = self.tokenizer.encode_batch(texts)
        inputs = {
            "input_ids": np.array([row.ids for row in batch], dtype=np.int64),
            "attention_mask": np.array([row.attention_mask for row in batch], dtype=np.int64),
            "token_type_ids": np.array([row.type_ids for row in batch], dtype=np.int64),
        }
        vectors = self.session.run(None, {field.name: inputs[field.name] for field in self.session.get_inputs()})[0][:, 0]
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def book_dirs():
    return sorted(path for path in (library / "books").glob("*") if re.fullmatch(r"[a-f0-9]{24}", path.name))


def overlapping_texts(chunks):
    for index, chunk in enumerate(chunks):
        text = chunk["text"]
        if index and chunks[index - 1]["page"] == chunk["page"]:
            previous = chunks[index - 1]["text"]
            sentences = re.findall(r"[^。！？；]+[。！？；]*", previous)
            if sentences:
                text = sentences[-1][-100:] + text
        yield text


def read_vectors(directory, digest):
    try:
        with np.load(directory / "vectors.npz", allow_pickle=False) as data:
            if data["source_sha256"].item() == digest:
                vectors = data["vectors"]
                if vectors.ndim == 2 and vectors.shape[1] == 512:
                    return vectors
    except (OSError, ValueError, KeyError):
        pass
    return None


def build():
    encoder = None
    for directory in book_dirs():
        source = (directory / "book.json").read_bytes()
        digest = hashlib.sha256(source).hexdigest()
        if read_vectors(directory, digest) is not None:
            continue
        book = json.loads(source)
        texts = list(overlapping_texts(book["chunks"]))
        if not texts:
            continue
        if encoder is None:
            encoder = Encoder()
        vectors = np.concatenate([encoder.encode(texts[i:i + 16]) for i in range(0, len(texts), 16)])
        with tempfile.NamedTemporaryFile(dir=directory, suffix=".npz", delete=False) as temp:
            np.savez(temp, source_sha256=digest, vectors=vectors)
        Path(temp.name).replace(directory / "vectors.npz")
        print(f'{book["title"]}：{len(vectors)} 个向量', flush=True)


def top_hits(vectors, query):
    if vectors.ndim != 2 or vectors.shape[1] != query.shape[0]:
        return []
    scores = vectors @ query
    return [(int(i), float(scores[i])) for i in np.argsort(-scores)[:2] if scores[i] >= 0.60]


def search():
    question = sys.stdin.read().strip()
    if not question:
        print('{"sample":[],"books":[]}')
        return
    query = Encoder().encode(["为这个句子生成表示以用于检索相关文章：" + question])[0]
    sample = []
    try:
        source = (library / "taiwei.json").read_bytes()
        if hashlib.sha256(source).hexdigest() == (library / "taiwei-vectors.sha256").read_text().strip():
            sample = [index for index, _ in top_hits(np.load(library / "taiwei-vectors.npy", allow_pickle=False), query)]
    except (OSError, ValueError):
        pass
    books = []
    for directory in book_dirs():
        if directory.name == "e994681804a9a788ee3215a1":
            continue
        try:
            digest = hashlib.sha256((directory / "book.json").read_bytes()).hexdigest()
            vectors = read_vectors(directory, digest)
            if vectors is not None:
                books.extend((score, directory.name, index) for index, score in top_hits(vectors, query))
        except OSError:
            continue
    books.sort(reverse=True)
    print(json.dumps({"sample": sample, "books": [{"id": id_, "index": index} for _, id_, index in books[:8]]}))


if mode == "build":
    build()
elif mode == "search":
    search()
else:
    raise SystemExit("Expected build or search")
