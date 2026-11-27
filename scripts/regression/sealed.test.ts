// 内置书上锁：打包脚本加密的 book.json / taiwei.json，服务端能解开；向量仍按原文 sha256 校验。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sealBookJson, sealTaiweiJson } from '../desktop/seal.mjs';
import { openSealed, sealedSourceSha256 } from '../../lib/classics/sealed';

const book = Buffer.from(JSON.stringify({ title: '测试书', pageCount: 2, textPages: 2, chunks: [{ page: 1, text: '武曲是刚克之星' }] }));
const sealed = JSON.parse(sealBookJson(book));
assert.equal(sealed.title, '测试书', '书名等元数据保持明文');
assert.equal(sealed.chunks, undefined, '正文不以明文出现');
assert.ok(!JSON.stringify(sealed).includes('刚克'), '加密后文件里找不到原文');
assert.deepEqual(JSON.parse(openSealed(sealed.sealed)), [{ page: 1, text: '武曲是刚克之星' }]);
assert.equal(sealedSourceSha256(Buffer.from(JSON.stringify(sealed))), createHash('sha256').update(book).digest('hex'));
assert.equal(sealedSourceSha256(book), undefined, '没加密的文件按原文算');

const taiwei = Buffer.from(JSON.stringify([{ page: 1, text: '太微赋' }]));
const sealedTaiwei = JSON.parse(sealTaiweiJson(taiwei));
assert.deepEqual(JSON.parse(openSealed(sealedTaiwei.sealed)), [{ page: 1, text: '太微赋' }]);
// 已加密的文件再「加密」一次原样返回（从书库包解出来的书再打安装包时不会坏）。
assert.equal(sealBookJson(Buffer.from(JSON.stringify(sealed))), JSON.stringify(sealed));
assert.equal(sealTaiweiJson(Buffer.from(JSON.stringify(sealedTaiwei))), JSON.stringify(sealedTaiwei));
console.log('sealed: ok');
