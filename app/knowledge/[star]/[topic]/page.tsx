/**
 * /knowledge/[star]/[topic] — SEO 落地页
 *
 * 14 主星 × 13 topic = 182 个独立 URL
 * 每页含完整的 STAR_DB 4 段论断（一句话定调/核心论断/命盘依据/经典出处）
 *
 * SEO 要点：
 *  - title 含主关键词（如"紫微入命宫·详解"）
 *  - description 用 dingdiao（一句话定调）
 *  - JSON-LD Article 结构化数据
 *  - 内链：同主星其他 12 宫 + 同宫其他 13 主星
 *  - generateStaticParams 静态生成，零运行时开销
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { TopicKey } from '@/lib/ziwei/db-analysis';
import {
  ALL_STARS,
  ALL_TOPICS,
  getKnowledge,
  getAllKnowledgeRoutes,
  STAR_BRIEF_SEO,
  STAR_TO_SLUG,
  SLUG_TO_STAR,
} from '@/lib/seo/knowledge';
import { SITE_URL } from '@/lib/site';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../../knowledge.module.css';

// 允许动态参数：如果某个 star/topic 组合不在 generateStaticParams 列表中
// 也允许运行时按需渲染，避免中文 URL 编码问题导致 404
export const dynamicParams = false;

export async function generateStaticParams() {
  const routes = getAllKnowledgeRoutes();
  // URL 用拼音 slug 替代中文，避开 Vercel/CDN 中文路由边界问题
  return routes.map(r => ({ star: r.slug, topic: r.topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ star: string; topic: string }> }) {
  const { star: slug, topic } = await params;
  const star = SLUG_TO_STAR[slug];
  if (!star) return {};
  const data = getKnowledge(star, topic as TopicKey);
  if (!data.exists) return {};

  const title = `${star}入${data.palaceName}宫 · ${data.topicLabel} · 详解`;
  const description = data.parsed.dingdiao
    || `${star}入${data.palaceName}宫的紫微斗数解读 — 依传统体系与古籍《紫微斗数全集》《骨髓赋》。`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    alternates: {
      canonical: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    keywords: [
      '紫微斗数', star, data.palaceName, data.topicLabel,
      `${star}${data.palaceName}`, `${star}入${data.palaceName}`,
      `紫微斗数 ${star}`, '紫微斗数全集',
    ],
  };
}

export default async function KnowledgePage({ params }: { params: Promise<{ star: string; topic: string }> }) {
  const { star: slug, topic } = await params;
  const star = SLUG_TO_STAR[slug];
  if (!star) notFound();
  const data = getKnowledge(star, topic as TopicKey);
  if (!data.exists) notFound();

  // 同主星其他 topic
  const otherTopicsForStar = ALL_TOPICS.filter(t => t !== topic && getKnowledge(star, t).exists);
  // 同 topic 其他主星
  const otherStarsForTopic = ALL_STARS.filter(s => s !== star && getKnowledge(s, topic as TopicKey).exists);

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${star}入${data.palaceName}宫 · ${data.topicLabel}`,
    description: data.parsed.dingdiao,
    author: { '@type': 'Organization', name: '紫微命盘' },
    publisher: {
      '@type': 'Organization',
      name: '紫微研究',
      url: SITE_URL,
    },
    datePublished: '2026-04-28',
    dateModified: '2026-04-28',
    mainEntityOfPage: `${SITE_URL}/knowledge/${slug}/${topic}`,
    articleSection: '紫微斗数',
    keywords: [`紫微斗数`, star, data.palaceName, data.topicLabel].join(', '),
  };


  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <main>
        <section className={styles.head}>
          <div className="wrap">
            <nav className={styles.crumb} aria-label="位置">
              <Link href="/knowledge">星曜知识</Link><span>/</span>
              <Link href={`/knowledge#star-${slug}`}>{star}</Link><span>/</span>
              {data.palaceName}
            </nav>
            <h1 className={styles.h1} style={{ marginTop: 14 }}>{star}入{data.palaceName}</h1>
            <p className={styles.eyebrow} style={{ marginTop: 8, marginBottom: 0 }}>{data.topicLabel} · 依传统体系与古籍</p>
            {STAR_BRIEF_SEO[star] && <p className={styles.lede}>{STAR_BRIEF_SEO[star]}</p>}
          </div>
        </section>

        <div className={`wrap ${styles.article}`}>
          <article>
            {data.parsed.dingdiao && (
              <p className={styles.dingdiao} style={{ marginTop: 0 }}><b>一句话定调</b>{data.parsed.dingdiao}</p>
            )}
            {data.parsed.lundian && (
              <Block label="核心论断"><div className={styles.body}><Paras text={data.parsed.lundian} /></div></Block>
            )}
            {data.parsed.yiju && (
              <Block label="命盘依据"><div className={styles.body}><Paras text={data.parsed.yiju} /></div></Block>
            )}
            {data.parsed.chuchu && (
              <Block label="经典出处"><div className={styles.source}><Paras text={data.parsed.chuchu} /></div></Block>
            )}
          </article>

          <aside className={styles.aside}>
            <div className={styles.cta}>
              <div className={styles.ctaIn}>
                <h2>看你自己命盘的{data.topicLabel}</h2>
                <p>输入出生年月日时起盘，解读会按你命盘里的真实星曜来写，并附古籍出处。</p>
                <Link href="/chart" className="btn-accent">起盘</Link>
              </div>
            </div>
            <p className={styles.asideNote}>
              想读原文，可到<Link href="/library">古籍原典库</Link>查《紫微斗数全集》《紫微斗数全书》《骨髓赋》。
            </p>
            <p className={styles.asideNote}>内容仅供学习参考，不构成医疗、投资、法律或重大决策建议。</p>
          </aside>
        </div>

        <div className="wrap" style={{ paddingBottom: 56 }}>
          {otherTopicsForStar.length > 0 && (
            <section className={styles.related}>
              <h2>{star}入其他宫</h2>
              <div className={styles.grid}>
                {otherTopicsForStar.map(t => {
                  const d = getKnowledge(star, t);
                  return (
                    <Link key={t} href={`/knowledge/${slug}/${t}`}>
                      入{d.palaceName}<small>{d.topicLabel}</small>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
          {otherStarsForTopic.length > 0 && (
            <section className={styles.related}>
              <h2>其他主星入{data.palaceName}</h2>
              <div className={styles.grid}>
                {otherStarsForTopic.slice(0, 13).map(s => (
                  <Link key={s} href={`/knowledge/${STAR_TO_SLUG[s]}/${topic}`}>
                    {s}<small>入{data.palaceName}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.blockLabel}>{label}</h2>
      {children}
    </section>
  );
}

function Paras({ text }: { text: string }) {
  return <>{text.split(/\n+/).map(line => line.trim()).filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</>;
}
