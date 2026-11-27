'use client';
import { useEffect, useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView, getYearStemIndex } from '@/components/TimeNav';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { generateChart } from '@/lib/ziwei/algorithm';
import { BRANCHES, STEMS, SHICHEN } from '@/lib/ziwei/constants';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';
import { chatTitle, deleteChartChats, listChartChats } from '@/lib/chat-store';
import s from './page.module.css';

type HistoryEntry = { key: string; birthInfo: BirthInfo; lastQuestion: string; chats: number };

const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const pad = (n: number) => String(n).padStart(2, '0');

function lunarDayName(day: number): string {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  const prefix = day < 10 ? '初' : day < 20 ? '十' : day < 30 ? '廿' : '三十';
  return prefix + DIGITS[day % 10];
}

const yearGanzhi = (year: number) => `${STEMS[getYearStemIndex(year)]}${BRANCHES[((year - 4) % 12 + 12) % 12]}`;

/** 命主信息条：公历 / 农历 / 四柱 / 五行局 / 命主身主 / 年龄 / 当前大限 / 流年 */
function describeBirth(chart: ZiweiChart) {
  const { birthInfo: b, lunarInfo: l } = chart;
  const shichen = SHICHEN[b.hour];
  const orig = b.origInput;
  const date = orig ? `${orig.year}-${pad(orig.month)}-${pad(orig.day)}` : `${b.year}-${pad(b.month)}-${pad(b.day)}`;
  const time = b.unknownTime
    ? '时辰不详'
    : orig ? `${pad(orig.clockHour)}:${pad(orig.clockMinute)}（${shichen?.name ?? ''}）`
    : `${shichen?.range.replace('-', '–') ?? ''}（${shichen?.name ?? ''}）`;
  const shifted = !!orig && (orig.year !== b.year || orig.month !== b.month || orig.day !== b.day);
  const month = Math.abs(l.lunarMonth);
  const lunar = `农历 ${STEMS[l.yearStem]}${BRANCHES[l.yearBranch]}年 ${l.isLeapMonth ? '闰' : ''}${LUNAR_MONTHS[month - 1] ?? month}月${lunarDayName(l.lunarDay)} ${b.unknownTime ? '按子时起盘' : shichen?.name ?? ''}`;
  const gender = [b.gender === 'male' ? '男' : '女', chart.yinYangGender].filter(Boolean).join(' · ');
  const place = [b.province, b.city].filter(Boolean).join(' ');
  return { title: `${b.name ? `${b.name} · ` : ''}公历 ${date} ${time}`, lunar, gender, place, shifted };
}

