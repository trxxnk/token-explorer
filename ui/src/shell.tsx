import * as React from 'react';
import { cx, Brand, Button, Card, Mark, Popover, PopoverHead, Segmented, SegmentedOption } from './base';
import { Stage, StageChain } from './analysis';

export type Status = 'ok' | 'err' | 'idle';

const Dot = ({ status = 'idle' }: { status?: Status }) => (
  <i className={cx('te-dot', status !== 'idle' && `te-dot--${status}`)} />
);

export interface ModelChipProps {
  name: string;
  /** Вид и источник: «языковая · свой сервер». */
  kind?: string;
  status?: Status;
  onClick?: () => void;
}
export function ModelChip({ name, kind, status = 'ok', onClick }: ModelChipProps) {
  return (
    <button type="button" className="te-modelchip" aria-haspopup="dialog" onClick={onClick}>
      <Dot status={status} /><b>{name}</b>{kind && <small>{kind} ▾</small>}
    </button>
  );
}

export interface ModelInfo {
  id: string;
  name: string;
  /** Откуда модель: «свой сервер», «LM Studio». */
  source: string;
  status?: Status;
  /** Разделы, которые модель умеет. */
  sections: string[];
  /** Ограничение словами: «без разбора по этапам». */
  note?: string;
}
export interface ModelGroup {
  /** Вид моделей: «Языковые модели». */
  label: string;
  models: ModelInfo[];
}
export interface ModelPickerProps {
  groups: ModelGroup[];
  current?: string;
  onPick?: (id: string) => void;
  /** Строка внизу слева: «Найдено на 2 серверах». */
  summary?: React.ReactNode;
  /** Ссылка внизу справа: «Серверы и адреса». */
  footerAction?: React.ReactNode;
}
export function ModelPicker({ groups, current, onPick, summary, footerAction }: ModelPickerProps) {
  return (
    <div className="te-models" role="dialog" aria-label="Выбор модели">
      {groups.map(g => (
        <React.Fragment key={g.label}>
          <p className="te-cap">{g.label}</p>
          {g.models.map(m => (
            <button key={m.id} type="button" className={cx('te-model', m.id === current && 'is-on')} aria-pressed={m.id === current} onClick={() => onPick?.(m.id)}>
              <Dot status={m.status ?? 'ok'} />
              <b>{m.name}</b>
              <small>{m.source}{m.id === current ? ' ✓' : ''}</small>
              <span className="te-model__caps">{m.sections.join(' · ')}{m.note ? ` — ${m.note}` : ''}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
      {(summary || footerAction) && <div className="te-models__foot"><span>{summary}</span>{footerAction}</div>}
    </div>
  );
}

export interface ComposerProps {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onSend?: () => void;
  /** Идёт генерация: кнопка превращается в «Стоп». */
  busy?: boolean;
  onStop?: () => void;
}
export function Composer({ value, placeholder = 'Спросите модель о чём-нибудь…', onChange, onSend, busy, onStop }: ComposerProps) {
  return (
    <div className="te-composer">
      <textarea
        rows={1}
        aria-label="Запрос"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend?.(); } }}
      />
      {busy
        ? <Button variant="danger" icon aria-label="Остановить" onClick={onStop}>■</Button>
        : <Button variant="primary" icon aria-label="Отправить" onClick={onSend}>↑</Button>}
    </div>
  );
}

export interface Param {
  id: string;
  label: string;
  /** Текущее значение словами или числом. */
  value: React.ReactNode;
  /** Одно поле Field с объяснением; показывается под чипом. */
  editor?: React.ReactNode;
}
export interface ParamBarProps {
  /** Не больше четырёх; только то, что меняют между прогонами. */
  params: Param[];
  open?: string | null;
  onToggle?: (id: string | null) => void;
  /** Подсказка справа, например про клавишу Tab. */
  hint?: React.ReactNode;
}
export function ParamBar({ params, open, onToggle, hint }: ParamBarProps) {
  const cur = params.find(p => p.id === open);
  return (
    <>
      <div className="te-params">
        {params.map(p => (
          <button key={p.id} type="button" className="te-param" aria-expanded={p.id === open} onClick={() => onToggle?.(p.id === open ? null : p.id)}>
            {p.label} <b>{p.value}</b>
          </button>
        ))}
        <span className="te-params__sp" />
        {hint && <span>{hint}</span>}
      </div>
      {cur?.editor && <Card style={{ maxWidth: 320, marginTop: 8 }}>{cur.editor}</Card>}
    </>
  );
}

export interface RunStat {
  value: React.ReactNode;
  /** Единица или расшифровка после числа. */
  label: React.ReactNode;
  /** Слово перед числом: «неопределённость». */
  prefix?: React.ReactNode;
}
export interface RunCardProps {
  model?: string;
  /** Номер прогона или ветки, пометка ветки. */
  meta?: React.ReactNode;
  /** Текст запроса (в чате запрос — сообщение пользователя выше). */
  question?: React.ReactNode;
  /** Verdict с фразой «почему». */
  verdict?: React.ReactNode;
  /** Одна главная цифра. */
  value?: React.ReactNode;
  /** Этапы, результат, проверка, подробности — в этом порядке. */
  children?: React.ReactNode;
  stats?: RunStat[];
  /** Малые кнопки действий над прогоном. */
  actions?: React.ReactNode;
}
export function RunCard({ model, meta, question, verdict, value, children, stats, actions }: RunCardProps) {
  return (
    <article className="te-run">
      {(model || meta) && (
        <div className="te-run__meta">
          {model && <span className="te-run__who"><Mark size="sm" /> {model}</span>}
          {meta}
        </div>
      )}
      {question && <p className="te-run__q">{question}</p>}
      {(verdict || value != null) && (
        <div className="te-run__lead">{verdict}{value != null && <span className="te-p">{value}</span>}</div>
      )}
      {children}
      {(stats || actions) && (
        <div className="te-run__foot">
          {stats?.map((s, i) => <span key={i}>{s.prefix}{s.prefix ? ' ' : ''}<b>{s.value}</b> {s.label}</span>)}
          {actions && <div className="te-run__acts">{actions}</div>}
        </div>
      )}
    </article>
  );
}

export interface TokenPanelProps {
  /** «№10». */
  index: React.ReactNode;
  token: React.ReactNode;
  /** Шанс выбранного токена у модели. */
  value: React.ReactNode;
  verdict: React.ReactNode;
  stages: Stage[];
  active: string;
  onStage?: (id: string) => void;
  /** Пройти этапы по очереди. */
  onPlay?: () => void;
  /** CandidateList для выбранного этапа. */
  children: React.ReactNode;
  /** MetricTiles. */
  tiles?: React.ReactNode;
  /** Свой текст, «Заново отсюда». */
  actions?: React.ReactNode;
  note?: React.ReactNode;
  onClose?: () => void;
}
export function TokenPanel({ index, token, value, verdict, stages, active, onStage, onPlay, children, tiles, actions, note, onClose }: TokenPanelProps) {
  return (
    <Popover size="panel" label={`Токен ${index}`}>
      <PopoverHead index={index} token={token} value={value} onClose={onClose} />
      {verdict}
      <div className="te-card__head">
        <p className="te-cap">Как отбирался токен</p>
        {onPlay && <Button variant="link" onClick={onPlay}>▶ показать по шагам</Button>}
      </div>
      <StageChain label="Этапы отбора" stages={stages} active={active} onSelect={onStage} />
      {children}
      {tiles}
      {actions && <div className="te-inline">{actions}</div>}
      {note && <p className="te-pop__foot">{note}</p>}
    </Popover>
  );
}

export interface SettingsPanelProps {
  title?: string;
  /** Не больше пяти полей на вкладке. */
  tabs: SegmentedOption[];
  tab: string;
  onTab?: (tab: string) => void;
  children: React.ReactNode;
}
export function SettingsPanel({ title = 'Настройки', tabs, tab, onTab, children }: SettingsPanelProps) {
  return (
    <div className="te-settings">
      <div className="te-card__head">
        <h2>{title}</h2>
        <Segmented label="Раздел настроек" options={tabs} value={tab} onChange={onTab} />
      </div>
      {children}
    </div>
  );
}

export interface ServerRowProps {
  name: string;
  address: string;
  status: Status;
  /** Состояние и что сервер даёт, словами. */
  note: string;
}
export function ServerRow({ name, address, status, note }: ServerRowProps) {
  return <div className="te-server"><Dot status={status} /><b>{name}</b><code>{address}</code><small>{note}</small></div>;
}

/** Легенда подсветки под шапкой. */
export function HeatLegend({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return <div className="te-legend"><span>{children}</span><i />{end && <span>{end}</span>}</div>;
}

export interface Section {
  id: string;
  /** Название задачи: «Разговор», «Сравнение». */
  label: string;
  /** Сколько прогонов сохранено. */
  count?: number;
}
export interface HistoryItem {
  id: string;
  title: string;
  meta?: string;
}
export interface AppShellProps {
  title: string;
  tagline?: string;
  /** Только разделы, которые умеет подключённая модель. */
  sections: Section[];
  current: string;
  onSection?: (id: string) => void;
  historyLabel?: string;
  /** История текущего раздела. */
  history?: HistoryItem[];
  currentRun?: string;
  onRun?: (id: string) => void;
  /** Кнопки внизу колонки: «Настройки», «Импорт и экспорт». */
  railActions?: React.ReactNode;
  /** ModelChip. */
  model?: React.ReactNode;
  /** Один переключатель вида, свой у раздела. */
  tools?: React.ReactNode;
  legend?: React.ReactNode;
  /** Composer с ParamBar или конструктор запроса. */
  dock?: React.ReactNode;
  /** Лента из RunCard либо EmptyState. */
  children: React.ReactNode;
  height?: number | string;
}
export function AppShell(props: AppShellProps) {
  const { title, tagline, sections, current, onSection, historyLabel = 'История раздела', history, currentRun, onRun, railActions, model, tools, legend, dock, children, height = '100%' } = props;
  const [railOpen, setRailOpen] = React.useState(false);
  return (
    <div className={cx('te-shell', railOpen && 'is-rail-open')} style={{ height }}>
      <aside className="te-rail">
        <Brand title={title} tagline={tagline} />
        <nav className="te-nav" aria-label="Разделы">
          {sections.map(s => (
            <button key={s.id} type="button" className="te-nav__item" aria-current={s.id === current ? 'page' : undefined} onClick={() => { onSection?.(s.id); setRailOpen(false); }}>
              <span>{s.label}</span>{s.count ? <small>{s.count}</small> : null}
            </button>
          ))}
        </nav>
        {history && history.length > 0 && (
          <>
            <p className="te-cap">{historyLabel}</p>
            <div className="te-hist">
              {history.map(h => (
                <button key={h.id} type="button" className={cx('te-hist__item', h.id === currentRun && 'is-on')} onClick={() => { onRun?.(h.id); setRailOpen(false); }}>
                  <b>{h.title}</b>{h.meta && <small>{h.meta}</small>}
                </button>
              ))}
            </div>
          </>
        )}
        {railActions && <div className="te-rail__foot">{railActions}</div>}
      </aside>
      {railOpen && <div className="te-scrim" onClick={() => setRailOpen(false)} />}
      <main className="te-main">
        <header className="te-top">
          <button type="button" className="te-burger" aria-label="Разделы" aria-expanded={railOpen} onClick={() => setRailOpen(o => !o)}>☰</button>
          {model}
          <span className="te-top__sp" />
          {tools}
        </header>
        {legend}
        <div className="te-body">{children}</div>
        {dock && <div className="te-dock">{dock}</div>}
      </main>
    </div>
  );
}

/** Лента прогонов по центру рабочей области. */
export function Thread({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className="te-thread" style={wide ? { maxWidth: 920 } : undefined}>{children}</div>;
}

/** Сообщение пользователя в ленте. */
export function UserMessage({ children }: { children: React.ReactNode }) {
  return <div className="te-user">{children}</div>;
}

/** Два столбца рядом; на узком экране складываются. */
export function Columns({ children }: { children: React.ReactNode }) {
  return <div className="te-cols">{children}</div>;
}
