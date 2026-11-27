'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { formToBirthInfo } from '@/lib/ziwei/share';
import { generateChart as buildChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import SourceLinks, { RetrievedSources } from '@/components/SourceLinks';
import { linkPlainCitations } from '@/lib/citation-links';
import { ApiRouteError, apiRouteError, consumeSseText, type RetrievedPassage } from '@/lib/ai-stream';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from './heming.module.css';

type HemingMessage = { role: 'user' | 'assistant'; content: string; references?: string[]; passages?: RetrievedPassage[]; hidden?: boolean };
type Relationship = 'romance' | 'family' | 'friendship' | 'business';
const RELATIONSHIPS: Array<[Relationship, string]> = [['romance', '恋人 / 伴侣'], ['family', '家人'], ['friendship', '朋友'], ['business', '合伙 / 同事']];
type HemingSession = { formA: BirthFormState; formB: BirthFormState; messages: HemingMessage[]; updatedAt: number; relationship?: Relationship };
const HISTORY_PREFIX = 'ziwei-heming-v1:';

// ─── AiContent 渲染器（与 InsightPanel 一致）────────────────
function AiContent({ text, streaming, passages }: { text: string; streaming?: boolean; passages?: RetrievedPassage[] }) {
  const lines = text.split('\n');
  return (
    <div className={styles.ai}>
      {lines.map((line, i) => {
        // 小节标题：**【标题】**，或模型偶尔输出的 Markdown 标题（## 标题）。
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/) ?? line.match(/^#{1,4}\s*【?(.+?)】?\s*$/);
        if (sectionMatch) {
          return <h3 key={i} className={styles.aiSec}>{sectionMatch[1]}</h3>;
        }
        if (line.trim() === '') return null;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <p key={i} className={styles.aiLine}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? <SourceLinks key={j} text={part} passages={passages} />
                : <strong key={j}><SourceLinks text={part} passages={passages} /></strong>
            )}
          </p>
        );
      })}
      {streaming && <span className={styles.cursor} aria-hidden />}
    </div>
  );
}

