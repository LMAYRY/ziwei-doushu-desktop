// 对话记录：旧版单段对话迁移、多段对话保存、空对话不保存、历史列表、删除。
import assert from 'node:assert/strict';
// chat-store 只在调用时读 localStorage，下面装好假的 localStorage 后再调用即可。
import { loadChats, saveChats, listChartChats, deleteChartChats, chatTitle } from '../../lib/chat-store';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: key => { store.delete(key); },
  key: index => [...store.keys()][index] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

type Birth = Parameters<typeof loadChats>[0];
const a = { year: 1990, month: 6, day: 15, hour: 4, gender: 'male', unknownTime: false } as unknown as Birth;
const b = { year: 1985, month: 3, day: 8, hour: 4, gender: 'female', unknownTime: false } as unknown as Birth;

// 旧版：一个盘一组消息。
store.set(`ziwei-chat-v1:${JSON.stringify(a)}`, JSON.stringify([
  { role: 'user', content: '命格总览', hidden: true }, { role: 'assistant', content: '总览' },
  { role: 'user', content: '今年能换工作吗' }, { role: 'assistant', content: '偏有利' },
]));
const migrated = loadChats(a);
assert.equal(migrated.length, 1);
assert.equal(migrated[0].messages.length, 4);
assert.equal(chatTitle(migrated[0]), '今年能换工作吗');
assert.equal(store.has(`ziwei-chat-v1:${JSON.stringify(a)}`), false, '旧键迁移后删除');

// 第二段对话；空对话不保存；最近更新的排前面。
const second = { id: 'x2', createdAt: 2e12, updatedAt: 2e12, messages: [{ role: 'user' as const, content: '桃花如何' }, { role: 'assistant' as const, content: '一般' }] };
const empty = { id: 'x3', createdAt: 3e12, updatedAt: 3e12, messages: [] };
saveChats(a, [...migrated, second, empty]);
const both = loadChats(a);
assert.deepEqual(both.map(chat => chat.id), ['x2', migrated[0].id]);

saveChats(b, [{ id: 'y1', createdAt: 1, updatedAt: 1, messages: [{ role: 'user', content: '命格总览', hidden: true }, { role: 'assistant', content: '总览' }] }]);
const list = listChartChats();
assert.equal(list.length, 2);
assert.equal(list[0].chats.length, 2, '最近更新的盘在前');
assert.equal(chatTitle(list[1].chats[0]), '命盘解读');

// 删掉一段后剩一段；删掉整个盘。
saveChats(a, both.filter(chat => chat.id !== 'x2'));
assert.equal(loadChats(a).length, 1);
deleteChartChats(a);
assert.equal(loadChats(a).length, 0);
assert.equal(listChartChats().length, 1);
saveChats(b, []);
assert.equal(listChartChats().length, 0, '没有消息的盘不留记录');

console.log('chat-store: ok');
