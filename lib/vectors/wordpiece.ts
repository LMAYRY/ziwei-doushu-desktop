// Pure TypeScript port of the Hugging Face `tokenizers` pipeline used by the
// BGE model: BertNormalizer → BertPreTokenizer → WordPiece → [CLS] … [SEP].
// Only the options present in `.local-library/taiwei-model/tokenizer.json` are
// supported; anything else is rejected so a silent mismatch cannot happen.

type TokenizerJson = {
  added_tokens: { id: number; content: string }[];
  normalizer: { type: string; clean_text: boolean; handle_chinese_chars: boolean; strip_accents: boolean | null; lowercase: boolean };
  pre_tokenizer: { type: string };
  post_processor: { type: string; special_tokens: Record<string, { ids: number[] }> };
  model: { type: string; unk_token: string; continuing_subword_prefix: string; max_input_chars_per_word: number; vocab: Record<string, number> };
};

export type Encoding = { ids: number[]; attentionMask: number[]; typeIds: number[] };

const controlOrOther = /^\p{C}$/u;
const whitespace = /^\p{White_Space}$/u;
const punctuation = /^\p{P}$/u;

function isWhitespace(char: string) {
  return char === '\t' || char === '\n' || char === '\r' || whitespace.test(char);
}

function isControl(char: string) {
  return char !== '\t' && char !== '\n' && char !== '\r' && controlOrOther.test(char);
}

function isChineseChar(code: number) {
  return (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x20000 && code <= 0x2a6df)
    || (code >= 0x2a700 && code <= 0x2b73f)
    || (code >= 0x2b740 && code <= 0x2b81f)
    || (code >= 0x2b920 && code <= 0x2ceaf)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0x2f800 && code <= 0x2fa1f);
}

function isBertPunctuation(char: string) {
  const code = char.codePointAt(0)!;
  const asciiPunctuation = (code >= 33 && code <= 47) || (code >= 58 && code <= 64)
    || (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
  return asciiPunctuation || punctuation.test(char);
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly special: Map<string, number>;
  private readonly specialPattern: RegExp | null;
  private readonly unkId: number;
  private readonly clsId: number;
  private readonly sepId: number;
  private readonly prefix: string;
  private readonly maxWordChars: number;

  constructor(json: TokenizerJson, private readonly maxLength = 512) {
    const { normalizer, pre_tokenizer, post_processor, model } = json;
    if (normalizer?.type !== 'BertNormalizer' || !normalizer.clean_text || !normalizer.handle_chinese_chars
      || normalizer.lowercase || normalizer.strip_accents) throw new Error('Unsupported tokenizer normalizer');
    if (pre_tokenizer?.type !== 'BertPreTokenizer') throw new Error('Unsupported tokenizer pre-tokenizer');
    if (post_processor?.type !== 'TemplateProcessing') throw new Error('Unsupported tokenizer post-processor');
    if (model?.type !== 'WordPiece') throw new Error('Unsupported tokenizer model');

    this.vocab = new Map(Object.entries(model.vocab));
    this.special = new Map(json.added_tokens.map(token => [token.content, token.id]));
    const escaped = [...this.special.keys()].sort((a, b) => b.length - a.length)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.specialPattern = escaped.length ? new RegExp(`(${escaped.join('|')})`) : null;
    this.prefix = model.continuing_subword_prefix;
    this.maxWordChars = model.max_input_chars_per_word;
    const id = (token: string) => {
      const value = this.vocab.get(token);
      if (value === undefined) throw new Error(`Token ${token} missing from vocab`);
      return value;
    };
    this.unkId = id(model.unk_token);
    this.clsId = post_processor.special_tokens['[CLS]'].ids[0];
    this.sepId = post_processor.special_tokens['[SEP]'].ids[0];
  }

  /** BertNormalizer with clean_text + handle_chinese_chars, no lowercasing or accent stripping. */
  private normalize(text: string) {
    let output = '';
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if (code === 0 || code === 0xfffd || isControl(char)) continue;
      if (isWhitespace(char)) output += ' ';
      else if (isChineseChar(code)) output += ` ${char} `;
      else output += char;
    }
    return output;
  }

  /** BertPreTokenizer: drop whitespace, isolate every punctuation character. */
  private preTokenize(text: string) {
    const words: string[] = [];
    let current = '';
    for (const char of text) {
      if (isWhitespace(char)) {
        if (current) words.push(current);
        current = '';
      } else if (isBertPunctuation(char)) {
        if (current) words.push(current);
        words.push(char);
        current = '';
      } else {
        current += char;
      }
    }
    if (current) words.push(current);
    return words;
  }

  private wordPiece(word: string, output: number[]) {
    const chars = [...word];
    if (chars.length > this.maxWordChars) {
      output.push(this.unkId);
      return;
    }
    const pieces: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let match: number | undefined;
      while (start < end) {
        const piece = (start > 0 ? this.prefix : '') + chars.slice(start, end).join('');
        match = this.vocab.get(piece);
        if (match !== undefined) break;
        end--;
      }
      if (match === undefined) {
        output.push(this.unkId);
        return;
      }
      pieces.push(match);
      start = end;
    }
    output.push(...pieces);
  }

  encode(text: string): Encoding {
    const tokens: number[] = [];
    const parts = this.specialPattern ? text.split(this.specialPattern) : [text];
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) tokens.push(this.special.get(part)!);
      else for (const word of this.preTokenize(this.normalize(part))) this.wordPiece(word, tokens);
    });
    const ids = [this.clsId, ...tokens.slice(0, this.maxLength - 2), this.sepId];
    return { ids, attentionMask: ids.map(() => 1), typeIds: ids.map(() => 0) };
  }
}
