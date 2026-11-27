import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InferenceSession } from 'onnxruntime-node';
import { WordPieceTokenizer } from './wordpiece';

export const VECTOR_DIMENSIONS = 512;
export const QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';

/** BGE sentence encoder: CLS pooling of `last_hidden_state`, then L2 normalisation. */
export class Encoder {
  private constructor(
    private readonly tokenizer: WordPieceTokenizer,
    private readonly session: InferenceSession,
    private readonly ort: typeof import('onnxruntime-node'),
  ) {}

  static async load(modelDirectory: string) {
    const ort = await import('onnxruntime-node');
    const [tokenizerJson, session] = await Promise.all([
      readFile(join(modelDirectory, 'tokenizer.json'), 'utf8'),
      ort.InferenceSession.create(join(modelDirectory, 'model.onnx'), {
        intraOpNumThreads: 2,
        executionProviders: ['cpu'],
      }),
    ]);
    return new Encoder(new WordPieceTokenizer(JSON.parse(tokenizerJson)), session, ort);
  }

  /** Encode texts in one padded batch; returns one normalised Float32Array per text. */
  async encode(texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return [];
    const encodings = texts.map(text => this.tokenizer.encode(text));
    const length = Math.max(...encodings.map(encoding => encoding.ids.length));
    const size = texts.length * length;
    const ids = new BigInt64Array(size);
    const mask = new BigInt64Array(size);
    const types = new BigInt64Array(size);
    encodings.forEach((encoding, row) => {
      encoding.ids.forEach((id, column) => {
        const at = row * length + column;
        ids[at] = BigInt(id);
        mask[at] = BigInt(encoding.attentionMask[column]);
        types[at] = BigInt(encoding.typeIds[column]);
      });
    });
    const dims = [texts.length, length];
    const available: Record<string, InstanceType<typeof this.ort.Tensor>> = {
      input_ids: new this.ort.Tensor('int64', ids, dims),
      attention_mask: new this.ort.Tensor('int64', mask, dims),
      token_type_ids: new this.ort.Tensor('int64', types, dims),
    };
    const feeds = Object.fromEntries(this.session.inputNames.map(name => [name, available[name]]));
    const output = (await this.session.run(feeds))[this.session.outputNames[0]];
    const [, sequence, hidden] = output.dims;
    if (hidden !== VECTOR_DIMENSIONS) throw new Error(`Unexpected hidden size ${hidden}`);
    const data = output.data as Float32Array;
    return texts.map((_, row) => {
      const vector = data.slice(row * sequence * hidden, row * sequence * hidden + hidden);
      let norm = 0;
      for (const value of vector) norm += value * value;
      norm = Math.sqrt(norm);
      for (let i = 0; i < vector.length; i++) vector[i] /= norm;
      return vector;
    });
  }
}
