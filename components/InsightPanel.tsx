'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import { ApiRouteError, apiRouteError, consumeSseText } from '@/lib/ai-stream';
import type { RetrievedPassage } from '@/lib/ai-stream';
import type { TimeView } from './TimeNav';
import SourceLinks, { RetrievedSources } from './SourceLinks';
import { linkPlainCitations } from '@/lib/citation-links';
import { chatTitle, loadChats, newChatId, saveChats, type Chat } from '@/lib/chat-store';
import s from './InsightPanel.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  references?: string[];
  passages?: RetrievedPassage[];
  hidden?: boolean; // don't show user bubble for auto/topic messages
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  liunianYear?: number;
  /** 大限视图下正在查看的大限（chart.daXians 下标），AI 按这一步回答「这十年」之类的问题。 */
  daxianIndex?: number;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
  /** 从表单重新起盘：这个盘已有对话时另开一段新对话，而不是接着上次的。 */
  startNew?: boolean;
  /** 没有任何对话时是否自动生成命格总览（刚删光这个盘的对话时为 false，免得又花一次 AI 调用）。 */
  autoOverview?: boolean;
}

const TOPICS = [
  { key: 'overview',     label: '命格' },
  { key: 'love',        label: '感情' },
  { key: 'career',      label: '事业' },
  { key: 'wealth',      label: '财运' },
  { key: 'health',      label: '健康' },
  { key: 'personality', label: '性格' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `请生成命格总览，按以下结构输出：

**【命格定性】**
用一句话概括这个命盘的核心格局与命主气质。

**【主星解读】**
结合命宫主星与相关盘面说明核心特质。

**【三方四正】**
财、官、迁三宫的联动分析及整体格局。

**【当前大限】**
当下大限运势方向与最值得关注的事项。

**【当年流年】**
结合程序给出的当年四化、本命落宫和所属大限，说明与命盘最相关的变化。

**【优势与注意】**
命盘天赋优势，以及需要注意的风险或功课。`,

  love: `请深度分析感情婚姻运，按以下结构输出：

**【感情格局】**
先回答桃花信号是否明显、偏人缘还是偏恋爱机会，以及关系稳定性。

**【夫妻宫分析】**
用夫妻宫主星、四化和实际盘面条件说明伴侣性格倾向与相处模式。

**【三方联动】**
相关宫位对感情的影响。

**【当前大限感情运】**
当下10年感情走向与关键节点。

**【实际建议】**
具体可行的感情建议。`,

  career: `请深度分析事业运，按以下结构输出：

**【事业格局】**
一句话定性事业命格，宜任职或宜创业。

**【官禄宫分析】**
结合官禄宫主星与四化说明这种配置。

**【财帛宫联动】**
财运与事业的关系，财路来源分析。

**【当前大限事业运】**
当下10年事业走向。

**【实际建议】**
适合的方向、行业与策略。`,

  wealth: `请深度分析财运，按以下结构输出：

**【财运格局】**
先给财富潜力的定性档位，再说明主要财路、积累能力和波动。

**【财帛宫分析】**
财帛宫主星、四化，财富来源与流动模式。

**【田宅宫（财库）】**
积蓄能力与不动产运势分析。

**【当前大限财运】**
当下财运走向与注意事项。

**【理财建议】**
具体的财务建议。`,

  health: `请分析健康运势，按以下结构输出：

**【疾厄宫主星】**
疾厄宫星曜与健康含义。

**【主要风险】**
结合已提供的盘面数据说明相关内容。

**【大限健康走势】**
当下健康趋势与关键时间段。

**【预防建议】**
具体注意事项与养生方向。`,

  personality: `请深度解析性格特质，按以下结构输出：

**【命宫主星性格】**
结合命宫主星说明核心性格特质。

**【三方性格综合】**
财、官、迁三宫对性格的影响，全貌描绘。

**【人际关系模式】**
与他人互动方式、待人处世风格。

**【优势与人生课题】**
天赋优势，以及需要面对的人生功课。`,
};

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

/** Render AI markdown: **【Title】** → 小节标题, **bold** → strong */
function AiContent({ text, streaming, passages }: { text: string; streaming?: boolean; passages?: RetrievedPassage[] }) {
  const lines = text.split('\n');
  return (
    <div className={s.ai}>
      {lines.map((line, i) => {
        // 小节标题：**【标题】**，或模型偶尔输出的 Markdown 标题（## 标题）。
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/) ?? line.match(/^#{1,4}\s*【?(.+?)】?\s*$/);
        if (sectionMatch) {
          return <h3 key={i} className={s.sec}>{sectionMatch[1]}</h3>;
        }
        if (line.trim() === '') return null;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <p key={i} className={s.t}>
            {parts.map((part, j) => j % 2 === 0
              ? <SourceLinks key={j} text={part} passages={passages} />
              : <b key={j}><SourceLinks text={part} passages={passages} /></b>
            )}
          </p>
        );
      })}
      {streaming && <span className={s.caret} aria-label="生成中" />}
    </div>
  );
}

