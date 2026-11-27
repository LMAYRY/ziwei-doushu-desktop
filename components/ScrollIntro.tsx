'use client';
import { useEffect, useState } from 'react';
import s from './ScrollIntro.module.css';

interface ScrollIntroProps {
  onComplete: () => void;
  /** 跳过按钮文案 */
  skipLabel?: string;
}

/**
 * 卷轴开场（纸本版）：一张刻本书页从中缝向两侧展开，题名与印章浮现，随后淡出。
 * 只用 CSS 动画、只用主题变量；prefers-reduced-motion 下不做展开，直接静态显示后淡出。
 */
export default function ScrollIntro({ onComplete, skipLabel = '跳过' }: ScrollIntroProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hold = reduce ? 1200 : 3000;
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(onComplete, hold + 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  const handleSkip = () => {
    setLeaving(true);
    setTimeout(onComplete, 300);
  };

  return (
    <div className={`${s.overlay} ${leaving ? s.leaving : ''}`} role="presentation">
      <div className={s.leaf}>
        <div className={s.leafIn}>
          <p className={s.top}>紫微斗数排盘与解读</p>
          <h1 className={s.title}>紫微命盘</h1>
          <p className={s.sub}>依传统紫微斗数体系</p>
          <span className={`seal ${s.seal}`} aria-hidden>紫</span>
        </div>
      </div>
      <button type="button" className={s.skip} onClick={handleSkip}>{skipLabel}</button>
    </div>
  );
}
