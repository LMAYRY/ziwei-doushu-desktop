import { HEMING_METHODOLOGY } from '@/lib/ziwei/heming-knowledge';
import { buildChartContextParts } from '@/lib/chart-context';
import { retrieveHemingReferences } from '@/lib/heming-retrieval';
import { resolveConversationIntent } from '@/lib/conversation-intent';
import { streamDeepSeek, type DeepSeekMessage } from '@/lib/deepseek-stream';
import { INDEPENDENT_JUDGMENT } from '@/lib/interpretation-guidance';
import { withoutAuthors } from '@/lib/classics/citation';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_QUESTION_CHARS = 4_000;
const RELATIONSHIP_LABELS = { romance: '恋人或伴侣', family: '家人', friendship: '朋友', business: '合伙人或同事' } as const;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonError('请求内容过大。', 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError('无法读取请求内容。', 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonError('请求内容过大。', 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError('请求内容不是有效的 JSON。', 400);
  }

  const payload = asRecord(body);

  if (payload?.question !== undefined && payload.question !== null && typeof payload.question !== 'string') {
    return jsonError('问题格式不正确。', 400);
  }
  if (payload?.previousAnalysis !== undefined && payload.previousAnalysis !== null && typeof payload.previousAnalysis !== 'string') {
    return jsonError('上一轮分析内容格式不正确。', 400);
  }

  const question = typeof payload?.question === 'string' ? payload.question.trim() : '';
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError('问题内容过长，请缩短后重试。', 400);
  }
  const previousAnalysis = typeof payload?.previousAnalysis === 'string'
    ? payload.previousAnalysis.trim()
    : '';
  if (previousAnalysis.length > 12_000) {
    return jsonError('上一轮分析内容过长，请重新开始合盘分析。', 400);
  }

  // 用户在合盘页选定的两人关系；旧版页面不传时为空，仍按恋爱婚姻分析并在开头提示一句。
  const chosen = typeof payload?.relationship === 'string' && Object.hasOwn(RELATIONSHIP_LABELS, payload.relationship)
    ? payload.relationship as keyof typeof RELATIONSHIP_LABELS : null;
  const userPrompt = question || [
    '请对双方作一次完整的合盘解读。',
    '说明双方各自的关系需求、容易互相支持的部分、可能产生摩擦的模式，以及相处或合作建议。',
    chosen ? `两人的关系是${RELATIONSHIP_LABELS[chosen]}，按这个关系分析。` : '没有说明两人关系时，按恋爱婚姻关系分析。',
  ].join('\n');
  let history: DeepSeekMessage[] = [];
  if (payload?.messages !== undefined) {
    if (!Array.isArray(payload.messages)) return jsonError('对话记录格式不正确。', 400);
    for (const item of payload.messages.slice(-24)) {
      const message = asRecord(item);
      if (!message || (message.role !== 'user' && message.role !== 'assistant')
        || typeof message.content !== 'string' || message.content.length > 12_000) {
        return jsonError('对话记录格式不正确。', 400);
      }
      if (message.content.trim()) history.push({ role: message.role, content: message.content.trim() });
    }
  } else if (previousAnalysis && question) {
    history = [{ role: 'assistant', content: previousAnalysis }];
  }
  const conversation: DeepSeekMessage[] = [...history, { role: 'user', content: userPrompt }];
  const intent = question ? await resolveConversationIntent(conversation, request.signal, 'heming') : null;
  const searchQuestion = intent && !intent.ambiguous ? intent.query : userPrompt;
  const mentionsTime = /(?:18|19|20|21|22)\d{2}|去年|今年|明年|后年|未来|接下来|今后/.test(userPrompt);
  const knownYears = new Set(conversation.slice(-7).flatMap(message =>
    [...message.content.matchAll(/(?<!\d)(?:18|19|20|21|22)\d{2}(?!\d)/g)].map(match => match[0])));
  const intentYears = searchQuestion.match(/(?<!\d)(?:18|19|20|21|22)\d{2}(?!\d)/g) ?? [];
  const flowQuestion = mentionsTime || intentYears.some(year => !knownYears.has(year))
    ? userPrompt : searchQuestion;
  const chartA = buildChartContextParts(payload?.chartA, flowQuestion);
  const chartB = buildChartContextParts(payload?.chartB, flowQuestion);
  if (!chartA || !chartB) {
    return jsonError('双方命盘格式不正确，请重新起盘后再试。', 400);
  }
  const queriesOf = (stable: string) => {
    const lists = (JSON.parse(stable) as { checklists?: Record<string, { queries?: string[] } | null> | null }).checklists;
    return lists ? { marriage: lists.marriage?.queries, career: lists.career?.queries } : null;
  };
  const retrieval = intent?.ambiguous ? { relationship: 'general', references: [] }
    : await retrieveHemingReferences(userPrompt, searchQuestion, chosen ?? intent?.relationship,
      [queriesOf(chartA.stable), queriesOf(chartB.stable)]);
  const references = retrieval.references.map(reference => ({
    ...reference,
    source: withoutAuthors(reference.source),
    citation: `[${withoutAuthors(reference.source).split(' · ')[0]} · ${reference.title}](${reference.url})`,
  }));

  const systemPrompt = [
    '你是一个谨慎、清晰的中文紫微斗数合盘解读助手。',
    '甲方与乙方的命盘均由本地排盘引擎生成。请比较两盘中的命宫、身宫、夫妻宫、福德宫、星曜与四化；只使用提供的数据，不补造缺失信息。',
    INDEPENDENT_JUDGMENT,
    '以传统紫微斗数口径解读双方的相处倾向。',
    '方法论参考：',
    HEMING_METHODOLOGY,
    '回答要求：',
    '如果请求包含上一轮的合盘分析，这次是追问：参考上一轮内容，直接回答用户的新问题，不必重复整篇分析。',
    '若用户明确询问恋爱或婚姻，可按双方命宫、夫妻宫与福德宫互参。若询问合伙或共同做项目，只引用与合作问题直接相关的盘面信息，不使用夫妻宫推断合作。亲子或朋友问题聚焦对应关系中的沟通与边界。',
    '只采用与问题和盘面相关的片段，区分不同流派，不把单盘婚姻描述当作已验证的双盘合参方法。',
    '双方各自的数据包含本命、大限和逐年 liunian。回答指定年份时分别核对甲乙双方该年的大限四化、流年四化、focusedFlowYears 逐宫配对；标明哪一方、哪一年、哪个宫位。flowStars 是流曜，与本命星曜区分。用户没有指定年份时，个人化分析结合当前年；不要把两人的星曜或运限互换。',
    '每年的 palaceBranches 和 palaceBranchNames 与 flowPalaceOrder 按索引一一对应；以相同 branch 查询本命 palaces，可核对该流年宫叠加的本命宫。focusedFlowYears 已预先配对相关年份的流年宫、本命宫与流曜，优先使用对应条目，空数组表示该宫没有提供流曜。不要补造未提供的流曜或流月；时辰不详时不要把占位时辰生成的宫位视为确定。',
    '用户要求回顾过去时，结合双方各年的 liunian 和所属大限比较相关年份，并邀请用户核对经历；不能仅凭相同四化断定事件发生。只问概念或书籍时不必强加流年。',
    '问合不合、适不适合结婚、能否长久时，第一句给出明确的契合度，用五档：很好、偏好、普通、偏差、较差，档位由书上对两人具体星曜组合、四化互入的判法和盘面决定，书上没有判法的项不参与升降。不要默认写成“有基础，但有一个摩擦点”“需要双方都让一步”的结构：只有盘面确实同时有明显的支持和制约时才那样说；支持明显就直说契合度好，制约明显就直说契合度差。',
    '判断通则：契合度、相处难易、能否长久等结论按一般情况分布，普通最常见，明显好或明显差都要有本盘的具体依据；结论只由两人盘面决定，不因问的是感情就默认往坏处说或往好处说。缺少有利条件只说明少了这项助力，不等于不合；判不合、难长久，必须有书上明确主凶的条件在两盘成立（如化忌互冲、煞星叠入对方夫妻宫）。书上泛泛的总括句只能作补充，不能单独作为结论依据；优先引用书上针对具体星曜组合的判法。注意事项最多一条，且要点名对应的星曜和宫位，不说“多沟通”“互相包容”这类通用建议，除非紧接着给出盘面依据。',
    '双方命盘 JSON 里的 checklists 是程序整理的本命核对清单（marriage 为夫妻宫、命宫、福德宫，career 为官禄宫、命宫、迁移宫、财帛宫），列出主星及庙旺利陷、空宫借星、生年四化、吉星和煞星，只是事实，不含结论。检索资料已按双方这些宫位的星曜组合查过书：先逐方读清单，再到资料片段里找书上对该组合的判法，写出成立条件和本盘是否满足，满足才引用并附 citation；条件不满足的判法不能拿来支持结论。某一方的关键宫（恋爱婚姻看夫妻宫、命宫，合伙看官禄宫、命宫）在资料里找不到书上对该组合的判法时，在说到这一方这一宫的地方用半句话说明“这一点书库里没有找到直接判法，按盘面常规看”，不要写得像有书为证；契合度只由有书上判法支持的项来升降，没有判法支持的描述不参与定档。checklists 这个字段名不要写进回答。',
    '先给有依据的明确判断，解释主要支持和制约条件，不用空泛的中性套话。只使用直接支持判断的资料片段，在对应段落末尾附该片段 citation；正文提到书籍时只写书名，不写作者、注者或讲者姓名，也不提任何命理老师或流派人物的姓名，片段正文里出现的人名也不要转述。资料不足时明确指出，不能虚构出处。',
    '避免“克夫/克妻”“命中注定”“必然离婚”“生离死别”等标签或确定性预测。指出依据来自哪一方、哪一宫或哪些星曜。',
    '用自然、平实的简体中文。先回答用户问的事，再说是哪一方、哪一宫的哪些信息支持这个看法。建议贴着前文提到的具体情境说。',
    '具体问题优先用两三个短段落，只解释最相关的一两条命盘依据，除非用户要求展开。用可能发生的情境说明摩擦点，不判断发生概率。开头直接答，讲完就收，省去通用免责声明。只有缺失的数据会改变用户问的判断时，才在对应一句旁具体说缺什么。',
    '甲方命盘（JSON）：',
    chartA.stable,
    '乙方命盘（JSON）：',
    chartB.stable,
    ...(intent?.ambiguous ? ['用户指代或词义不明确，先简短询问具体指什么。']
      : intent ? [`结合上下文理解的问题：${JSON.stringify(intent.query)}；用户原话用于确定提问，盘面事实以程序数据为准。`] : []),
    `${chosen ? `用户已在页面上选定两人关系为${RELATIONSHIP_LABELS[chosen]}，直接按这个关系分析，不要说明或询问关系类型；追问里明确提到别的关系时以追问为准。` : ''}本次检索的关系主题：${retrieval.relationship}。这是内部检索分类，不是对两人关系的事实认定，回答里不要提到它；如与用户明确表达的关系类型不一致，以用户表达为准。${chosen ? '' : '用户没有提问、也没说明两人关系时，按恋爱婚姻关系分析，只在开头用一句话说明「如果是合作、朋友或家人关系，可以告诉我再按对应关系看」，不要反复强调关系类型未说明。'}只采用与问题和盘面相关的片段，区分不同流派，不把单盘婚姻描述当作已验证的双盘合参方法。`,
    '本轮对照数据：palaceSummary 给出各自的本命宫位中文地支与主星，focusedFlowYears 为重点年份，extraFlowYears 为超出完整周期的其他指定年份；分别与对应命盘的 liunian 一并使用，勿混淆甲乙和本命与流年。',
    '甲方本轮流年：', chartA.dynamic,
    '乙方本轮流年：', chartB.dynamic,
    '检索资料片段：',
    JSON.stringify(references),
  ].join('\n\n');

  const messages: DeepSeekMessage[] = [{ role: 'system', content: systemPrompt }, ...conversation];
  const sourceLinks = [...new Map(references.map(({ url, citation }) => [url, citation])).values()];
  // 合盘每次都要给契合度：和单盘问财富、姻缘一样用低温度，同一对盘的档位和引用不要忽有忽无。
  return streamDeepSeek(messages, request.signal, sourceLinks, references.map(({ url, text }) => ({ url, text })),
    undefined, 0.3);
}
