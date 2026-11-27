import { normalize, retrieveClassics } from './classics/retrieval';
import type { RelationshipIntent } from './conversation-intent';

const patterns: Array<[RelationshipIntent, RegExp]> = [
  ['romance', /婚|恋|戀|感情|姻缘|姻緣|伴侣|伴侶|对象|對象|情侣|情侶|配偶|夫妻|妻子|丈夫|女友|男友|正缘|正緣|桃花|合婚/],
  ['business', /合伙|合夥|合股|合作|生意|商业|商業|创业|創業|搭档|搭檔|同事/],
  ['family', /亲子|親子|父母|子女|孩子|母子|母女|父子|父女|家庭/],
  ['friendship', /朋友|友谊|友誼|友情|闺蜜|閨蜜/],
];

const focused: Partial<Record<RelationshipIntent, { query: string; evidence: RegExp }>> = {
  romance: { query: '合婚 婚配 配偶 双方命盘 夫妻宫 相契 合参', evidence: /合婚|婚配|配婚|相契|雙方命盤|双方命盘/ },
  business: { query: '紫微斗数 合伙 合作 事业 官禄 交友宫 双方相处', evidence: /合伙|合夥|合作|事業|事业|官祿|官禄|交友|僕役|仆役/ },
  family: { query: '紫微斗数 亲子 父母 子女 家庭关系 相处', evidence: /親子|亲子|父母|子女|家庭/ },
  friendship: { query: '紫微斗数 朋友 交友宫 友情 人际关系 相处', evidence: /朋友|交友|友情|友誼|友谊|人際|人际|僕役|仆役/ },
};

function explicitRelationship(question: string): RelationshipIntent | undefined {
  const matches = patterns.filter(([, pattern]) => pattern.test(question));
  return matches.length === 1 ? matches[0][0] : undefined;
}

const MAJOR_STARS = ['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军'];

/** 双方本命核对清单里的检索词（主星组合 + 宫名 + 四化 + 煞星），见 lib/ziwei/checklists.ts。 */
type ChartQueries = { marriage?: string[]; career?: string[] } | null | undefined;

// 恋爱婚姻（以及没说明关系时）看双方夫妻宫、命宫；合伙看双方官禄宫、命宫。亲子、朋友在清单里没有对应项。
const CHECKLIST_TOPIC: Partial<Record<RelationshipIntent | 'general', 'marriage' | 'career'>> = {
  romance: 'marriage', general: 'marriage', business: 'career',
};

export async function retrieveHemingReferences(question: string, rewritten: string, detected?: RelationshipIntent,
  charts: ChartQueries[] = []) {
  // Explicit changes in the current question take priority over earlier context.
  const relationship = explicitRelationship(question) ?? detected ?? explicitRelationship(rewritten) ?? 'general';
  const topic = focused[relationship];
  // 按两人各自的星曜组合查书：通用问句查到的多是泛论，书上对具体组合的判法要靠组合本身去搜。
  const checklistTopic = CHECKLIST_TOPIC[relationship];
  const chartQueries = checklistTopic ? charts.flatMap(chart => chart?.[checklistTopic] ?? []) : [];
  const [ordinary, specialized, ...perChart] = await Promise.all([
    retrieveClassics(rewritten),
    topic ? retrieveClassics(topic.query) : Promise.resolve([]),
    ...chartQueries.map(query => retrieveClassics(query)),
  ]);
  const relevant = topic ? specialized.filter(item => topic.evidence.test(item.text)) : [];
  // 只留同时讲到这个宫和这一方主星的片段：按组合搜回来的结果里常混着别的宫、别的星的论述。
  perChart.forEach((hits, index) => {
    const words = chartQueries[index].split(' ');
    const palace = words.find(word => word.endsWith('宫'))?.replace(/宫$/, '') ?? '';
    const stars = words.filter(word => MAJOR_STARS.includes(word));
    perChart[index] = hits.filter(hit => {
      const text = normalize(hit.text);
      return text.includes(palace) && stars.some(star => text.includes(star));
    });
  });
  // 星曜组合的判法放最前，再留给关系主题的片段，最后是原问句的结果。
  const sources = [...perChart.flatMap(hits => hits.slice(0, 2)), ...ordinary.slice(0, 4), ...relevant.slice(0, 3), ...ordinary.slice(4)];
  return {
    relationship,
    references: [...new Map(sources.map(item => [item.url, item])).values()].slice(0, 12),
  };
}
