import { readLocalBooks } from './local-books';
import { bookName, redactAuthors } from './citation';
import { BUILTIN_LIBRARY, bookSelected, readLibraries } from './libraries';
import { readTaiwei, searchLibraryVectors, TAIWEI_TITLE } from './taiwei';
import hantHans from './hant-hans.json';

type Passage = {
  source: string;
  title: string;
  text: string;
  url: string;
};

// 繁体→简体：完整对照表由 scripts/desktop/gen-hant-hans.swift 生成（约三千字），
// 下面手写的是表里没有或需要另取写法的异体字（如「鈔本」按书名取「抄本」）。
const variants: Record<string, string> = {
  ...(hantHans as Record<string, string>),
  殺: '杀', 鬥: '斗', 鬪: '斗', 機: '机', 陽: '阳', 陰: '阴',
  貪: '贪', 貞: '贞', 祿: '禄', 權: '权', 財: '财',
  遷: '迁', 宮: '宫', 僕: '仆', 業: '业', 運: '运',
  書: '书', 盤: '盘', 斷: '断', 論: '论', 說: '说', 裡: '里',
  會: '会', 夾: '夹', 蔭: '荫', 鈔: '抄', 樓: '楼',
};

export function normalize(text: string) {
  return text.normalize('NFKC').replace(/[\p{Script=Han}]/gu, char => variants[char] ?? char);
}

// 本站整理的三本古籍节选（《骨髓赋》《紫微斗数全集》《紫微斗数全书》）是现代提要，不是原文：
// 「夫妻宫见六煞需注意磨砺」这类总括句几乎能套到任何盘上，会让 AI 的结论千篇一律，
// 所以不参与 AI 检索，只在古籍库里供阅读（2026-11-12 用户要求）。

const shortTerms = ['安命', '安身', '命宫', '身宫', '官禄', '财帛', '夫妻', '迁移', '福德', '疾厄', '四化', '武曲', '紫微', '天府', '七杀', '婚姻', '配偶', '桃花', '事业', '求财', '财富', '流年'];
const commonPhrases = /出自哪里|什么意思|什么条件|怎么[看说]|能不能|是不是|我的命盘|这张命盘|适合做/g;
const topicTerms: Array<[RegExp, string[]]> = [
  [/婚|姻缘|感情|恋爱|桃花|正缘|伴侣|配偶|妻子|老婆|丈夫|老公/, ['夫妻', '婚姻', '配偶', '桃花']],
  [/财运|财富|财帛|赚钱|收入|求财|发财|守财/, ['财帛', '求财', '财富']],
  [/事业|工作|职业|升职|创业|官禄/, ['事业', '官禄']],
  [/健康|身体|疾病|疾厄/, ['疾厄', '健康']],
  [/流年|运势|今年|明年|后年|未来.{0,8}年/, ['流年']],
];

function queryTerms(question: string) {
  const query = normalize(question.slice(0, 500)).replace(commonPhrases, ' ');
  const phrases: string[] = query.match(/[\p{Script=Han}]+/gu) ?? [];
  const terms = new Set(shortTerms.filter(term => phrases.includes(term)));
  for (const [pattern, synonyms] of topicTerms) {
    if (pattern.test(query)) synonyms.forEach(term => terms.add(term));
  }
  if (query.includes('安命宫')) { terms.add('安命'); terms.add('命宫'); }
  if (query.includes('安身宫')) { terms.add('安身'); terms.add('身宫'); }
  for (const phrase of phrases) {
    for (let start = 0; start < phrase.length; start++) {
      for (let length = 3; length <= 8 && start + length <= phrase.length; length++) {
        terms.add(phrase.slice(start, start + length));
      }
    }
  }
  return [...terms];
}

function rank<T extends Passage>(passages: T[], terms: string[], limit = 2) {
  return passages.map(passage => {
    const title = normalize(passage.title);
    const text = normalize(passage.text);
    let score = 0;
    let shortMatches = 0;
    let phraseMatches = 0;
    for (const term of terms) {
      const weight = Math.max(9, term.length ** 2);
      if (title.includes(term)) score = Math.max(score, weight * 1.25);
      if (text.includes(term)) score = Math.max(score, weight);
      if (term.length === 2 && (title.includes(term) || text.includes(term))) shortMatches++;
      if (term.length >= 4 && text.includes(term)) phraseMatches++;
    }
    return { passage, score: score + shortMatches * 2 + Math.min(phraseMatches, 8) };
  }).filter(hit => hit.score >= 9)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ passage }) => passage);
}

// 书里案例的命盘图经 OCR 后是一串星名，几乎没有标点；星名密度最高，按关键词最容易排到前面，
// 却没有任何判法，会挤掉真正的论述，所以不参与检索。
// 组成星名、宫名的单字：OCR 常把命盘图里的星名打散成单字，按完整星名数不出来，所以按单字占比判断。
const CHART_CHARS = new Set('紫微天机太阳武曲同廉贞府阴贪狼巨门相梁七杀破军擎羊陀罗火星铃地空劫左辅右弼文昌禄存魁钺马喜鸾姚刑命兄弟夫妻子女财帛疾厄迁移仆役官田宅福德父母身'.split(''));
export function looksLikeChartDiagram(text: string) {
  const plain = normalize(text);
  const han = [...plain].filter(char => /\p{Script=Han}/u.test(char));
  if (han.length < 30) return false;
  const punctuation = plain.match(/[，。；：、！？,.;:!?]/g)?.length ?? 0;
  const chartShare = han.filter(char => CHART_CHARS.has(char)).length / han.length;
  const punctuationRate = punctuation * 100 / han.length;
  return (chartShare > 0.3 && punctuationRate < 3.5) || (chartShare > 0.45 && punctuationRate < 6);
}