export default function HemingPage() {
  // ─── 双方命盘状态 ─────────────────────────────────────────
  const [chartA, setChartA] = useState<ZiweiChart | null>(null);
  const [chartB, setChartB] = useState<ZiweiChart | null>(null);
  // 双方表单状态由 BirthForm onFormSave 同步到此处，统一按钮触发起盘
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);
  // 两人关系：由用户在合盘前选择，AI 按此关系对读（不再在回答开头声明「没交代关系」）。
  const [relationship, setRelationship] = useState<Relationship>('romance');

  // ─── AI 合盘分析状态 ─────────────────────────────────────
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [analysisError, setAnalysisError] = useState(false);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [messages, setMessages] = useState<HemingMessage[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [passages, setPassages] = useState<RetrievedPassage[]>([]);
  const [sessionKey, setSessionKey] = useState('');
  const [restored, setRestored] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedSessions, setSavedSessions] = useState<Array<{ key: string; session: HemingSession }>>([]);
  const analysisRef = useRef<HTMLDivElement>(null);

  const restoreSession = useCallback((key: string, session: HemingSession) => {
    setFormA(session.formA);
    setFormB(session.formB);
    setRelationship(session.relationship ?? 'romance');
    setMessages(session.messages);
    const last = [...session.messages].reverse().find(message => message.role === 'assistant');
    setAnalysis(last?.content ?? '');
    setReferences(last?.references ?? []);
    setPassages(last?.passages ?? []);
    setSessionKey(key);
    setFormVersion(value => value + 1);
    setHistoryOpen(false);
    try { localStorage.setItem('ziwei-heming-last-v1', key); } catch {}
  }, []);

  useEffect(() => {
    try {
      const key = localStorage.getItem('ziwei-heming-last-v1');
      const raw = key?.startsWith(HISTORY_PREFIX) ? localStorage.getItem(key) : null;
      const saved = raw ? JSON.parse(raw) as HemingSession : null;
      if (key && saved?.formA && saved.formB && Array.isArray(saved.messages)) restoreSession(key, saved);
    } catch {}
    setRestored(true);
  }, [restoreSession]);

  const openHistory = () => {
    const entries: Array<{ key: string; session: HemingSession }> = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(HISTORY_PREFIX)) continue;
        try {
          const session = JSON.parse(localStorage.getItem(key) || 'null') as HemingSession | null;
          if (session?.formA && session.formB && Array.isArray(session.messages) && session.messages.length) entries.push({ key, session });
        } catch {}
      }
    } catch {}
    entries.sort((a, b) => (b.session.updatedAt || 0) - (a.session.updatedAt || 0));
    setSavedSessions(entries);
    setHistoryOpen(true);
  };

  // ─── 起盘（单次调用，返回 chart 给统一流程使用）──────────
  // 开源版不含后端 /api/generate：直接用本仓库的排盘引擎在浏览器里起盘
  const generateChart = useCallback(async (info: BirthInfo): Promise<ZiweiChart | null> => {
    try {
      return buildChart(info);
    } catch {
      return null;
    }
  }, []);

  // 表单是否填齐
  const isFormReady = (f: BirthFormState | null): boolean =>
    !!(f && f.year && f.month && f.day && f.gender && (f.unknownTime || (f.clockHour !== '' && f.clockMinute !== '')));

  // ─── 统一入口：起盘 + 合盘分析 ─────────────────────────────
  const runAnalysis = useCallback(async (q?: string) => {
    setFormError(null);
    if (!isFormReady(formA) || !isFormReady(formB)) {
      setFormError('请先填写双方完整出生信息');
      return;
    }
    setAnalyzing(true);
    setAnalysis('');
    // 不带问题的是一次新的合盘（含「重新合盘」）：先清掉上一段对话，不在解读区残留旧内容。
    if (!q) setMessages([]);
    setAnalysisError(false);
    setAnalysisErrorMessage('');
    setReferences([]);
    setPassages([]);

    try {
      // 每次按当前表单起盘，避免编辑出生信息后复用旧盘。
      const [cA, cB] = await Promise.all([
        generateChart(formToBirthInfo(formA!)),
        generateChart(formToBirthInfo(formB!)),
      ]);
      if (!cA || !cB) {
        setAnalysisError(true);
        setAnalysisErrorMessage('无法生成双方命盘，请检查出生信息后重试。');
        setAnalyzing(false);
        return;
      }
      setChartA(cA);
      setChartB(cB);
      const key = HISTORY_PREFIX + JSON.stringify([cA.birthInfo, cB.birthInfo]);
      const history = q && key === sessionKey ? messages : [];
      const userMessage: HemingMessage = { role: 'user', content: q || '请对双方作一次完整的合盘解读。', hidden: !q };

      const res = await fetch('/api/heming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartA: cA,
          chartB: cB,
          question: q ?? undefined,
          relationship,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (res.status === 404) throw new Error('api-missing');
      if (!res.ok) throw await apiRouteError(res, '合盘分析请求失败，请稍后重试。');
      if (!res.body) throw new Error('合盘服务没有返回分析流，请重试。');

      let text = '';
      let receivedReferences: string[] = [];
      let receivedPassages: RetrievedPassage[] = [];
      await consumeSseText(res, delta => { text += delta; setAnalysis(text); },
        result => { receivedReferences = result; setReferences(result); },
        result => { receivedPassages = result; setPassages(result); });
      if (!text.trim()) throw new Error('合盘分析没有返回内容，请重试。');
      const nextMessages = [...history, userMessage, { role: 'assistant' as const, content: text, references: receivedReferences, passages: receivedPassages }].slice(-100);
      setMessages(nextMessages);
      setSessionKey(key);
      try {
        localStorage.setItem(key, JSON.stringify({ formA: formA!, formB: formB!, messages: nextMessages, updatedAt: Date.now(), relationship } satisfies HemingSession));
        localStorage.setItem('ziwei-heming-last-v1', key);
      } catch {}
      // scroll to analysis
      setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      const previous = [...messages].reverse().find(message => message.role === 'assistant');
      if (previous) {
        setAnalysis(previous.content);
        setReferences(previous.references ?? []);
        setPassages(previous.passages ?? []);
      }
      if (q) setQuestion(q);
      const missing = error instanceof Error && error.message === 'api-missing';
      setAnalysisErrorMessage(missing
        ? '当前部署缺少合盘 AI 接口（/api/heming）。'
        : error instanceof Error ? error.message : '合盘分析暂时不可用，请重试。');
      setAnalysisError(true);
    } finally {
      setAnalyzing(false);
    }
  }, [formA, formB, generateChart, messages, sessionKey, relationship]);

  const cardStyle = styles.form;

  const quickQuestions = [
    '感情匹配度如何？',
    '适合合伙创业吗？',
    '两人结婚是否合适？',
    '哪方面最容易产生矛盾？',
    '财运是否互补？',
  ];

  const hasQuestion = question.trim().length > 0;
  const submitQuestion = () => {
    const prompt = question.trim();
    if (!prompt || analyzing) return;
    setQuestion('');
    void runAnalysis(prompt);
  };

  if (!restored) {
    return (
      <>
        <SiteHeader />
        <main className="wrap"><p className={styles.empty}>正在恢复合盘…</p></main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.head}>
          <div className={`wrap ${styles.headGrid}`}>
            <div>
              <p className={styles.eyebrow}>合盘 · <b>两张命盘对读</b></p>
              <h1 className={styles.h1}>紫微合盘</h1>
              <p className={styles.lede}>
                分别填入两人的出生信息，按双方命盘对照解读：缘分深浅、相处的长处与摩擦、适合怎样的关系。
              </p>
            </div>
            <div className={styles.tools}>
              <span>感情、合伙、亲子、朋友皆可</span>
              <button type="button" className="btn-ghost" disabled={analyzing} onClick={openHistory}>历史对话</button>
            </div>
          </div>
        </section>

        <div className={`wrap ${styles.body}`}>
          {historyOpen && (
            <section className={styles.history} aria-label="合盘历史对话">
              <div className={styles.historyHead}>
                <div><strong>历史对话</strong><span>记录只保存在当前浏览器中</span></div>
                <button type="button" onClick={() => setHistoryOpen(false)}>收起</button>
              </div>
              {savedSessions.length ? savedSessions.map(({ key, session }) => (
                <button key={key} type="button" className={styles.historyItem} onClick={() => restoreSession(key, session)}>
                  {session.formA.name || '甲方'}（{session.formA.year}-{session.formA.month}-{session.formA.day}）
                  与 {session.formB.name || '乙方'}（{session.formB.year}-{session.formB.month}-{session.formB.day}）
                  <small>{session.messages.filter(message => message.role === 'user' && !message.hidden).length} 个提问</small>
                </button>
              )) : <p className={styles.historyEmpty}>当前浏览器还没有合盘对话。</p>}
            </section>
          )}

          <div className={styles.pair}>
            <div className={cardStyle}>
              <div className={styles.formIn}>
                <div className={styles.formTitle}>
                  <span className="seal" aria-hidden>甲</span>
                  <h2>甲方</h2>
                  <small>第一人</small>
                </div>
                <BirthForm
                  key={`a-${formVersion}`}
                  initialData={formA ?? undefined}
                  hideSubmit
                  onSubmit={() => {}}
                  onFormSave={setFormA}
                />
              </div>
            </div>
            <div className={cardStyle}>
              <div className={styles.formIn}>
                <div className={styles.formTitle}>
                  <span className="seal" aria-hidden>乙</span>
                  <h2>乙方</h2>
                  <small>第二人</small>
                </div>
                <BirthForm
                  key={`b-${formVersion}`}
                  initialData={formB ?? undefined}
                  hideSubmit
                  onSubmit={() => {}}
                  onFormSave={setFormB}
                />
              </div>
            </div>
          </div>

          {!analyzing && (
            <div className={styles.rel}>
              <span id="heming-rel">两人关系</span>
              <div className="seg" role="group" aria-labelledby="heming-rel">
                {RELATIONSHIPS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={relationship === value} onClick={() => setRelationship(value)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          {!analyzing && (
            <div className={styles.go}>
              <button type="button" className="btn-accent" onClick={() => runAnalysis()}>{analysis ? '重新合盘' : '合盘'}</button>
              {formError ? <p className={styles.err} role="alert">{formError}</p>
                : <p>{analysis ? '改了出生信息或两人关系后，点这里按新的信息重新起盘对读' : '两表填齐后，同时起两张盘并开始对读'}</p>}
            </div>
          )}

          <section ref={analysisRef} className={styles.reading} aria-label="合盘解读">
            <div className={styles.readingHead}>
              <h2>合盘解读</h2>
              <small>依双方命盘，附古籍出处</small>
            </div>
            <div className={styles.readingBody}>
              {!analysis && !analyzing && (
                <p className={styles.empty}>解读会写在这里：先看双方命宫与夫妻宫的对照，再看彼此四化落在对方哪一宫。</p>
              )}

              {analyzing && !analysis && (
                <div className={styles.waiting} role="status"><i aria-hidden />正在对照双方命盘…</div>
              )}

              {(analyzing ? messages : messages.slice(0, -1)).map((message, index) => message.hidden ? null : (
                <div key={index} className={styles.turn}>
                  <div className={styles.turnLabel}>{message.role === 'user' ? '追问' : '解读'}</div>
                  {message.role === 'user' ? <p className={styles.ask}>「{message.content}」</p> : <>
                    <AiContent text={linkPlainCitations(message.content, message.references)} passages={message.passages} />
                    {message.references && <RetrievedSources references={message.references} text={linkPlainCitations(message.content, message.references)} passages={message.passages} />}
                  </>}
                </div>
              ))}
              {analysis && (
                <div className={styles.turn} style={{ borderBottom: 0 }}>
                  <AiContent text={linkPlainCitations(analysis, references)} streaming={analyzing} passages={passages} />
                  {!analyzing && <RetrievedSources references={references} text={linkPlainCitations(analysis, references)} passages={passages} />}
                </div>
              )}

              {analysisError && (
                <div className={styles.errBox} role="alert">
                  {analysisErrorMessage || '分析暂时不可用，请重试。'}
                </div>
              )}
            </div>

            {analysis && (
              <div className={styles.follow}>
                <div className={styles.followLabel}>就这次合盘继续追问</div>
                <div className={styles.quick}>
                  {quickQuestions.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => { setQuestion(''); void runAnalysis(q); }}
                      disabled={analyzing}
                    >
                      「{q}」
                    </button>
                  ))}
                </div>
                <div className={styles.askRow}>
                  <input
                    type="text"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitQuestion(); }}
                    placeholder="如：哪几年是两人感情的关键期？"
                    aria-label="追问"
                    disabled={analyzing}
                    className="field"
                  />
                  <button type="button" className="btn-accent" onClick={submitQuestion} disabled={analyzing || !hasQuestion}>
                    {analyzing ? '解读中' : '追问'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
