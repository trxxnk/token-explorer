import * as React from 'react';
import { cx } from './base';

/** Доля 0…1 → «5.4%» до десяти процентов, «32%» от десяти. */
export function pct(p: number): string {
  const v = p * 100;
  return (v < 10 ? +v.toFixed(1) : Math.round(v)) + '%';
}

export type VerdictTone = 'ok' | 'mid' | 'low' | 'manual' | 'none';

export interface VerdictTagProps {
  tone: VerdictTone;
  /** Формулировка из словаря вердиктов. */
  children: React.ReactNode;
}
export function VerdictTag({ tone, children }: VerdictTagProps) {
  return <span className={`te-tag te-tag--${tone}`}>{children}</span>;
}

export interface VerdictProps {
  tone: VerdictTone;
  label: string;
  /** Одна фраза «почему» с конкретным числом. */
  children?: React.ReactNode;
}
export function Verdict({ tone, label, children }: VerdictProps) {
  return <p className="te-verdict"><VerdictTag tone={tone}>{label}</VerdictTag>{children}</p>;
}

export interface TokenChipProps {
  /** Ступень подсветки сомнений: 0 — нет, 4 — модель почти гадала. */
  heat?: 0 | 1 | 2 | 3 | 4;
  /** Вставлен пользователем. */
  manual?: boolean;
  /** Служебный токен: моноширинный, в рамке. */
  special?: boolean;
  /** Для этого токена открыта панель. */
  focused?: boolean;
  onClick?: () => void;
  onHover?: (inside: boolean) => void;
  children: React.ReactNode;
}
export function TokenChip({ heat = 0, manual, special, focused, onClick, onHover, children }: TokenChipProps) {
  return (
    <span
      className={cx('te-tok', manual && 'te-tok--manual', special && 'te-tok--special', focused && 'is-focus')}
      data-heat={heat || undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
    >
      {children}
    </span>
  );
}

/** Текст модели: шрифт с засечками. */
export function Answer({ children }: { children: React.ReactNode }) {
  return <p className="te-answer">{children}</p>;
}

/** Токен вне текста, моноширинной плашкой. */
export function TokenCode({ children }: { children: React.ReactNode }) {
  return <code className="te-code">{children}</code>;
}

/** Пометка ветки над ответом. */
export function BranchBadge({ children }: { children: React.ReactNode }) {
  return <span className="te-badge">{children}</span>;
}

export interface CandidateRowProps {
  /** Место в рейтинге; для свёрнутого хвоста — «…». */
  rank?: React.ReactNode;
  /** Метка варианта ответа (A, B, C) вместо места. */
  letter?: string;
  label: React.ReactNode;
  /** Моноширинная подпись; по умолчанию — да для токенов, нет для вариантов. */
  mono?: boolean;
  /** Шанс 0…1 на текущем этапе. */
  share: number;
  /** Шанс лидера: полоса рисуется как share / scale. */
  scale?: number;
  /** Сдвиг к прошлому этапу в процентных пунктах. */
  delta?: number;
  /** chosen — выбран, rest — свёрнутый хвост, cut — отсечён на этом этапе. */
  state?: 'chosen' | 'rest' | 'cut';
  /** Чем отсечён: «top-p», «min-p». */
  cutReason?: string;
  /** Клик по строке: создать ветку от кандидата или раскрыть хвост. */
  onPick?: () => void;
}
export function CandidateRow({ rank, letter, label, mono, share, scale = 1, delta, state, cutReason, onPick }: CandidateRowProps) {
  const isMono = mono ?? !letter;
  const cut = state === 'cut';
  const width = cut ? 0 : Math.max(0, Math.min(100, (share / (scale || 1)) * 100));
  const cls = cx('te-row', state && `is-${state}`);
  const body = (
    <>
      {letter ? <span className="te-lb">{letter}</span> : <span className="te-row__rank">{rank}</span>}
      {isMono ? <code className="te-row__label">{label}</code> : <span className="te-row__label">{label}</span>}
      <span className="te-row__bar"><i style={{ width: width + '%' }} /></span>
      <span className="te-row__pct">{cut ? `✕ ${cutReason ?? 'отсечён'}` : pct(share)}</span>
      {!cut && (
        <span className={cx('te-row__delta', delta != null && delta > 0 && 'is-up', delta != null && delta < 0 && 'is-dn')}>
          {delta != null && delta !== 0 ? `(${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)})` : ''}
        </span>
      )}
      {!letter && !cut && (
        <span className="te-row__go" aria-hidden="true">{state === 'chosen' ? '✓' : state === 'rest' ? '▾' : '→'}</span>
      )}
    </>
  );
  return onPick && !cut
    ? <button type="button" className={cls} onClick={onPick}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export interface CandidateListProps {
  /** Шапка колонок: слева и справа. */
  caption?: [string, string];
  /** Список вариантов ответа с метками вместо мест. */
  options?: boolean;
  /** Короткая карточка: без сдвига и стрелки. */
  compact?: boolean;
  /** Подписи в несколько строк (предложения). */
  wrap?: boolean;
  /** Фиксированная высота с прокруткой, px. */
  height?: number;
  children: React.ReactNode;
}
export function CandidateList({ caption, options, compact, wrap, height, children }: CandidateListProps) {
  return (
    <div>
      {caption && <div className="te-rows__cap"><span>{caption[0]}</span><span>{caption[1]}</span></div>}
      <div
        className={cx('te-rows', options && 'te-rows--option', compact && 'te-rows--compact', wrap && 'te-rows--wrap')}
        style={height ? { height, overflowY: 'auto' } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export interface Stage {
  id: string;
  name: string;
  /** Параметр этапа под названием: «0.95», «×1.2». */
  param?: string;
  /** Сколько кандидатов осталось после этапа. */
  count: React.ReactNode;
  /** Заголовок объяснения; по умолчанию «название параметр». */
  title?: string;
  /** Объяснение простыми словами. */
  text?: React.ReactNode;
  formula?: React.ReactNode;
  /** Та же формула с числами текущего токена; стоит справа от формулы. */
  example?: React.ReactNode;
  /** Что за буквами: картинка доли (ShareViz) и расшифровка обозначений (Legend) под формулой. */
  visual?: React.ReactNode;
}
export interface StageChainProps {
  /** Название группы для экранного диктора. */
  label: string;
  /** От трёх до шести этапов; выключенные не передавать. */
  stages: Stage[];
  active: string;
  onSelect?: (id: string) => void;
  /** Показывать объяснение выбранного этапа. */
  explain?: boolean;
  /** Держать высоту объяснения постоянной (в панели токена). */
  fixedHeight?: boolean;
}
export function StageChain({ label, stages, active, onSelect, explain = true, fixedHeight = true }: StageChainProps) {
  const cur = stages.find(s => s.id === active) ?? stages[stages.length - 1];
  return (
    <>
      <div className="te-stages" role="group" aria-label={label}>
        {stages.map(s => (
          <button key={s.id} type="button" className="te-stage" aria-pressed={s.id === cur.id} onClick={() => onSelect?.(s.id)}>
            <b>{s.name}</b>{s.param != null && <i>{s.param}</i>}<span>{s.count}</span>
          </button>
        ))}
      </div>
      {explain && cur.text && (
        <div key={cur.id} className="te-explain" style={fixedHeight ? undefined : { height: 'auto' }} aria-live="polite">
          <p><b>{cur.title ?? [cur.name, cur.param].filter(Boolean).join(' ')}.</b> {cur.text}</p>
          {cur.formula && <div className="te-fx">{cur.formula}{cur.example && <><span className="te-fx__eq">→</span><span className="te-fx__num">{cur.example}</span></>}</div>}
          {cur.visual}
        </div>
      )}
    </>
  );
}

export interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  /** Что значит число простыми словами; обязательно. */
  note: string;
  /** Длинное объяснение во всплывающей подсказке. */
  title?: string;
}
export function MetricTile({ label, value, note, title }: MetricTileProps) {
  return <div className="te-tile" title={title}><small>{label}</small><b>{value}</b><i>{note}</i></div>;
}

/** Сетка из трёх плиток. */
export function MetricTiles({ children }: { children: React.ReactNode }) {
  return <div className="te-tiles">{children}</div>;
}

export interface HeatRow {
  label: string;
  values: number[];
  /** Номер столбца значений с итоговым победителем. */
  top?: number;
}
export interface HeatTableProps {
  /** Заголовки: первый — для подписей строк, дальше по одному на значение. */
  columns: string[];
  rows: HeatRow[];
  /** Как писать число в ячейке; по умолчанию проценты. */
  format?: (value: number, column: number) => string;
  /** Столбцы значений без заливки (например, разница). */
  plain?: number[];
  /** Границы ступеней заливки. */
  levels?: [number, number, number];
}
export function HeatTable({ columns, rows, format = v => pct(v), plain = [], levels = [0.15, 0.3, 0.5] }: HeatTableProps) {
  const level = (v: number) => (v < levels[0] ? 1 : v < levels[1] ? 2 : v < levels[2] ? 3 : 4);
  return (
    <div className="te-scroll">
      <table className="te-heat">
        <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td>{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} data-l={plain.includes(i) ? undefined : level(v)} className={r.top === i ? 'is-top' : undefined}>
                  {format(v, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- formula ---------- */
// A tiny subset of TeX, enough for the sampler formulas: \frac{a}{b}, x_i, x_{..}, x^{..}; Latin letters become
// italic variables, Cyrillic words stay upright as plain text.
function group(s: string, at: number): [string, number] {
  if (s[at] !== '{') return [s[at] ?? '', at + 1];
  let depth = 0;
  for (let i = at; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return [s.slice(at + 1, i), i + 1];
  }
  return [s.slice(at + 1), s.length];
}
function tex(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < s.length) {
    if (s.startsWith('\\frac', i)) {
      const [a, j] = group(s, i + 5), [b, j2] = group(s, j);
      out.push(<span key={k++} className="te-math__frac"><span>{tex(a)}</span><span>{tex(b)}</span></span>);
      i = j2;
    } else if (s[i] === '_' || s[i] === '^') {
      const [body, j] = group(s, i + 1);
      out.push(s[i] === '_' ? <sub key={k++}>{tex(body)}</sub> : <sup key={k++}>{tex(body)}</sup>);
      i = j;
    } else {
      const word = /^[а-яё][а-яё .]*/i.exec(s.slice(i)), latin = /^[A-Za-z]+/.exec(s.slice(i));
      if (word) { out.push(<span key={k++} className="te-math__w">{word[0]}</span>); i += word[0].length; }
      else if (latin) { out.push(latin[0].length > 2 ? latin[0] : <var key={k++}>{latin[0]}</var>); i += latin[0].length; }
      else { out.push(s[i]); i++; }
    }
  }
  return out;
}
export interface FormulaProps {
  /** Запись в духе TeX: `p_i = \\frac{e^{z_i}}{Σ_j e^{z_j}}`. */
  children: string;
}
/** Формула: переменные курсивом, дроби в два этажа. */
export function Formula({ children }: FormulaProps) {
  return <span className="te-math">{tex(children)}</span>;
}

export interface ShareItem {
  /** Доля кандидата 0…1 на входе этапа. */
  share: number;
  /** Останется ли кандидат после этапа. */
  kept: boolean;
  /** Выбранный токен. */
  chosen?: boolean;
  /** Подпись во всплывающей подсказке. */
  label: string;
}
export interface ShareVizProps {
  /** stack — доли подряд, как накопленная сумма (Top-P, Top-K); bars — столбики относительно лидера (Min-P). */
  kind: 'stack' | 'bars';
  items: ShareItem[];
  /** Граница: доля от 0 до 1 (для stack — накопленная сумма, для bars — шанс одного кандидата). */
  threshold?: number;
  /** Одна строка под картинкой. */
  note: React.ReactNode;
}
/** Картинка к формуле этапа: какие кандидаты проходят и где граница. */
export function ShareViz({ kind, items, threshold, note }: ShareVizProps) {
  const lead = Math.max(...items.map(i => i.share), 1e-9);
  return (
    <div className={cx('te-viz', `te-viz--${kind}`)}>
      <div className="te-viz__track">
        {items.map((it, k) => (
          <i key={k} title={it.label} className={cx(it.kept ? 'is-kept' : 'is-out', it.chosen && 'is-chosen')}
            style={kind === 'stack' ? { width: it.share * 100 + '%' } : { height: Math.max(3, (it.share / lead) * 100) + '%' }} />
        ))}
        {threshold != null && <b className="te-viz__line" style={kind === 'stack' ? { left: threshold * 100 + '%' } : { bottom: Math.min(100, (threshold / lead) * 100) + '%' }} />}
      </div>
      <small>{note}</small>
    </div>
  );
}

export interface LegendProps {
  /** Обозначение в записи формулы и что оно значит на этом токене. */
  items: { sym: string; text: React.ReactNode }[];
}
/** Расшифровка букв формулы на выбранном токене. */
export function Legend({ items }: LegendProps) {
  if (!items.length) return null;
  return <dl className="te-legendfx">{items.map((it, k) => <div key={k}><dt><Formula>{it.sym}</Formula></dt><dd>{it.text}</dd></div>)}</dl>;
}
