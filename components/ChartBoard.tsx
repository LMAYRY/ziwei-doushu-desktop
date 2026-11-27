'use client';
import { useState } from 'react';
import type { ZiweiChart, Palace, Star } from '@/lib/ziwei/types';
import { BRANCHES, STEMS, PALACE_NAMES_ORDER } from '@/lib/ziwei/constants';
import PalaceCell, { HuaMark } from './PalaceCell';
import { type TimeView, getYearStemIndex, buildSiHuaOverlay, DAXIAN_SHORT } from './TimeNav';
import { getAnnualPalaceBranches, getAnnualStars } from '@/lib/ziwei/annual-flow';
import s from './ChartBoard.module.css';

interface ChartBoardProps {
  chart: ZiweiChart;
  timeView: TimeView;
  liunianYear: number;
  /** 正在查看的大限（chart.daXians 下标），默认当前大限。 */
  daxianIndex?: number;
  onStarSelect?: (star: Star, palace: Palace) => void;
  onPalaceSelect?: (palace: Palace) => void;
  onSiHuaClick?: (starName: string, siHua: string, view: TimeView) => void;
}

/** 地支 → 宫格位置 [row, col]（0 起）：巳午未申 / 辰□□酉 / 卯□□戌 / 寅丑子亥 */
const BRANCH_GRID_POS: Record<number, [number, number]> = {
  5: [0, 0], 6: [0, 1], 7: [0, 2], 8: [0, 3],
  4: [1, 0], 9: [1, 3],
  3: [2, 0], 10: [2, 3],
  2: [3, 0], 1: [3, 1], 0: [3, 2], 11: [3, 3],
};

const RENDER_ORDER = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
const HUA_ORDER = '禄权科忌';

/** 三方四正：本宫 + 对宫 + 两个三合宫 */
function getSanFangSiZheng(branch: number): [number, number, number, number] {
  return [
    branch,
    (branch + 6) % 12,   // 对宫
    (branch + 4) % 12,   // 三合1
    (branch + 8) % 12,   // 三合2
  ];
}

/** 连线锚点：取宫格靠近盘心的一点，换算到盘心（2×2）内的百分比坐标——四点都落在盘心边框上 */
function heartAnchor(branch: number): [number, number] {
  const [r, c] = BRANCH_GRID_POS[branch];
  const x = c === 0 ? 0.25 : c === 3 ? 0.75 : (c + 0.5) / 4;
  const y = r === 0 ? 0.25 : r === 3 ? 0.75 : (r + 0.5) / 4;
  return [(x - 0.25) * 200, (y - 0.25) * 200];
}

const majorsOf = (p?: Palace) => p?.stars.filter(st => st.type === 'major').map(st => st.name).join('') || '无主星';

