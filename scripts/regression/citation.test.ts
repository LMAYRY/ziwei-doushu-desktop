import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// 名单在第一次替换时才读取，所以下面先设好资料目录再调用。
import { redactAuthors, schoolName, withoutAuthors } from '../../lib/classics/citation';
// 作者名单从书库数据目录的 authors.json 读取（不在代码里）；这里用虚构的名字。
const resources = mkdtempSync(join(tmpdir(), 'ziwei-citation-'));
mkdirSync(join(resources, '.local-library'));
writeFileSync(join(resources, '.local-library', 'authors.json'), JSON.stringify(['张一山', '李二水', '赵三木', '钱四金', '孫五火', '孙五火']));
process.env.ZIWEI_RESOURCES_DIR = resources;
import hantHans from '../../lib/classics/hant-hans.json';

// 引用只保留书名和流派，去掉作者、注者。
const cases: [string, string][] = [
  ['张一山《紫微斗数讲义》李二水补注（中州派补注（含张一山原文）） · 本地 PDF 提取文字', '《紫微斗数讲义》（中州派） · 本地 PDF 提取文字'],
  ['李二水《中州派紫微斗数初级讲义》（中州派） · 扫描页 OCR', '《中州派紫微斗数初级讲义》（中州派） · 扫描页 OCR'],
  ['赵三木《斗数论求财》 · 扫描页 OCR', '《斗数论求财》 · 扫描页 OCR'],
  ['钱四金《斗数四化断诀》', '《斗数四化断诀》'],
  ['李二水注《太微赋》 · 预览提取文字', '《太微赋》 · 预览提取文字'],
  ['本站整理节选《紫微斗数全书》', '本站整理节选《紫微斗数全书》'],
  ['没有书名号的来源', '没有书名号的来源'],
];
for (const [input, expected] of cases) assert.equal(withoutAuthors(input), expected, input);
// 正文里的作者名替换掉；流派里带人名的不显示。
assert.equal(redactAuthors('李二水按：张一山原文云'), '原作者按：原作者原文云');
assert.equal(redactAuthors('孫五火著，钱四金序'), '原作者著，原作者序');
assert.equal(redactAuthors('巨门坐财帛宫'), '巨门坐财帛宫');
assert.equal(schoolName('中州派补注（含张一山原文）'), '中州派');
assert.equal(schoolName('赵三木派'), undefined);
// 检索用的繁简对照表覆盖星曜、宫位常用繁体字（Windows 版同样使用这份静态表）。
const map = hantHans as Record<string, string>;
for (const [hant, hans] of Object.entries({ 門: '门', 羅: '罗', 鈴: '铃', 輔: '辅', 鉞: '钺', 鸞: '鸾', 緣: '缘', 歲: '岁' })) assert.equal(map[hant], hans);
assert.ok(Object.keys(map).length > 2500);
console.log('citation: ok');
