'use client';
import { useState, useMemo, useEffect } from 'react';
import type { BirthInfo } from '@/lib/ziwei/types';
import { SHICHEN } from '@/lib/ziwei/constants';
import { PROVINCES } from '@/lib/ziwei/cities';
import { formToBirthInfo, calcTrueSolarBranch } from '@/lib/ziwei/share';
import s from './BirthForm.module.css';

export interface BirthFormState {
  name: string;
  year: string;
  month: string;
  day: string;
  clockHour: string;
  clockMinute: string;
  unknownTime: boolean;
  province: string;
  city: string;
  longitude: number;
  gender: 'male' | 'female';
}

interface BirthFormProps {
  onSubmit: (info: BirthInfo) => void;
  loading?: boolean;
  initialData?: Partial<BirthFormState>;
  onFormSave?: (data: BirthFormState) => void;
  /** 隐藏内部「立即起盘」按钮（合盘等场景由父级统一触发） */
  hideSubmit?: boolean;
}

const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 检查日期是否合法 */
function isValidDate(y: number, m: number, d: number): boolean {
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export default function BirthForm({ onSubmit, loading, initialData, onFormSave, hideSubmit }: BirthFormProps) {
  const [form, setForm] = useState<BirthFormState>({
    name: initialData?.name ?? '',
    year: initialData?.year ?? '',
    month: initialData?.month ?? '',
    day: initialData?.day ?? '',
    clockHour: initialData?.clockHour ?? '8',
    clockMinute: initialData?.clockMinute ?? '0',
    unknownTime: initialData?.unknownTime ?? false,
    province: initialData?.province ?? '',
    city: initialData?.city ?? '',
    longitude: initialData?.longitude ?? 120,
    gender: initialData?.gender ?? 'male',
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // 表单状态变化时实时同步给父级（合盘等场景下父级靠这个收集双方数据）
  useEffect(() => {
    onFormSave?.({ ...form });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const cityList = useMemo(() => {
    const prov = PROVINCES.find(p => p.name === form.province);
    return prov ? prov.cities : [];
  }, [form.province]);

  const branch = useMemo(() => {
    if (form.unknownTime) return 0;
    return calcTrueSolarBranch(
      parseInt(form.clockHour) || 0,
      parseInt(form.clockMinute) || 0,
      form.longitude,
    );
  }, [form.clockHour, form.clockMinute, form.longitude, form.unknownTime]);

  const offsetMin = Math.round((form.longitude - 120) * 4);
  const shichenInfo = SHICHEN[branch];

  // ─── 校验逻辑 ───────────────────────────────────────────
  const y = parseInt(form.year) || 0;
  const m = parseInt(form.month) || 0;
  const d = parseInt(form.day) || 0;

  const errors = {
    year: !form.year ? '请选择出生年份'
      : y < 1900 || y > 2026 ? '年份范围：1900–2026'
      : '',
    month: !form.month ? '请选择月份' : '',
    day: !form.day ? '请选择日期'
      : form.year && form.month && !isValidDate(y, m, d) ? `${m}月没有${d}日`
      : '',
  };
  const hasError = Object.values(errors).some(Boolean);

  // ─── 完成度（用于进度条） ────────────────────────────────
  const steps = [
    !!form.year && !!form.month && !!form.day && !errors.year && !errors.month && !errors.day,
    !!form.province && !!form.city,
    form.unknownTime || (!!form.clockHour && !!form.clockMinute),
    true, // 性别有默认值
  ];
  const completedSteps = steps.filter(Boolean).length;

  // ─── Summary chip：全部必填完成后显示 ───────────────────
  const showSummary = steps[0] && steps[2] && !hasError;
  const summaryText = showSummary
    ? [
        `${y}年${m}月${d}日`,
        form.city || (form.province ? form.province : ''),
        form.unknownTime ? '时辰不详' : `${SHICHEN_NAMES[branch]}时`,
        form.gender === 'male' ? '男' : '女',
      ].filter(Boolean).join(' · ')
    : '';

  const handleProvince = (prov: string) => {
    const provData = PROVINCES.find(p => p.name === prov);
    const firstCity = provData?.cities[0];
    setForm({ ...form, province: prov, city: firstCity?.name || '', longitude: firstCity?.longitude ?? 120 });
  };

  const handleCity = (cityName: string) => {
    const prov = PROVINCES.find(p => p.name === form.province);
    const cityData = prov?.cities.find(c => c.name === cityName);
    setForm({ ...form, city: cityName, longitude: cityData?.longitude ?? 120 });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setTouched({ year: true, month: true, day: true });
    if (hasError) return;
    onFormSave?.({ ...form });
    // 统一走 lib/ziwei/share.ts 的转换：它负责晚子时换日（23:00–23:59 按次日排盘）。
    // 在这里手拼 BirthInfo 会绕过这条规则，使 /chart 与 /heming 对同一份输入排出相差一天的盘。
    onSubmit(formToBirthInfo(form));
  };

  function FieldError({ msg }: { msg: string }) {
    return msg ? <p className={s.error} role="alert">{msg}</p> : null;
  }

  const showErr = (field: string) => touched[field] || submitAttempted;
  const fieldClass = (field: string, bad: boolean) => `field ${s.select}${showErr(field) && bad ? ` ${s.invalid}` : ''}`;

  return (
    <form onSubmit={handleSubmit} className={s.form}>
      <div className={s.head}>
        <h3>输入生辰</h3>
        <span>{completedSteps} / {steps.length}</span>
      </div>

      {/* ── 进度 ── */}
      <div className={s.steps} aria-hidden>
        {steps.map((done, i) => <span key={i} className={done ? s.done : undefined} />)}
      </div>

      {/* ── 姓名 ── */}
      <div className={s.row}>
        <label className={s.label} htmlFor="bf-name">姓名（可选）</label>
        <input
          id="bf-name"
          type="text"
          placeholder="请输入姓名"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="field"
        />
      </div>

      {/* ── 出生日期 ── */}
      <fieldset className={s.row}>
        <legend className={s.label}>出生日期（公历）</legend>
        <div className={s.grid3}>
          <div>
            <select
              aria-label="出生年份"
              value={form.year}
              onChange={e => { setForm({ ...form, year: e.target.value }); setTouched(t => ({ ...t, year: true })); }}
              className={fieldClass('year', !!errors.year)}
              aria-invalid={showErr('year') && !!errors.year}
              required
            >
              <option value="">年份</option>
              {Array.from({ length: 127 }, (_, i) => 2026 - i).map(yr => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
            <FieldError msg={showErr('year') ? errors.year : ''} />
          </div>
          <div>
            <select
              aria-label="出生月份"
              value={form.month}
              onChange={e => { setForm({ ...form, month: e.target.value }); setTouched(t => ({ ...t, month: true })); }}
              className={fieldClass('month', !!errors.month)}
              aria-invalid={showErr('month') && !!errors.month}
              required
            >
              <option value="">月份</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => (
                <option key={mo} value={String(mo)}>{mo} 月</option>
              ))}
            </select>
            <FieldError msg={showErr('month') ? errors.month : ''} />
          </div>
          <div>
            <select
              aria-label="出生日"
              value={form.day}
              onChange={e => { setForm({ ...form, day: e.target.value }); setTouched(t => ({ ...t, day: true })); }}
              className={fieldClass('day', !!errors.day)}
              aria-invalid={showErr('day') && !!errors.day}
              required
            >
              <option value="">日期</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(dy => (
                <option key={dy} value={String(dy)}>{dy} 日</option>
              ))}
            </select>
            <FieldError msg={showErr('day') ? errors.day : ''} />
          </div>
        </div>
      </fieldset>

      {/* ── 出生地点 ── */}
      <fieldset className={s.row}>
        <legend className={s.label}>出生地点（用于真太阳时校正）</legend>
        <div className={s.grid2}>
          <select
            aria-label="出生省份"
            value={form.province}
            onChange={e => handleProvince(e.target.value)}
            className={`field ${s.select}`}
          >
            <option value="">省份 / 直辖市</option>
            {PROVINCES.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <select
            aria-label="出生城市"
            value={form.city}
            onChange={e => handleCity(e.target.value)}
            disabled={!form.province}
            className={`field ${s.select}`}
          >
            <option value="">{form.province ? '城市' : '先选省份'}</option>
            {cityList.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <p className={s.hint}>
          {form.province
            ? `${form.city || '（请选择城市）'} · 经度 ${form.longitude.toFixed(1)}°E · 时差 ${offsetMin > 0 ? '+' : ''}${offsetMin} 分钟`
            : '传统批命用真太阳时，建议填写出生地以自动校正时辰'}
        </p>
      </fieldset>

      {/* ── 出生时间 ── */}
      <fieldset className={s.row}>
        <legend className={s.label}>出生时间（北京时间）</legend>
        <div className={`${s.timeBox}${form.unknownTime ? ` ${s.muted}` : ''}`} aria-disabled={form.unknownTime}>
          <div className={s.grid2}>
            <select
              aria-label="出生小时"
              value={form.clockHour}
              onChange={e => setForm({ ...form, clockHour: e.target.value })}
              disabled={form.unknownTime}
              className={`field ${s.select}`}
            >
              {Array.from({ length: 24 }, (_, i) => i).map(h => (
                <option key={h} value={String(h)}>{h.toString().padStart(2, '0')} 时</option>
              ))}
            </select>
            <select
              aria-label="出生分钟"
              value={form.clockMinute}
              onChange={e => setForm({ ...form, clockMinute: e.target.value })}
              disabled={form.unknownTime}
              className={`field ${s.select}`}
            >
              {Array.from({ length: 60 }, (_, i) => i).map(min => (
                <option key={min} value={String(min)}>{min.toString().padStart(2, '0')} 分</option>
              ))}
            </select>
          </div>
          {/* 真太阳时结果 */}
          <div className={s.solar}>
            <span>真太阳时</span>
            <b>{SHICHEN_NAMES[branch]}时</b>
            {shichenInfo && <span>{shichenInfo.range}</span>}
          </div>
        </div>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={form.unknownTime}
            onChange={e => setForm({ ...form, unknownTime: e.target.checked })}
          />
          <span>不知道出生时间，以子时（23:00–01:00）起盘</span>
        </label>
      </fieldset>

      {/* ── 性别 ── */}
      <div className={s.row}>
        <span className={s.label} id="bf-gender">性别</span>
        <div className={`seg ${s.gender}`} role="group" aria-labelledby="bf-gender">
          {(['male', 'female'] as const).map(g => (
            <button
              key={g}
              type="button"
              aria-pressed={form.gender === g}
              onClick={() => setForm({ ...form, gender: g })}
            >
              {g === 'male' ? '男' : '女'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 确认信息 ── */}
      {showSummary && (
        <p className={`zhupi ${s.summary}`}>{summaryText}</p>
      )}

      {/* ── 提交按钮 ── */}
      {!hideSubmit && (
        <button type="submit" disabled={loading} className={`btn-accent ${s.submit}`}>
          {loading ? '起盘中…' : '起盘'}
        </button>
      )}
    </form>
  );
}
