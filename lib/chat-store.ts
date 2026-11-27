// 命盘解读的对话记录（保存在 localStorage）。一个命盘可以有多段对话。
// 存储：`ziwei-chats-v2:<birthInfo JSON>` → Chat[]。旧版每盘只有一段对话，存在 `ziwei-chat-v1:<birthInfo JSON>`
// （消息数组），读到时转成一段对话并删掉旧键。
import type { BirthInfo } from './ziwei/types';

const V1 = 'ziwei-chat-v1:';
const V2 = 'ziwei-chats-v2:';
const MAX_MESSAGES = 100;

export type StoredMessage = { role: 'user' | 'assistant'; content: string; hidden?: boolean };
export type Chat = { id: string; createdAt: number; updatedAt: number; messages: StoredMessage[] };

const isMessage = (item: unknown): item is StoredMessage => !!item && typeof item === 'object'
  && ((item as StoredMessage).role === 'user' || (item as StoredMessage).role === 'assistant')
  && typeof (item as StoredMessage).content === 'string';

export const newChatId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function migrate(suffix: string) {
  try {
    const raw = localStorage.getItem(V1 + suffix);
    if (raw === null) return;
    const messages: unknown = JSON.parse(raw);
    if (Array.isArray(messages) && messages.some(isMessage) && localStorage.getItem(V2 + suffix) === null) {
      const now = Date.now();
      localStorage.setItem(V2 + suffix, JSON.stringify([{ id: newChatId(), createdAt: now, updatedAt: now, messages: messages.filter(isMessage) }]));
    }
    localStorage.removeItem(V1 + suffix);
  } catch {
    // Damaged legacy entry: leave it alone.
  }
}

function read(suffix: string): Chat[] {
  migrate(suffix);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(V2 + suffix) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((chat): chat is Chat => !!chat && typeof chat.id === 'string' && Array.isArray(chat.messages))
      .map(chat => ({ ...chat, messages: chat.messages.filter(isMessage) }))
      .filter(chat => chat.messages.length > 0);
  } catch {
    return [];
  }
}

/** 某个命盘的全部对话，最近更新的在前。 */
export function loadChats(birthInfo: BirthInfo): Chat[] {
  return read(JSON.stringify(birthInfo)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 保存某个命盘的全部对话；没有消息的对话不保存。 */
export function saveChats(birthInfo: BirthInfo, chats: Chat[]) {
  const kept = chats.filter(chat => chat.messages.length > 0)
    .map(chat => ({ ...chat, messages: chat.messages.slice(-MAX_MESSAGES) }));
  try {
    if (kept.length) localStorage.setItem(V2 + JSON.stringify(birthInfo), JSON.stringify(kept));
    else localStorage.removeItem(V2 + JSON.stringify(birthInfo));
  } catch {
    // Storage full or unavailable.
  }
}

/** 对话标题：第一个用户自己输入的问题；只有自动生成的解读时叫「命盘解读」。 */
export function chatTitle(chat: Chat): string {
  return chat.messages.find(message => message.role === 'user' && !message.hidden)?.content.slice(0, 40) || '命盘解读';
}

/** 所有有对话的命盘（历史对话列表用）。 */
export function listChartChats(): Array<{ birthInfo: BirthInfo; chats: Chat[] }> {
  const suffixes = new Set<string>();
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(V1)) suffixes.add(key.slice(V1.length));
      if (key?.startsWith(V2)) suffixes.add(key.slice(V2.length));
    }
  } catch {
    return [];
  }
  const result: Array<{ birthInfo: BirthInfo; chats: Chat[] }> = [];
  for (const suffix of suffixes) {
    try {
      const chats = read(suffix).sort((a, b) => b.updatedAt - a.updatedAt);
      if (chats.length) result.push({ birthInfo: JSON.parse(suffix), chats });
    } catch {
      // Ignore unrelated or damaged entries.
    }
  }
  return result.sort((a, b) => b.chats[0].updatedAt - a.chats[0].updatedAt);
}

/** 删除某个命盘的全部对话。 */
export function deleteChartChats(birthInfo: BirthInfo) {
  try {
    localStorage.removeItem(V2 + JSON.stringify(birthInfo));
    localStorage.removeItem(V1 + JSON.stringify(birthInfo));
  } catch {}
}
