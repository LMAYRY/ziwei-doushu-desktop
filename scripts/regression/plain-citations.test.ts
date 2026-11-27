import assert from 'node:assert/strict';
import { linkPlainCitations } from '../../lib/citation-links';

// 模型把出处写成普通文字时，书名和页码都对得上本轮检索资料的，补成可点击的 citation。
const refs = [
  '[《紫微斗数看婚姻》 · 第 41 页](/library/books/1baf98b108404fdeaea836f9?page=41)',
  '[《中州派紫微斗数深造讲义》（中州派） · 第 612 页](/library/books/45fa79b428483a1faa2e67dd?page=612)',
];
const text = '主夫妻和谐（《紫微斗数看婚姻》第41页）。波折之后更笃（《中州派紫微斗数深造讲义》第 612 页）。另见《谈星》第 3 页。';
assert.equal(linkPlainCitations(text, refs),
  `主夫妻和谐（${refs[0]}）。波折之后更笃（${refs[1]}）。另见《谈星》第 3 页。`);
// 已经是 citation 的不重复处理；没有检索资料时原样返回。
assert.equal(linkPlainCitations(`见${refs[0]}。`, refs), `见${refs[0]}。`);
assert.equal(linkPlainCitations(text, []), text);
// 页码对不上不补链接。
assert.equal(linkPlainCitations('《紫微斗数看婚姻》第 42 页', refs), '《紫微斗数看婚姻》第 42 页');
console.log('plain-citations: ok');
