/**
 * /knowledge — 知识库主页
 * 列出 14 主星，每星可看其在 13 宫位的解读
 */

import Link from 'next/link';
import { ALL_STARS, ALL_TOPICS, getKnowledge, STAR_BRIEF_SEO, STAR_TO_SLUG } from '@/lib/seo/knowledge';
import { TOPIC_LABEL } from '@/lib/ziwei/db-analysis';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from './knowledge.module.css';

export const metadata = {
  title: '紫微斗数知识库 · 14 主星 × 13 宫位 · 传统体系',
  description: '依传统紫微斗数体系与古籍《紫微斗数全集》《骨髓赋》编纂的紫微斗数知识库。覆盖 14 主星在 13 个宫位的完整论断，含一句话定调、核心论断、命盘依据、经典出处。',
  keywords: ['紫微斗数', '紫微斗数全集', '紫微斗数全书', '14 主星', '12 宫位'],
};

export default function KnowledgeHomePage() {
  const total = ALL_STARS.reduce((n, star) => n + ALL_TOPICS.filter(t => getKnowledge(star, t).exists).length, 0);
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.head}>
          <div className="wrap">
            <p className={styles.eyebrow}>星曜知识 · <b>依传统体系与古籍编纂</b></p>
            <h1 className={styles.h1}>十四主星，各入十三宫</h1>
            <p className={styles.lede}>
              每颗主星落在不同宫位，论断各不相同。这里按星、按宫分条写出，每条有定调、论断、命盘依据与古籍出处{total > 0 ? <>，现有 <strong>{total}</strong> 条</> : '，条目正在整理'}。
            </p>
            <nav className={styles.cols} aria-label="十四主星">
              {ALL_STARS.map(star => (
                <a key={star} href={`#star-${STAR_TO_SLUG[star]}`}>{star}</a>
              ))}
            </nav>
          </div>
        </section>

        <section className={styles.sec}>
          <div className={`wrap ${styles.secGrid}`}>
            <h2 className={styles.juan}>主星<small>十四</small></h2>
            <ol className={styles.stars}>
              {ALL_STARS.map(star => {
                const topics = ALL_TOPICS.map(t => ({ t, k: getKnowledge(star, t) })).filter(({ k }) => k.exists);
                return (
                  <li key={star} id={`star-${STAR_TO_SLUG[star]}`}>
                    <h3 className={styles.starName}>
                      {topics.some(({ t }) => t === 'overview')
                        ? <Link href={`/knowledge/${STAR_TO_SLUG[star]}/overview`}>{star}</Link>
                        : star}
                    </h3>
                    <div>
                      {STAR_BRIEF_SEO[star] && <p className={styles.starBrief}>{STAR_BRIEF_SEO[star]}</p>}
                      {topics.length > 0 ? (
                        <div className={styles.grid}>
                          {topics.map(({ t, k }) => (
                            <Link key={t} href={`/knowledge/${STAR_TO_SLUG[star]}/${t}`}>
                              入{k.palaceName}
                              <small>{TOPIC_LABEL[t]}</small>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
