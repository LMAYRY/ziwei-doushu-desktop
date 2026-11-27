// 书库：默认只查内置书库；导入的书按所在书库是否勾选决定是否参与检索；清单损坏时退回默认值。
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ziwei-libraries-'));
process.env.ZIWEI_DATA_DIR = dir;

async function main() {
  const { readLibraries, writeLibraries, bookSelected, libraryOf, BUILTIN_LIBRARY, DEFAULT_LIBRARY } = await import('../../lib/classics/libraries');
  const fresh = await readLibraries();
  assert.deepEqual(fresh.selected, [BUILTIN_LIBRARY, DEFAULT_LIBRARY], '默认内置书库和我的书库都参与检索');
  assert.equal(fresh.libraries[0].id, DEFAULT_LIBRARY);
  const bundled = { id: 'a'.repeat(24), bundled: true };
  const imported = { id: 'b'.repeat(24) };
  assert.equal(bookSelected(fresh, bundled), true);
  assert.equal(bookSelected(fresh, imported), true, '升级前导入的书照旧参与检索');

  await writeLibraries({ libraries: [{ id: 'mine', name: '我的书库' }, { id: 'x1', name: '流年' }], selected: ['x1'], books: { [imported.id]: 'x1' } });
  const state = await readLibraries();
  assert.equal(libraryOf(state, imported.id), 'x1');
  assert.equal(bookSelected(state, imported), true);
  assert.equal(bookSelected(state, bundled), false, '内置书库可以取消勾选');
  assert.equal(libraryOf(state, 'c'.repeat(24)), 'mine', '没记录的旧书算第一个书库');

  mkdirSync(join(dir, 'library'), { recursive: true });
  writeFileSync(join(dir, 'library', 'libraries.json'), '{坏掉的');
  assert.deepEqual((await readLibraries()).selected, [BUILTIN_LIBRARY, DEFAULT_LIBRARY], '清单损坏时退回默认');
  console.log('libraries: ok');
}
main();
