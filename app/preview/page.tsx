'use client';
import { useState } from 'react';
import Link from 'next/link';
import ScrollIntro from '@/components/ScrollIntro';

/** 卷轴开场样片：播放一次后显示说明与重播入口。 */
export default function PreviewPage() {
  // replayKey 用于强制重置 ScrollIntro（用户点「再播放一次」时）
  const [replayKey, setReplayKey] = useState(0);
  const [done, setDone] = useState(false);

  return (
    <>
      {!done && <ScrollIntro key={replayKey} onComplete={() => setDone(true)} />}

      {done && (
        <main className="wrap" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 48, paddingBottom: 48 }}>
          <p className="ui" style={{ fontSize: 14, color: 'var(--ink-3)' }}>开场预览</p>
          <h1 style={{ marginTop: 8, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, lineHeight: 1.3 }}>紫微命盘 · 卷轴开场</h1>
          <p style={{ marginTop: 16, maxWidth: '32em', fontSize: 17, color: 'var(--ink-2)' }}>
            书页从中缝向两侧展开，题名与印章浮现后淡出，约三秒；系统开启「减弱动态效果」时不做展开，直接显示后淡出。随时可点「跳过」。
          </p>

          <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-accent" onClick={() => { setDone(false); setReplayKey(k => k + 1); }}>
              再播放一次
            </button>
            <Link className="btn-ghost" href="/">进入首页</Link>
          </div>

          <nav className="ui" style={{ marginTop: 40, display: 'flex', gap: 24, fontSize: 14, color: 'var(--ink-3)' }}>
            <Link className="link" href="/chart">起盘</Link>
            <Link className="link" href="/heming">合盘</Link>
            <Link className="link" href="/library">古籍库</Link>
          </nav>
        </main>
      )}
    </>
  );
}
