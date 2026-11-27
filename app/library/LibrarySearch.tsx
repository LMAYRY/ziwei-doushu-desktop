'use client';

/**
 * 古籍库搜索框 — client component
 *
 * 输入 → 跳转 /library/search?q=xxx
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './library.module.css';

export default function LibrarySearch({ defaultValue = '' }: { defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const query = q.trim();
    if (!query) return;
    startTransition(() => {
      router.push(`/library/search?q=${encodeURIComponent(query)}`);
    });
  };

  return (
    <form
      className={styles.searchRow}
      role="search"
      onSubmit={e => { e.preventDefault(); submit(); }}
    >
      <input
        className="field"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="检索原文，如：七杀朝斗"
        aria-label="检索古籍原文"
      />
      <button type="submit" className="btn-accent" disabled={isPending || !q.trim()}>
        {isPending ? '检索中' : '检索'}
      </button>
    </form>
  );
}
