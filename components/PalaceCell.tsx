'use client';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { Palace, Star } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';
import s from './ChartBoard.module.css';

interface PalaceCellProps {
  palace: Palace;
  onClick?: () => void;
  onStarClick?: (star: Star) => void;
  isSelected?: boolean;
  isSanFang?: boolean;
  /** 宫格在 4×4 盘中的行列（0 起），用于收掉最外一圈的界栏 */
  row?: number;
  col?: number;
  /** 叠加四化：星名 → 四化类型（'禄'/'权'/'科'/'忌'） */
  overlayStarSiHua?: Record<string, string>;
  /** 叠加标签：'年'（流年）或 '限'（大限） */
  overlayLabel?: string;
  annualPalace?: string;
  /** 大限视图下这一宫在所选大限里的宫名，如「大命」「大财」。 */
  daxianPalace?: string;
  annualStars?: string[];
  /** 点击叠加四化 badge 回调 */
  onSiHuaClick?: (starName: string, siHua: string) => void;
}

/** 手机端宫格只保留六吉六煞与禄马，其余收进「+N」，点宫看详情 */
export const KEY_STARS = new Set(['左辅', '右弼', '文昌', '文曲', '天魁', '天钺', '禄存', '天马', '擎羊', '陀罗', '火星', '铃星', '地空', '地劫']);

const HUA_CLASS: Record<string, string> = { '禄': 'hua-lu', '权': 'hua-quan', '科': 'hua-ke', '忌': 'hua-ji' };

export function brightnessClass(raw?: string): string {
  if (raw === '庙' || raw === '旺') return s.b1;
  if (raw === '得' || raw === '利' || raw === '地') return s.b2;
  return s.b3;
}

export function HuaMark({ siHua, overlay, label, onClick }: {
  siHua: string;
  overlay?: boolean;
  label?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const title = overlay && label ? `${label === '年' ? '流年' : '大限'}化${siHua}` : `化${siHua}`;
  return (
    <span
      className={`hua ${HUA_CLASS[siHua] ?? ''}${overlay ? ' hua-overlay' : ''}${onClick ? ` ${s.clickable}` : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {siHua}
    </span>
  );
}

export default function PalaceCell({
  palace, onClick, onStarClick, isSelected, isSanFang, row = 0, col = 0,
  overlayStarSiHua, overlayLabel, onSiHuaClick, annualPalace, annualStars, daxianPalace,
}: PalaceCellProps) {
  const { stem, name, stars, daXianAge, isCurrentDaXian, isMingGong, isShenGong } = palace;
  const ganzhi = `${STEMS[stem]}${BRANCHES[palace.branch]}`;

  const majorStars = stars.filter(st => st.type === 'major');
  const auxStars = stars.filter(st => st.type === 'lucky' || st.type === 'minor');
  const shaStars = stars.filter(st => st.type === 'sha');
  const hiddenCount = stars.filter(st => st.type !== 'major' && !KEY_STARS.has(st.name)).length;

  const overlayFor = (star: Star) => {
    const overlaySiHua = overlayStarSiHua?.[star.name];
    if (!overlaySiHua) return null;
    return (
      <HuaMark
        siHua={overlaySiHua}
        overlay
        label={overlayLabel}
        onClick={onSiHuaClick ? e => { e.stopPropagation(); onSiHuaClick(star.name, overlaySiHua); } : undefined}
      />
    );
  };

  const starClick = onStarClick
    ? (star: Star) => (e: MouseEvent) => { e.stopPropagation(); onStarClick(star); }
    : undefined;

  const smallStar = (star: Star, extraClass = '') => (
    <span
      key={star.name}
      className={`${s.st}${KEY_STARS.has(star.name) ? '' : ` ${s.extra}`}${extraClass}${starClick ? ` ${s.clickable}` : ''}`}
      onClick={starClick?.(star)}
    >
      {star.name}
      {star.brightnessRaw && <span className={`${s.br} ${brightnessClass(star.brightnessRaw)}`}>{star.brightnessRaw}</span>}
      {star.siHua && <HuaMark siHua={star.siHua} />}
      {overlayFor(star)}
    </span>
  );

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const tags = [isMingGong && '命宫', isShenGong && '身宫', isCurrentDaXian && '当前大限'].filter(Boolean).join('、');
  const ariaLabel = `${name} ${ganzhi}，主星${majorStars.map(st => st.name).join('、') || '无'}${tags ? `，${tags}` : ''}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!isSelected}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={handleKey}
      className={[
        s.cell,
        col === 3 && s.c3,
        row === 3 && s.r3,
        isCurrentDaXian && s.cur,
        isSanFang && s.tri,
        isSelected && s.sel,
      ].filter(Boolean).join(' ')}
      style={{ gridRow: row + 1, gridColumn: col + 1 }}
    >
      {/* 主星 */}
      <div className={s.majors}>
        {majorStars.length === 0 && (
          <span className={s.empty}>
            空宫
            {palace.borrowedStars?.length ? <small>借{palace.borrowedStars.join('')}</small> : null}
          </span>
        )}
        {majorStars.map(star => (
          <span
            key={star.name}
            className={`${s.mj}${starClick ? ` ${s.clickable}` : ''}`}
            onClick={starClick?.(star)}
          >
            {star.name}
            {star.brightnessRaw && <span className={`${s.br} ${brightnessClass(star.brightnessRaw)}`}>{star.brightnessRaw}</span>}
            {star.siHua && <HuaMark siHua={star.siHua} />}
            {overlayFor(star)}
          </span>
        ))}
      </div>

      {/* 吉星、杂曜 */}
      {(auxStars.length > 0 || hiddenCount > 0) && (
        <div className={s.minors}>
          {auxStars.map(star => smallStar(star, star.type === 'minor' ? ` ${s.mn}` : ''))}
          {hiddenCount > 0 && <span className={s.more}>+{hiddenCount}</span>}
        </div>
      )}

      {/* 煞曜：虚线之下 */}
      {shaStars.length > 0 && (
        <div className={s.shas}>
          {shaStars.map(star => smallStar(star))}
        </div>
      )}

      {/* 大限宫名 */}
      {daxianPalace && (
        <div className={s.annual}>
          <b>{daxianPalace}</b>
        </div>
      )}

      {/* 流年 */}
      {(annualPalace || annualStars?.length) ? (
        <div className={s.annual}>
          {annualPalace && <b>流年{annualPalace.replace(/宫$/, '')}</b>}
          {annualStars?.length ? <span> {annualStars.join(' ')}</span> : null}
        </div>
      ) : null}

      <div className={s.foot}>
        <span className={s.pname}>
          {isMingGong ? <span className={s.ming}>{name}</span> : name}
          {isShenGong && <span className={s.tag} title="身宫">身</span>}
          {isCurrentDaXian && <span className={`${s.tag} ${s.tagDx}`} title="当前大限">限</span>}
        </span>
        <span className={s.gz}>
          <b>{ganzhi}</b>
          {daXianAge && <i>{daXianAge[0]}–{daXianAge[1]}</i>}
        </span>
      </div>
    </div>
  );
}