export default function ChartBoard({ chart, timeView, liunianYear, daxianIndex, onStarSelect, onPalaceSelect, onSiHuaClick }: ChartBoardProps) {
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);

  const palaceMap: Record<number, Palace> = {};
  chart.palaces.forEach(p => { palaceMap[p.branch] = p; });

  // 计算当前叠加四化数据（大限或流年）
  const currentDx = chart.daXians[daxianIndex ?? chart.currentDaXianIndex];
  const dxPalace = currentDx ? chart.palaces.find(p => p.branch === currentDx.palaceBranch) : undefined;
  const overlayData: Record<string, string> = (() => {
    if (timeView === 'daxian' && dxPalace) return buildSiHuaOverlay(dxPalace.stem);
    if (timeView === 'liunian') return buildSiHuaOverlay(getYearStemIndex(liunianYear));
    return {};
  })();
  const hasOverlay = Object.keys(overlayData).length > 0;
  const overlayLabel = timeView === 'daxian' ? '限' : timeView === 'liunian' ? '年' : undefined;
  const overlayCaption = timeView === 'daxian' && dxPalace
    ? `大限四化 · ${currentDx.startAge}–${currentDx.endAge} 岁 · 宫干${STEMS[dxPalace.stem]}`
    : timeView === 'liunian' ? `流年四化 · ${liunianYear} ${STEMS[getYearStemIndex(liunianYear)]}年` : '';
  const annualBranches = timeView === 'liunian' ? getAnnualPalaceBranches(liunianYear) : [];
  // 大限宫名：大限命宫在所选大限的宫位，其余按命、兄、夫…逆行排列（与流年宫名同法）。
  const daxianBranches = timeView === 'daxian' && currentDx
    ? PALACE_NAMES_ORDER.map((_, index) => (currentDx.palaceBranch - index + 12) % 12) : [];
  const annualStars = timeView === 'liunian' ? getAnnualStars(liunianYear) : [];

  const handlePalaceClick = (branch: number) => {
    const isDeselecting = selectedBranch === branch;
    setSelectedBranch(prev => prev === branch ? null : branch);
    if (!isDeselecting) {
      const palace = palaceMap[branch];
      if (palace) onPalaceSelect?.(palace);
    }
  };

  // 盘心与三方四正：未点选时默认展示命宫（不触发解读）
  const focusBranch = selectedBranch ?? chart.mingGongBranch;
  const sanFang = getSanFangSiZheng(focusBranch);
  const sanFangSet = new Set(sanFang);
  const focus = palaceMap[focusBranch];

  const natalHua = chart.palaces
    .flatMap(p => p.stars.filter(st => st.siHua))
    .sort((a, b) => HUA_ORDER.indexOf(a.siHua!) - HUA_ORDER.indexOf(b.siHua!));
  const overlayHua = Object.entries(overlayData)
    .sort((a, b) => HUA_ORDER.indexOf(a[1]) - HUA_ORDER.indexOf(b[1]));

  const [a0, a1, a2, a3] = sanFang.map(heartAnchor);
  const line = (p: [number, number], q: [number, number], key: string) => (
    <line key={key} x1={`${p[0]}%`} y1={`${p[1]}%`} x2={`${q[0]}%`} y2={`${q[1]}%`} />
  );

  const sfRow = (label: string, branch: number) => {
    const p = palaceMap[branch];
    return (
      <div>
        <i>{label}</i>
        <span>{p?.name} {BRANCHES[branch]}　<b>{majorsOf(p)}</b></span>
      </div>
    );
  };

  const annualIndex = (branch: number) => annualBranches.indexOf(branch);
  const focusAnnualStars = annualStars.find(item => item.branch === focusBranch)?.stars;

  const detailGroup = (title: string, list: Star[]) => list.length ? (
    <>
      <dt>{title}</dt>
      <dd>
        {list.map(st => (
          <span key={st.name}>
            {st.name}
            {st.brightnessRaw && <i>{st.brightnessRaw}</i>}
            {st.siHua && <HuaMark siHua={st.siHua} />}
            {overlayData[st.name] && <HuaMark siHua={overlayData[st.name]} overlay label={overlayLabel} />}
          </span>
        ))}
      </dd>
    </>
  ) : null;

  return (
    <div>
      <div className={s.board}>
        <div className={s.grid}>
          {RENDER_ORDER.map(branch => {
            const [row, col] = BRANCH_GRID_POS[branch];
            const palace = palaceMap[branch];
            if (!palace) return null;
            return (
              <PalaceCell
                key={branch}
                palace={palace}
                row={row}
                col={col}
                onClick={() => handlePalaceClick(branch)}
                onStarClick={onStarSelect ? star => onStarSelect(star, palace) : undefined}
                isSelected={focusBranch === branch}
                isSanFang={sanFangSet.has(branch) && focusBranch !== branch}
                overlayStarSiHua={hasOverlay ? overlayData : undefined}
                overlayLabel={overlayLabel}
                annualPalace={annualIndex(branch) >= 0 ? PALACE_NAMES_ORDER[annualIndex(branch)] : undefined}
                daxianPalace={daxianBranches.indexOf(branch) >= 0 ? `大${DAXIAN_SHORT[daxianBranches.indexOf(branch)]}` : undefined}
                annualStars={annualStars.find(item => item.branch === branch)?.stars}
                onSiHuaClick={onSiHuaClick ? (starName, siHua) => onSiHuaClick(starName, siHua, timeView) : undefined}
              />
            );
          })}

          {/* 盘心：选中宫的三方四正 + 本命四化 */}
          <div className={s.heart}>
            <svg className={s.lines} aria-hidden="true">
              {line(a0, a1, 'opp')}
              {line(a0, a2, 'h1')}
              {line(a0, a3, 'h2')}
              {line(a2, a3, 'h3')}
              {[a0, a1, a2, a3].map((p, i) => (
                <circle key={i} cx={`${p[0]}%`} cy={`${p[1]}%`} r={i === 0 ? 3 : 2.5} />
              ))}
            </svg>
            <div className={s.hc} aria-live="polite">
              <div><span className={`${s.hCap} ${s.ko}`}>{selectedBranch === null ? '命宫 · 三方四正' : '选中宫 · 三方四正'}</span></div>
              <div className={`${s.hName} ${s.ko}`}>{focus?.name}<small>{focus ? `${STEMS[focus.stem]}${BRANCHES[focus.branch]}` : ''}</small></div>
              <div className={`${s.sfsz} ${s.ko}`}>
                {sfRow('对宫', sanFang[1])}
                {sfRow('三合', sanFang[2])}
                {sfRow('三合', sanFang[3])}
              </div>
              {natalHua.length > 0 && (
                <div className={`${s.sihua} ${s.ko}`}>
                  <span className={s.lbl}>本命四化 · 年干{STEMS[chart.lunarInfo.yearStem]}</span>
                  {natalHua.map(st => (
                    <span key={`${st.name}-${st.siHua}`}>{st.name}<HuaMark siHua={st.siHua!} /></span>
                  ))}
                </div>
              )}
              {hasOverlay && (
                <div className={`${s.sihua} ${s.ko}`}>
                  <span className={s.lbl}>{overlayCaption}</span>
                  {overlayHua.map(([name, hua]) => (
                    <span key={`${name}-${hua}`}>{name}<HuaMark siHua={hua} overlay label={overlayLabel} /></span>
                  ))}
                </div>
              )}
              <div><span className={`${s.legend} ${s.ko}`}>亮度：庙旺 › 得利 › 平陷 · 虚线下为煞曜</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* 手机端：点宫看详情 */}
      {focus && (
        <section className={s.detail} aria-label={`${focus.name}详情`}>
          <h4>
            {focus.name} {STEMS[focus.stem]}{BRANCHES[focus.branch]}
            <span>
              {focus.daXianAge ? `大限 ${focus.daXianAge[0]}–${focus.daXianAge[1]}` : ''}
              {focus.isMingGong ? '　命宫' : ''}
              {focus.isShenGong ? '　身宫' : ''}
              {focus.isCurrentDaXian ? '　当前大限' : ''}
            </span>
          </h4>
          <dl>
            {detailGroup('主星', focus.stars.filter(st => st.type === 'major'))}
            {detailGroup('辅星', focus.stars.filter(st => st.type === 'lucky' || st.type === 'minor'))}
            {detailGroup('煞曜', focus.stars.filter(st => st.type === 'sha'))}
            {focusAnnualStars?.length ? <><dt>流曜</dt><dd>{focusAnnualStars.map(name => <span key={name}>{name}</span>)}</dd></> : null}
          </dl>
          <div className={s.detailHua}>
            <span className={s.lbl}>本命四化</span>
            {natalHua.map(st => (
              <span key={`${st.name}-${st.siHua}`}>{st.name}<HuaMark siHua={st.siHua!} /></span>
            ))}
          </div>
          {hasOverlay && (
            <div className={s.detailHua}>
              <span className={s.lbl}>{overlayCaption}</span>
              {overlayHua.map(([name, hua]) => (
                <span key={`${name}-${hua}`}>{name}<HuaMark siHua={hua} overlay label={overlayLabel} /></span>
              ))}
            </div>
          )}
          <p className={s.detailHint}>点宫位切换三方四正；命宫为默认。</p>
        </section>
      )}
    </div>
  );
}