export async function retrieveClassics(question: string) {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  const [taiwei, allBooks, libraries] = await Promise.all([readTaiwei(), readLocalBooks(), readLibraries()]);
  // 只查用户勾选的书库（内置书库、各个用户书库），见 lib/classics/libraries.ts。
  const useBuiltin = libraries.selected.includes(BUILTIN_LIBRARY);
  const books = allBooks.filter(book => book.id !== 'e994681804a9a788ee3215a1' && bookSelected(libraries, book));
  if ([...question.matchAll(/《([^》]+)》/g)].some(([, title]) =>
    normalize('安星法详解').includes(normalize(title)))) return [];
  const titlesInQuestion = [...question.matchAll(/《([^》]+)》/g)];
  const requestedBooks = books.filter(book =>
    titlesInQuestion.some(([, name]) => normalize(book.title).includes(normalize(name))));
  const bookQuestion = titlesInQuestion.reduce((query, [label, name]) =>
    requestedBooks.some(book => normalize(book.title).includes(normalize(name)))
      ? query.replaceAll(label, '') : query, question);
  const vectors = await searchLibraryVectors(normalize(bookQuestion));
  const hasFullTaiwei = books.some(book => `《${bookName(book.title)}》` === TAIWEI_TITLE && book.textPages === book.pageCount);
  const sample = (hasFullTaiwei || !useBuiltin ? [] : taiwei).map(({ page, text }, index) => ({
    source: `${TAIWEI_TITLE} · 预览提取文字`,
    title: `第 ${page} 页`,
    text,
    url: `/library/taiwei?page=${page}`,
    page,
    index,
  }));
  // 书名和注者名（先替换成「原作者」）不作为检索词。
  const sampleTerms = queryTerms(redactAuthors(question).replace(/原作者注?|[《》]|太微賦|太微赋/g, ' '));
  const keywordHits = rank(sample, sampleTerms);
  const vectorHits = vectors.sample.flatMap(index => sample[index] ? [sample[index]] : []);
  const hits = [...new Set([keywordHits[0], ...vectorHits, ...keywordHits.slice(1)].filter(Boolean))].slice(0, 2);
  const used = new Set<number>();
  const sampleContext: Passage[] = [];
  for (const hit of hits) {
    const window = sample.slice(Math.max(0, hit.index - 1), hit.index + 2)
      .filter(passage => passage.page === hit.page && !used.has(passage.index));
    if (!window.length) continue;
    window.forEach(passage => used.add(passage.index));
    sampleContext.push({ source: hit.source, title: hit.title, url: hit.url, text: window.map(passage => passage.text).join('') });
  }
  const eligibleBooks = requestedBooks.length ? requestedBooks : books;
  const bookChunks = eligibleBooks.map(book => book.chunks.map((chunk, index) => ({
    source: `${book.title.includes('《') ? book.title : `《${book.title}》`}${book.school ? `（${book.school}）` : ''} · ${book.imagePages?.includes(chunk.page) ? '扫描页 OCR' : book.sourceKind === 'preview' ? '网盘预览提取文字' : '本地 PDF 提取文字'}`,
    title: `第 ${chunk.page} 页`,
    text: chunk.text,
    url: `/library/books/${book.id}?page=${chunk.page}`,
    book,
    index,
  })));
  const byBook = new Map(eligibleBooks.map((book, index) => [book.id, bookChunks[index]]));
  const keywordBooks = rank(bookChunks.flat(), queryTerms(redactAuthors(bookQuestion).replace(/原作者注?|[《》]|太微賦|太微赋/g, ' ')), 8);
  const vectorBooks = vectors.books.flatMap(({ id, index }) => {
    const match = byBook.get(id)?.[index];
    return match ? [match] : [];
  });
  const candidates = [...new Set([keywordBooks[0], ...vectorBooks, ...keywordBooks.slice(1)].filter(Boolean))]
    .filter(hit => !looksLikeChartDiagram(hit.text));
  const counts = new Map<string, number>();
  const seenPages = new Set<string>();
  const localHits = candidates.filter(hit => {
    if (seenPages.has(hit.url)) return false;
    const count = counts.get(hit.book.id) ?? 0;
    if (!requestedBooks.length && count >= 2) return false;
    seenPages.add(hit.url);
    counts.set(hit.book.id, count + 1);
    return true;
  }).slice(0, 6);
  const usedBookChunks = new Set<string>();
  const localContext = localHits.flatMap(({ source, title, url, book, index }) => {
    const page = book.chunks[index].page;
    const start = Math.max(0, index - 1);
    const text = book.chunks.slice(start, index + 2).flatMap((chunk, offset) => {
      const key = `${book.id}:${start + offset}`;
      if (chunk.page !== page || usedBookChunks.has(key) || looksLikeChartDiagram(chunk.text)) return [];
      usedBookChunks.add(key);
      return [chunk.text];
    }).join('');
    return text ? [{ source, title, url, text }] : [];
  });
  return requestedBooks.length
    ? localContext
    : [...sampleContext, ...localContext];
}
