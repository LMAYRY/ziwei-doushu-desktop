'use client';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { PROVINCES } from '@/lib/ziwei/cities';
import { SHICHEN } from '@/lib/ziwei/constants';
import { calcTrueSolarBranch, formToBirthInfo } from '@/lib/ziwei/share';
import s from './home.module.css';

/** /chart 页启动时从这个键恢复出生信息并直接排盘（见 app/chart/page.tsx）。 */
const CHART_BIRTH_KEY = 'ziwei-chart-birth-v1';

type LunarLib = typeof import('@/lib/ziwei/lunar-solar');
type BirthFormState = Parameters<typeof formToBirthInfo>[0];

const THIS_YEAR = new Date().getFullYear();
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];

function solarDayCount(year: number, month: number) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

/** 卷首起盘表：五项填完，存进 /chart 的恢复键后跳转，/chart 直接出盘。 */
function HomeBirthForm() {
  const router = useRouter();
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>('solar');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState(''); // 农历闰月记作 'L6'
  const [day, setDay] = useState('');
  const [time, setTime] = useState('08:00');
  const [unknownTime, setUnknownTime] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [lunar, setLunar] = useState<LunarLib | null>(null);

  // 农历换算库体积较大，切到农历时才加载
  useEffect(() => {
    if (calendar !== 'lunar' || lunar) return;
    let alive = true;
    import('@/lib/ziwei/lunar-solar').then(mod => { if (alive) setLunar(mod); });
    return () => { alive = false; };
  }, [calendar, lunar]);

  const y = parseInt(year) || 0;
  const isLeap = month.startsWith('L');
  const m = parseInt(month.replace('L', '')) || 0;

  const yearMax = calendar === 'lunar' ? Math.min(THIS_YEAR, lunar?.LUNAR_YEAR_MAX ?? THIS_YEAR) : THIS_YEAR;
  const years = useMemo(() => Array.from({ length: yearMax - 1900 + 1 }, (_, i) => yearMax - i), [yearMax]);

  const leapMonth = calendar === 'lunar' && lunar && y ? lunar.leapMonthOfLunarYear(y) : 0;
  const months = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (let i = 1; i <= 12; i++) {
      list.push({ value: String(i), label: calendar === 'lunar' ? `${LUNAR_MONTHS[i - 1]}月` : String(i) });
      if (i === leapMonth) list.push({ value: `L${i}`, label: `闰${LUNAR_MONTHS[i - 1]}月` });
    }
    return list;
  }, [calendar, leapMonth]);

  const dayCount = calendar === 'lunar'
    ? (lunar && y && m ? lunar.lunarMonthDayCount(y, m, isLeap) || 30 : 30)
    : solarDayCount(y, m);

  const cities = useMemo(() => PROVINCES.find(p => p.name === province)?.cities ?? [], [province]);
  const longitude = cities.find(c => c.name === city)?.longitude ?? 120;

  const [hh, mm] = time.split(':').map(v => parseInt(v) || 0);
  const branch = calcTrueSolarBranch(hh, mm, longitude);
  const shichen = SHICHEN[branch];

  const switchCalendar = (next: 'solar' | 'lunar') => {
    if (next === calendar) return;
    setCalendar(next);
    setMonth('');
    setDay('');
    setError(null);
  };

  const handleProvince = (name: string) => {
    setProvince(name);
    setCity(PROVINCES.find(p => p.name === name)?.cities[0]?.name ?? '');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!y || !m || !(parseInt(day) > 0)) {
      setError('请选择完整的出生年、月、日。');
      return;
    }
    let solar = { year: y, month: m, day: parseInt(day) };
    if (calendar === 'lunar') {
      setBusy(true);
      const lib = lunar ?? await import('@/lib/ziwei/lunar-solar');
      setBusy(false);
      const converted = lib.lunarToSolar(y, m, solar.day, isLeap);
      if (!converted) {
        setError('这个农历日期不存在，请核对月份（是否闰月）与日期。');
        return;
      }
      solar = converted;
    } else if (solar.day > solarDayCount(y, m)) {
      setError(`${y} 年 ${m} 月没有 ${solar.day} 日。`);
      return;
    }

    const form: BirthFormState = {
      name: '',
      year: String(solar.year),
      month: String(solar.month),
      day: String(solar.day),
      clockHour: String(hh),
      clockMinute: String(mm),
      unknownTime,
      province,
      city,
      longitude,
      gender,
    };
    // 与 BirthForm 走同一个转换：真太阳时校正 + 晚子时换日
    const info = formToBirthInfo(form);
    try {
      localStorage.setItem(CHART_BIRTH_KEY, JSON.stringify(info));
    } catch {
      setError(<>浏览器禁止了本地存储，无法带入出生信息。请<Link href="/chart">在起盘页填写</Link>。</>);
      return;
    }
    router.push('/chart');
  };

  return (
    <form className={s.form} onSubmit={handleSubmit} aria-label="起盘" noValidate>
      <div className={s.formIn}>
        <h2 className={s.formTitle}>起盘 <small>五项即可</small></h2>

        <div className={s.row}>
          <span className={s.lab} id="hf-cal">历法</span>
          <div className={s.ctl}>
            <div className={s.seg} role="group" aria-labelledby="hf-cal">
              <button type="button" aria-pressed={calendar === 'solar'} onClick={() => switchCalendar('solar')}>公历</button>
              <button type="button" aria-pressed={calendar === 'lunar'} onClick={() => switchCalendar('lunar')}>农历</button>
            </div>
          </div>
        </div>

        <div className={s.row}>
          <span className={s.lab} id="hf-date">出生日期</span>
          <div className={s.ctl} role="group" aria-labelledby="hf-date">
            <label className={s.box}>
              <select required value={year} onChange={e => setYear(e.target.value)} aria-label="出生年">
                <option value="" disabled>年</option>
                {years.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <i>年</i>
            </label>
            <label className={s.box}>
              <select required value={month} onChange={e => setMonth(e.target.value)} aria-label="出生月">
                <option value="" disabled>月</option>
                {months.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {calendar === 'solar' && <i>月</i>}
            </label>
            <label className={s.box}>
              <select required value={day} onChange={e => setDay(e.target.value)} aria-label="出生日">
                <option value="" disabled>日</option>
                {Array.from({ length: dayCount }, (_, i) => i + 1).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <i>日</i>
            </label>
          </div>
        </div>

        <div className={s.row}>
          <label className={s.lab} htmlFor="hf-time">出生时间</label>
          <div className={s.ctl}>
            <div className={`${s.box} ${unknownTime ? s.disabled : ''}`}>
              <input id="hf-time" type="time" value={time} disabled={unknownTime}
                onChange={e => setTime(e.target.value || '00:00')} />
              <i>{unknownTime ? '时辰不详' : `${shichen.name} ${shichen.range.replace('-', '–')}`}</i>
            </div>
          </div>
          <p className={s.hint}>
            {unknownTime ? '按子时占位排盘，时辰相关的宫位仅供参考。' : <>按真太阳时为 <b>{shichen.name}</b>。</>}
            <label className={s.check}>
              <input type="checkbox" checked={unknownTime} onChange={e => setUnknownTime(e.target.checked)} />
              时辰不详
            </label>
          </p>
        </div>

        <div className={s.row}>
          <span className={s.lab} id="hf-gender">性别</span>
          <div className={s.ctl}>
            <div className={s.seg} role="group" aria-labelledby="hf-gender">
              <button type="button" aria-pressed={gender === 'male'} onClick={() => setGender('male')}>男</button>
              <button type="button" aria-pressed={gender === 'female'} onClick={() => setGender('female')}>女</button>
            </div>
          </div>
        </div>

        <div className={s.row}>
          <span className={s.lab} id="hf-place">出生地</span>
          <div className={s.ctl} role="group" aria-labelledby="hf-place">
            <label className={s.box}>
              <select value={province} onChange={e => handleProvince(e.target.value)} aria-label="出生省份"
                className={province ? undefined : s.ph}>
                <option value="">选择省份</option>
                {PROVINCES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            <label className={s.box}>
              <select value={city} onChange={e => setCity(e.target.value)} aria-label="出生城市"
                disabled={!province} className={city ? undefined : s.ph}>
                {!province && <option value="">城市</option>}
                {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <p className={s.hint}>用于真太阳时校正，时辰交界处出生尤其需要。</p>
        </div>

        {error && <p className={s.error} role="alert">{error}</p>}
        <button className={s.go} type="submit" disabled={busy}>起盘</button>
      </div>
    </form>
  );
}

const FANLI = [
  ['甲', '纳音五行局起盘', '以纳音定五行局，不采用网络流行的简化算法。'],
  ['乙', '命宫逆数，身宫顺数', '命宫逆数生时、身宫顺数生时，严格对齐教学规则。'],
  ['丙', '十四主星与四化飞星', '按原法推演，结构完整，每一步都可以复核。'],
  ['丁', '一盘尽览', '十四主星完整入宫，辅星与煞星同屏；庙旺利陷按亮度分级标注。'],
];

const XINFA = ['命宫为本，三方为用', '对宫借星，不可忽视', '四化才是命运的手', '大限十年，运势有节'];

/** 朱笔句读：把「，。」染朱 */
function Judou({ text }: { text: string }) {
  return <>{text.split(/([，。])/).map((part, i) => (part === '，' || part === '。'
    ? <span key={i} className={s.ju}>{part}</span>
    : part))}</>;
}

export default function HomePage() {
  return (
    <div className={s.page}>
      <SiteHeader />

      <main>
        {/* 卷首 */}
        <section className={s.head}>
          <div className={`wrap ${s.headGrid}`}>
            <div>
              <p className={s.eyebrow}>紫微斗数排盘与解读 · <b>依古籍与传统体系</b></p>
              <h1 className={s.title}>
                输入出生年月日时，<br />排出一张<em>可以复核</em>的<span className={s.nw}>紫微命盘</span>
              </h1>
              <p className={s.lede}>
                纳音五行局起盘，十四主星与四化飞星按原法推演。命盘生成后，可按命格、事业、感情等维度阅读解读，并自由追问；每段解读附古籍出处。
              </p>
              <div className={s.headLinks}>
                <Link href="/chart">进入起盘页</Link>
                <Link className={s.quiet} href="/library">进入古籍库</Link>
              </div>
            </div>
            <HomeBirthForm />
          </div>
        </section>

        {/* 凡例 */}
        <section className={s.sec} aria-labelledby="sec-fanli">
          <div className={`wrap ${s.secGrid}`}>
            <div className={s.juan} aria-hidden>排盘凡例<small>卷一</small></div>
            <div>
              <h2 className={s.t} id="sec-fanli">起盘按教学规则，不走网络简化算法</h2>
              <p className={s.sub}>命盘是一切解读的底稿。底稿错一宫，后面的推断全都跟着偏，所以排盘这一步不做取巧。</p>
              <ol className={s.fanli}>
                {FANLI.map(([gan, k, v]) => (
                  <li key={gan}><span className={s.gan}>{gan}</span><span className={s.k}>{k}</span><span className={s.v}>{v}</span></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 解读 */}
        <section className={s.sec} aria-labelledby="sec-read">
          <div className={`wrap ${s.secGrid}`}>
            <div className={s.juan} aria-hidden>解读<small>卷二</small></div>
            <div>
              <h2 className={s.t} id="sec-read">解读写在命盘旁边，像书页上的批注</h2>
              <p className={s.sub}>先读命宫主星与三方四正，再分维度展开；读到哪里有疑问，就在哪里追问。</p>
              <div className={s.read}>
                <dl className={s.items}>
                  <dt>命格分析</dt>
                  <dd>从命宫主星出发，结合三方四正判断整体格局。</dd>
                  <dt>六大维度</dt>
                  <dd>分开阅读，互不混杂：</dd>
                  <dd>
                    <span className={s.dims}>
                      {['事业', '感情', '财运', '健康', '家庭', '子女'].map(d => <span key={d}>{d}</span>)}
                    </span>
                  </dd>
                  <dt>大限流年</dt>
                  <dd>按十年大限与当年流年追踪运势的起落。</dd>
                  <dt>自由追问</dt>
                  <dd>用自己的话问，解读基于你的命盘回答，并注明依据。</dd>
                </dl>
                <div>
                  <div className={s.sheet}>
                    <div className={s.cap}><span>追问的样子</span><span>问题示例</span></div>
                    <p className={s.ask}>「今年能换工作吗」</p>
                    <p className={s.ask}>「什么时候结婚运最好」</p>
                    <p className={s.pi}><b>朱批</b>回答会先说明看的是哪一宫、哪颗星、哪一年的流年，再给结论；引用古籍处标出书名与篇目，可点开原文核对。</p>
                  </div>
                  <div className={s.geju}>
                    <h3 className={s.gejuTitle}>格局识别 <small>自动识别 11 种经典格局，以下为其中几种</small></h3>
                    <ul className={s.cols}>
                      {['紫府同宫', '杀破狼', '机月同梁', '廉相格', '武曲七杀'].map(g => <li key={g}>{g}</li>)}
                      <li className={s.etc}>等十一种</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 心法 + 天地人 */}
        <section className={s.sec} aria-labelledby="sec-xinfa">
          <div className={`wrap ${s.secGrid}`}>
            <div className={s.juan} aria-hidden>看盘心法<small>卷三</small></div>
            <div>
              <h2 className={s.t} id="sec-xinfa">看盘的四条规矩</h2>
              <p className={s.sub}>本站的排盘与解读，都按这四条展开。</p>
              <div className={s.xinfa}>
                <div className={s.leaf}>
                  <div className={s.leafIn}>
                    <div className={s.ti}>心法四则</div>
                    {XINFA.map((line, i) => (
                      <div key={line}><span className={s.leafNo}>{'一二三四'[i]}</span>{line}</div>
                    ))}
                  </div>
                </div>
                <div className={s.tdr}>
                  <ol>
                    <li><b>天</b><span>先天命运<i>命盘所示</i></span></li>
                    <li><b>地</b><span>地理环境<i>所处之地</i></span></li>
                    <li><b>人</b><span>人心意念<i>自己的选择</i></span></li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 古籍库 */}
        <section className={s.sec} aria-labelledby="sec-lib">
          <div className={`wrap ${s.secGrid}`}>
            <div className={s.juan} aria-hidden>古籍原典<small>卷四</small></div>
            <div>
              <h2 className={s.t} id="sec-lib">解读引用的原文，都能在这里读到全文</h2>
              <p className={s.sub}>收录明代公版古籍，可逐章阅读、全文检索。</p>
              <div className={s.libGrid}>
                <div>
                  <ol className={s.toc}>
                    {['《紫微斗数全集》', '《紫微斗数全书》', '《骨髓赋》'].map(b => (
                      <li key={b}>{b}<span className={s.dots} /><span className={s.ed}>明代 · 公版</span></li>
                    ))}
                  </ol>
                  <Link className={s.tocMore} href="/library">进入古籍库</Link>
                </div>
                <div className={s.yuan}>
                  <p className={s.src}>《骨髓赋》节选　朱笔为句读</p>
                  <p className={s.yuanP}><Judou text="紫微为君，以左辅右弼为相。天府为臣，以禄存为府库。" /></p>
                  <p className={s.yuanP}><Judou text="看命之要，先看命宫。命宫主星定其格局，三方四正定其用武。次看身宫，身宫定其晚景与依归。" /></p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
