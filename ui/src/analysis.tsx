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
  /** Пример на текущем токене под формулой. */
  example?: React.ReactNode;
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
        <div className="te-explain" style={fixedHeight ? undefined : { height: 'auto' }} aria-live="polite">
          <p><b>{cur.title ?? [cur.name, cur.param].filter(Boolean).join(' ')}.</b> {cur.text}</p>
          {cur.formula && <div className="te-fx">{cur.formula}{cur.example && <span>{cur.example}</span>}</div>}
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