export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  // 正在查看的大限（chart.daXians 下标）；null = 跟着当前大限。
  const [daxianChoice, setDaxianChoice] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // 从表单起盘时为 true：这个盘已有对话就另开一段新对话；从历史对话或重启恢复时接着最近的对话。
  const [startNew, setStartNew] = useState(false);
  // 同一个盘再次从表单起盘时也要重新挂载解读区。
  const [panelNonce, setPanelNonce] = useState(0);
  // 刚删光正在看的盘的对话：重新挂载的解读区不自动生成命格总览。
  const [autoOverview, setAutoOverview] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ziwei-chart-birth-v1');
      if (saved) setChart(generateChart(JSON.parse(saved)));
    } catch {
      // Invalid or unavailable local storage should not prevent a new chart.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!chart) return;
    try { localStorage.setItem('ziwei-chart-birth-v1', JSON.stringify(chart.birthInfo)); } catch {}
    setDaxianChoice(null);
  }, [chart]);

  if (!restored) {
    return (
      <div className={s.page}>
        <SiteHeader wide />
        <main className={`wrap-wide ${s.restoring}`}>正在恢复命盘…</main>
      </div>
    );
  }

  const openHistory = () => {
    setHistory(listChartChats().map(({ birthInfo, chats }) => ({
      key: JSON.stringify(birthInfo), birthInfo, chats: chats.length, lastQuestion: chatTitle(chats[0]),
    })));
    setHistoryOpen(true);
  };

  const removeHistory = (entry: HistoryEntry) => {
    const name = entry.birthInfo.name || '这个命盘';
    if (!window.confirm(`删除「${name}」的全部 ${entry.chats} 段对话？删除后无法恢复。`)) return;
    deleteChartChats(entry.birthInfo);
    setHistory(prev => prev.filter(item => item.key !== entry.key));
    // 正在看的就是这个盘：重新挂载解读区，显示空的新对话。
    if (chart && JSON.stringify(chart.birthInfo) === entry.key) { setStartNew(true); setAutoOverview(false); setPanelNonce(n => n + 1); }
  };

  const historyPanel = historyOpen && (
    <section className={s.history} aria-label="历史对话">
      <div className={s.historyHead}>
        <h2>历史对话</h2>
        <button type="button" className={s.textBtn} onClick={() => setHistoryOpen(false)}>关闭</button>
      </div>
      <p className={s.historyNote}>记录保存在这台电脑上，按命盘分组；每个盘可以有多段对话，在解读区顶部切换。</p>
      {history.length ? <ul className={s.historyList}>
        {history.map(entry => (
          <li key={entry.key}>
            <button type="button" className={s.historyItem}
              onClick={() => {
                try {
                  setStartNew(false);
                  setAutoOverview(true);
                  setPanelNonce(n => n + 1);
                  setChart(generateChart(entry.birthInfo));
                  setSelectedPalace(null);
                  setView('mingpan');
                  setHistoryOpen(false);
                } catch {
                  // Leave the current chart visible if saved birth data is invalid.
                }
              }}>
              <b>{entry.birthInfo.name || '未命名命盘'} · {entry.birthInfo.origInput?.year ?? entry.birthInfo.year}-{entry.birthInfo.origInput?.month ?? entry.birthInfo.month}-{entry.birthInfo.origInput?.day ?? entry.birthInfo.day}</b>
              <span>{entry.chats} 段对话 · 最近：{entry.lastQuestion.slice(0, 80)}</span>
            </button>
            <button type="button" className={s.textBtn} onClick={() => removeHistory(entry)} aria-label="删除这个命盘的全部对话">删除</button>
          </li>
        ))}
      </ul> : <p className={s.historyEmpty}>还没有保存的对话。</p>}
    </section>
  );

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <div className={s.page}>
        <SiteHeader wide />
        <main className={`wrap-wide ${s.formPage}`}>
          <div className={s.intro}>
            <h1>起盘</h1>
            <p className={s.lead}>输入出生年月日时，生成你的紫微斗数命盘。填写出生地可按真太阳时校正时辰。</p>
            <ul className={s.rules}>
              <li><b>五行局</b><span>按纳音五行局起盘，不采用网络简化算法。</span></li>
              <li><b>命身宫</b><span>命宫逆数生时、身宫顺数生时，严格对齐教学规则。</span></li>
              <li><b>星曜四化</b><span>十四主星与四化飞星按原法推演，结构完整可复核。</span></li>
            </ul>
            <div className={s.introActions}>
              <button type="button" className={s.textBtn} onClick={openHistory}>历史对话</button>
            </div>
            {historyPanel}
          </div>
          <div className={s.formCol}>
            <BirthForm onSubmit={(info: BirthInfo) => {
              const nextChart = generateChart(info);
              try { localStorage.setItem('ziwei-chart-birth-v1', JSON.stringify(info)); } catch {}
              setStartNew(true);
              setAutoOverview(true);
              setPanelNonce(n => n + 1);
              setChart(nextChart);
            }} />
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // ── 已起盘：命主信息 + 命盘 + 解读 ──
  const birth = describeBirth(chart);
  const pillars = chart.lunarInfo.fourPillars;
  // 大限与流年联动：流年翻到哪一年，大限跟到那一年所在的一步；选了某一步大限，流年跳到它的第一年。
  const birthYear = chart.lunarInfo.lunarYear;
  const daxianOfYear = (year: number) =>
    chart.daXians.findIndex(dx => year - birthYear + 1 >= dx.startAge && year - birthYear + 1 <= dx.endAge);
  const daxianIndex = daxianChoice ?? chart.currentDaXianIndex;
  const changeYear = (year: number) => {
    setLiunianYear(year);
    const index = daxianOfYear(year);
    if (index >= 0) setDaxianChoice(index);
  };
  const changeDaxian = (index: number) => {
    const dx = chart.daXians[index];
    if (!dx) return;
    setDaxianChoice(index);
    if (daxianOfYear(liunianYear) !== index) setLiunianYear(birthYear + dx.startAge - 1);
  };
  const currentDx = chart.daXians[daxianIndex];
  const dxPalace = currentDx ? chart.palaces.find(p => p.branch === currentDx.palaceBranch) : undefined;
  const dxIsCurrent = daxianIndex === chart.currentDaXianIndex;

  return (
    <div className={s.page}>
      <SiteHeader wide />

      <section className={s.info}>
        <div className="wrap-wide">
          <div className={s.infoRow}>
            <div className={s.who}>
              <h1>{birth.title}</h1>
              <p>
                <span>{birth.lunar}</span>
                <span>{birth.gender}</span>
                {birth.place && <span>{birth.place}</span>}
                {birth.shifted && <span>晚子时已按次日排盘</span>}
              </p>
            </div>
            <div className={s.right}>
              <div className={s.actions}>
                <button type="button" className={s.textBtn} onClick={() => { setChart(null); setSelectedPalace(null); }}>重新起盘</button>
                <button type="button" className={s.textBtn} onClick={openHistory}>历史对话</button>
              </div>
              <TimeNav
                chart={chart}
                view={view}
                liunianYear={liunianYear}
                daxianIndex={daxianIndex}
                onViewChange={setView}
                onYearChange={changeYear}
                onDaxianChange={changeDaxian}
              />
            </div>
          </div>
          <dl className={s.facts}>
            {pillars && (
              <div className={s.pl}>
                <dt>四柱</dt>
                <dd className={s.pillars}>
                  {pillars.map((gz, i) => <span key={i}>{gz}<i>{'年月日时'[i]}</i></span>)}
                </dd>
              </div>
            )}
            <div><dt>五行局</dt><dd>{chart.wuxingJuName}</dd></div>
            {chart.mingZhu && <div><dt>命主</dt><dd>{chart.mingZhu}</dd></div>}
            {chart.shenZhu && <div><dt>身主</dt><dd>{chart.shenZhu}</dd></div>}
            <div><dt>年龄</dt><dd>{chart.currentAge} 岁</dd></div>
            {currentDx && (
              <div className={s.now}>
                <dt>{dxIsCurrent ? '当前大限' : '查看大限'}</dt>
                <dd>{currentDx.startAge}–{currentDx.endAge} {currentDx.palaceName}{dxPalace ? `（${STEMS[dxPalace.stem]}${BRANCHES[dxPalace.branch]}）` : ''}</dd>
              </div>
            )}
            <div><dt>流年</dt><dd>{liunianYear} {yearGanzhi(liunianYear)}</dd></div>
          </dl>
          {historyPanel}
        </div>
      </section>

      <main className={`wrap-wide ${s.main}`}>
        <ChartBoard chart={chart} timeView={view} liunianYear={liunianYear} daxianIndex={daxianIndex} onPalaceSelect={setSelectedPalace} />
        <InsightPanel key={`${JSON.stringify(chart.birthInfo)}#${panelNonce}`} chart={chart} startNew={startNew} autoOverview={autoOverview} selectedPalace={selectedPalace} liunianYear={view === 'liunian' ? liunianYear : undefined} daxianIndex={view === 'daxian' ? daxianIndex : undefined} />
      </main>

      <SiteFooter />
    </div>
  );
}