export default function InsightPanel({ chart, selectedPalace, selectedSiHua, liunianYear, daxianIndex, startNew = false, autoOverview = true }: InsightPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>('overview');
  const messagesRef = useRef<Message[]>([]); // always-current copy for closures
  const loadingRef = useRef(false);
  const autoLoaded = useRef(false);
  const lastPalaceBranch = useRef<number | undefined>(undefined);
  const lastSiHuaKey = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 新提问出现后把它滚到正文区顶部，回答从下面接着出来，由读者自己往下看（不自动跳到底部的出处列表）。
  // 值是要对齐的消息下标；对齐到位后清空。
  const anchorIndex = useRef<number | null>(null);
  // 发出提问时，解读栏顶部若已滚出窗口，把页面滚回让整栏可见（提问在正文顶部）。
  const revealPanel = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [scrollProgress, setScrollProgress] = useState(100);
  const [hasScrollableMessages, setHasScrollableMessages] = useState(false);
  const [historyRestored, setHistoryRestored] = useState(false);
  // 这个盘的全部对话（含尚未保存的空对话）和正在看的那一段。
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const saved = loadChats(chart.birthInfo);
    if (saved.length && !startNew) {
      // 接着最近的一段对话。
      setChats(saved);
      setActiveId(saved[0].id);
      messagesRef.current = saved[0].messages as Message[];
      anchorToLast(saved[0].messages as Message[]);
      setMessages(saved[0].messages as Message[]);
      autoLoaded.current = true;
    } else {
      // 第一次看这个盘：新对话并自动生成命格总览；已有对话又重新起盘：新的空对话，不自动花费 AI 调用。
      const now = Date.now();
      const fresh: Chat = { id: newChatId(), createdAt: now, updatedAt: now, messages: [] };
      setChats([fresh, ...saved]);
      setActiveId(fresh.id);
      if (saved.length || !autoOverview) autoLoaded.current = true;
    }
    setHistoryRestored(true);
  }, [chart.birthInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!historyRestored || loading || !activeId) return;
    const kept = messages;
    setChats(prev => {
      const current = prev.find(chat => chat.id === activeId);
      if (!current || JSON.stringify(current.messages) === JSON.stringify(kept)) return prev;
      const next = prev.map(chat => chat.id === activeId ? { ...chat, messages: kept, updatedAt: Date.now() } : chat);
      saveChats(chart.birthInfo, next);
      return next;
    });
  }, [historyRestored, loading, messages, activeId, chart.birthInfo]);

  /** 打开一段已有对话：停在最后一个提问（自动生成的解读没有提问气泡，就停在最后一条回答开头）。 */
  const anchorToLast = (list: Message[]) => {
    let index = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === 'user') { index = list[i].hidden ? i + 1 : i; break; }
    }
    anchorIndex.current = index >= 0 && index < list.length ? index : null;
  };

  const switchChat = (id: string) => {
    if (loadingRef.current || id === activeId) return;
    const chat = chats.find(item => item.id === id);
    if (!chat) return;
    // 切走时丢掉没有内容的空对话。
    setChats(prev => prev.filter(item => item.id === id || item.messages.length > 0));
    setActiveId(id);
    messagesRef.current = chat.messages as Message[];
    anchorToLast(chat.messages as Message[]);
    setMessages(chat.messages as Message[]);
  };

  const newChat = () => {
    if (loadingRef.current) return;
    if (!messagesRef.current.length) return; // 已经是空的新对话
    const now = Date.now();
    const fresh: Chat = { id: newChatId(), createdAt: now, updatedAt: now, messages: [] };
    setChats(prev => [fresh, ...prev.filter(item => item.messages.length > 0)]);
    setActiveId(fresh.id);
    messagesRef.current = [];
    setMessages([]);
  };

  const deleteChat = () => {
    if (loadingRef.current) return;
    if (messagesRef.current.length && !window.confirm('删除这段对话？删除后无法恢复。')) return;
    const rest = chats.filter(item => item.id !== activeId && item.messages.length > 0);
    saveChats(chart.birthInfo, rest);
    const next = rest[0];
    if (next) {
      setChats(rest);
      setActiveId(next.id);
      messagesRef.current = next.messages as Message[];
      anchorToLast(next.messages as Message[]);
      setMessages(next.messages as Message[]);
    } else {
      const now = Date.now();
      const fresh: Chat = { id: newChatId(), createdAt: now, updatedAt: now, messages: [] };
      setChats([fresh]);
      setActiveId(fresh.id);
      messagesRef.current = [];
      setMessages([]);
    }
  };

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const updateScrollProgress = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    setHasScrollableMessages(maxScroll > 1);
    setScrollProgress(maxScroll > 1
      ? Math.round((element.scrollTop / maxScroll) * 100)
      : 100);
  }, []);

  const handleProgressChange = (event: ChangeEvent<HTMLInputElement>) => {
    const element = scrollRef.current;
    if (!element) return;

    const progress = Number(event.target.value);
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = maxScroll * progress / 100;
    setScrollProgress(progress);
  };

  // 新提问（或自动解读的回答开头）出现后滚到正文区顶部，之后不再自动滚动。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (anchorIndex.current !== null) {
      const target = element.querySelector<HTMLElement>(`[data-msg="${anchorIndex.current}"]`);
      if (target) {
        const wanted = Math.max(0, target.offsetTop - 8);
        element.scrollTop = wanted;
        // 刚发出问题时下面还没有回答，滚不到位；回答出来后再对齐一次，够到位置才算完成。
        if (element.scrollTop >= wanted - 1) anchorIndex.current = null;
        const section = sectionRef.current;
        if (revealPanel.current && section) {
          revealPanel.current = false;
          if (section.getBoundingClientRect().top < 0) section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
    }

    const frame = requestAnimationFrame(updateScrollProgress);
    return () => cancelAnimationFrame(frame);
  }, [messages, updateScrollProgress]);

  // 回答结束后不再追着对齐（例如回答很短、问题本来就够不到顶部）。写在上面的滚动 effect 之后，同一次渲染里先对齐再清空。
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading) anchorIndex.current = null;
    wasLoading.current = loading;
  }, [loading]);

  // Auto-generate 命格总览 on mount
  useEffect(() => {
    if (!historyRestored) return;
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    sendMessage(TOPIC_PROMPTS.overview, true);
  }, [historyRestored]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject palace analysis when palace selected
  useEffect(() => {
    if (!selectedPalace || selectedPalace.branch === lastPalaceBranch.current) return;
    lastPalaceBranch.current = selectedPalace.branch;

    const majorStars = selectedPalace.stars.filter(s => s.type === 'major');
    const starDesc = majorStars.length > 0
      ? majorStars.map(s => `${s.name}${s.siHua ? '化' + s.siHua : ''}`).join('、')
      : '空宫（借对宫）';
    const role = PALACE_ROLES[selectedPalace.name] ?? '';

    const prompt = `请重点分析【${selectedPalace.name}】（主管：${role}），该宫主星为${starDesc}，按以下结构输出：

**【宫位定性】**
${selectedPalace.name}在命盘中的意义，以及这种星曜配置的整体判断。

**【主星解读】**
主星在此宫的解读，说明盘面依据。

**【三方四正联动】**
三方四正宫位对此宫的影响。

**【实际建议】**
基于此宫的具体建议。`;

    sendMessage(prompt, true);
  }, [selectedPalace]); // eslint-disable-line react-hooks/exhaustive-deps

  // 注入四化飞化分析
  useEffect(() => {
    if (!selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;

    // 找出该星所在宫位
    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
    const palaceName = palaceOfStar?.name ?? '未知宫位';
    const viewLabel = selectedSiHua.view === 'daxian' ? '大限' : '流年';

    const prompt = `请分析【${viewLabel}${selectedSiHua.starName}化${selectedSiHua.siHua}】的飞化影响，按以下结构输出：

**【化${selectedSiHua.siHua}基本含义】**
化${selectedSiHua.siHua}的核心含义，以及${selectedSiHua.starName}化${selectedSiHua.siHua}的含义。

**【落宫影响】**
${selectedSiHua.starName}化${selectedSiHua.siHua}落在【${palaceName}】，该宫主管的领域受到何种影响。

**【三方四正飞化路径】**
化${selectedSiHua.siHua}入${palaceName}后，对其三方四正（对宫、两个三合宫）的联动影响。

**【当前运势影响】**
在${viewLabel}时间维度下，此化${selectedSiHua.siHua}对命主近期运势的具体影响。

**【实际建议】**
基于此四化的具体可操作建议。`;

    sendMessage(prompt, true);
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamResponse = async (apiMessages: { role: 'user' | 'assistant'; content: string }[]) => {
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: apiMessages, liunianYear, daxianIndex }),
      });
      if (res.status === 404) throw new Error('api-missing');
      if (!res.ok) throw await apiRouteError(res, 'DeepSeek 请求失败，请稍后重试。');
      if (!res.body) throw new Error('无响应流');

      let assistantText = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      await consumeSseText(res, delta => {
        assistantText += delta;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantText };
          return updated;
        });
      }, references => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], references };
          return updated;
        });
      }, passages => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], passages };
          return updated;
        });
      });
    } catch (e) {
      const missing = e instanceof Error && e.message === 'api-missing';
      const apiError = e instanceof ApiRouteError ? e.message : '解读失败，请稍后重试。';
      setMessages(prev => [...prev, { role: 'assistant', content: missing ? 'AI 解读接口不存在（/api/interpret）。' : apiError }]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const sendMessage = (text: string, hidden = false) => {
    if (!text.trim() || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const userMsg: Message = { role: 'user', content: text, hidden };
    // 自己输入的问题停在问题处；点维度等自动提问没有提问气泡，停在回答开头。
    anchorIndex.current = messagesRef.current.length + (hidden ? 1 : 0);
    revealPanel.current = true;
    // Capture current messages synchronously via ref (avoids stale closure)
    const apiMessages = [...messagesRef.current, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    streamResponse(apiMessages);
  };

  const handleTopicClick = (topicKey: string) => {
    if (loadingRef.current) return;
    setActiveTopic(topicKey);
    sendMessage(TOPIC_PROMPTS[topicKey], true);
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const EXAMPLES = ['今年能换工作吗', '什么时候结婚运最好'];

  return (
    <section ref={sectionRef} className={s.reading} aria-label="命盘解读">
      <div className={s.head}>
        <h2>解读</h2>
        <span>依本盘星曜，附古籍出处</span>
      </div>

      {/* ── 对话：切换、新建、删除 ── */}
      <div className={s.chatBar}>
        <select value={activeId} onChange={event => switchChat(event.target.value)} disabled={loading} aria-label="选择对话">
          {chats.map(chat => (
            <option key={chat.id} value={chat.id}>
              {chat.messages.length ? `${new Date(chat.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · ${chatTitle(chat)}` : '新对话'}
            </option>
          ))}
        </select>
        <button type="button" onClick={newChat} disabled={loading || messages.length === 0}>新对话</button>
        <button type="button" onClick={deleteChat} disabled={loading || (messages.length === 0 && chats.filter(chat => chat.messages.length > 0).length === 0)}>删除</button>
      </div>

      {/* ── 六个维度 ── */}
      <div className={`tabs-line ${s.tabs}`} role="tablist" aria-label="解读维度">
        {TOPICS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTopic === t.key}
            onClick={() => handleTopicClick(t.key)}
            disabled={loading}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 解读正文 ── */}
      <div ref={scrollRef} onScroll={updateScrollProgress} className={s.pane} role="tabpanel" aria-live="polite" aria-busy={loading}>
        {messages.length === 0 && (
          <p className={s.empty}>{autoLoaded.current && !loading ? '新对话：点上面的维度生成解读，或在下面直接提问。' : '命格解读生成中…'}</p>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'user' && msg.hidden) return null;

          if (msg.role === 'user') {
            return (
              <p key={i} data-msg={i} className={`zhupi ${s.ask}`}>
                <span className={s.askLbl}>问</span>{msg.content}
              </p>
            );
          }


          const isLastMsg = i === messages.length - 1;
          return (
            <article key={i} data-msg={i} className={s.msg}>
              <AiContent text={linkPlainCitations(msg.content, msg.references)} streaming={loading && isLastMsg} passages={msg.passages} />
              {msg.references && !(loading && isLastMsg) && <RetrievedSources references={msg.references} text={linkPlainCitations(msg.content, msg.references)} passages={msg.passages} />}
            </article>
          );
        })}
      </div>

      {/* ── 阅读进度 ── */}
      <div className={s.progress}>
        <span>早</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={scrollProgress}
          onChange={handleProgressChange}
          disabled={!hasScrollableMessages}
          aria-label="聊天记录进度"
          aria-valuetext={`${Math.round(scrollProgress)}%`}
        />
        <span>新</span>
        <span className={s.pct}>{Math.round(scrollProgress)}%</span>
      </div>

      {/* ── 追问 ── */}
      <div className={s.askBox}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="就这张盘继续问，例如「今年能换工作吗」"
          disabled={loading}
          aria-label="追问"
          rows={2}
        />
        <div className={s.askBar}>
          <div className={s.eg}>
            试问：
            {EXAMPLES.map(q => (
              <button key={q} type="button" onClick={() => setInput(q)} disabled={loading}>「{q}」</button>
            ))}
          </div>
          <button
            type="button"
            className={`btn-accent ${s.send}`}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            {loading ? '解读中…' : '追问'}
          </button>
        </div>
      </div>
    </section>
  );
}
