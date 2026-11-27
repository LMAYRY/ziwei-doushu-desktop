"""Reference outputs from the original Python stack (dev-only, used by vector-parity.ts).

Usage: python3 python-reference.py <tokenize|encode> <library>  (JSON list of strings on stdin)
"""

import json
from pathlib import Path
import sys

mode, root = sys.argv[1:]
model = Path(root) / "taiwei-model"
sys.path.insert(0, str(model / "deps"))

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

texts = json.load(sys.stdin)
tokenizer = Tokenizer.from_file(str(model / "tokenizer.json"))
tokenizer.enable_truncation(max_length=512)

if mode == "tokenize":
    print(json.dumps([row.ids for row in tokenizer.encode_batch(texts)]))
elif mode == "encode":
    session = ort.InferenceSession(str(model / "model.onnx"), providers=["CPUExecutionProvider"])
    out = []
    for text in texts:
        row = tokenizer.encode(text)
        inputs = {
            "input_ids": np.array([row.ids], dtype=np.int64),
            "attention_mask": np.array([row.attention_mask], dtype=np.int64),
            "token_type_ids": np.array([row.type_ids], dtype=np.int64),
        }
        vector = session.run(None, {f.name: inputs[f.name] for f in session.get_inputs()})[0][0, 0]
        out.append((vector / np.linalg.norm(vector)).tolist())
    print(json.dumps(out))
else:
    raise SystemExit("Expected tokenize or encode")
