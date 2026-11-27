'use client';
import { SI_HUA_TABLE } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';
import s from './TimeNav.module.css';

export type TimeView = 'mingpan' | 'daxian' | 'liunian';

interface TimeNavProps {
  chart: ZiweiChart;
  view: TimeView;
  liunianYear: number;
  /** 正在查看的大限（chart.daXians 的下标）。 */
  daxianIndex: number;
  onViewChange: (view: TimeView) => void;
  onYearChange: (year: number) => void;
  onDaxianChange: (index: number) => void;
}

/** 大限宫名的简称：大命、大兄、大夫……（与流年宫名同序）。 */
export const DAXIAN_SHORT = ['命', '兄', '夫', '子', '财', '疾', '迁', '友', '官', '田', '福', '父'];

/** 由年份计算天干索引 (0-9) */
export function getYearStemIndex(year: number): number {
  return ((year - 4) % 10 + 10) % 10;
}

/** 根据天干索引返回四化映射：starName → SiHua */
export function buildSiHuaOverlay(stemIndex: number): Record<string, string> {
  const stars = SI_HUA_TABLE[stemIndex];
  if (!stars) return {};
  return {
    [stars[0]]: '禄',
    [stars[1]]: '权',
    [stars[2]]: '科',
    [stars[3]]: '忌',
  };
}

/** 本命 / 大限 / 流年 分段按钮 + 大限选择或流年年份切换。叠加四化的明细显示在盘心。 */
export default function TimeNav({
  chart,
  view,
  liunianYear,
  daxianIndex,
  onViewChange,
  onYearChange,
  onDaxianChange,
}: TimeNavProps) {
  const currentDx = chart.daXians[chart.currentDaXianIndex];
  const daxians = chart.daXians;
  const stepDaxian = (delta: number) => {
    const next = daxianIndex + delta;
    if (next >= 0 && next < daxians.length) onDaxianChange(next);
  };

  const stepYear = (delta: number) => {
    onYearChange(liunianYear + delta);
    if (view !== 'liunian') onViewChange('liunian');
  };

  return (
    <div className={s.ctrls}>
      <div className="seg" role="group" aria-label="时间维度">
        <button type="button" aria-pressed={view === 'mingpan'} onClick={() => onViewChange('mingpan')}>本命</button>
        <button
          type="button"
          aria-pressed={view === 'daxian'}
          onClick={() => onViewChange('daxian')}
          title={currentDx ? `当前大限 ${currentDx.startAge}–${currentDx.endAge} 岁` : undefined}
        >
          大限
        </button>
        <button type="button" aria-pressed={view === 'liunian'} onClick={() => onViewChange('liunian')}>流年</button>
      </div>
      {view === 'daxian' ? (
        <div className={`${s.year} ${s.on}`}>
          <button type="button" aria-label="上一个大限" disabled={daxianIndex <= 0} onClick={() => stepDaxian(-1)}>‹</button>
          <label className={s.dxField}>
            <select
              aria-label="选择大限"
              value={daxianIndex}
              onChange={event => onDaxianChange(Number(event.target.value))}
            >
              {daxians.map((dx, index) => (
                <option key={index} value={index}>
                  {dx.startAge}–{dx.endAge} 岁 · {dx.palaceName}{index === chart.currentDaXianIndex ? '（当前）' : ''}
                </option>
              ))}
            </select>
            <small>大限</small>
          </label>
          <button type="button" aria-label="下一个大限" disabled={daxianIndex >= daxians.length - 1} onClick={() => stepDaxian(1)}>›</button>
        </div>
      ) : (
      <div className={`${s.year}${view === 'liunian' ? ` ${s.on}` : ''}`}>
        <button type="button" aria-label="上一年" onClick={() => stepYear(-1)}>‹</button>
        <label className={s.yearField}>
          <input
            aria-label="查看流年年份"
            type="number"
            inputMode="numeric"
            key={liunianYear}
            min={1900}
            max={2200}
            defaultValue={liunianYear}
            onClick={() => { if (view !== 'liunian') onViewChange('liunian'); }}
            onBlur={event => {
              const year = Number(event.target.value);
              if (Number.isInteger(year) && year >= 1900 && year <= 2200) onYearChange(year);
              else event.target.value = String(liunianYear);
            }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />
          <small>流年</small>
        </label>
        <button type="button" aria-label="下一年" onClick={() => stepYear(1)}>›</button>
      </div>
      )}
    </div>
  );
}
