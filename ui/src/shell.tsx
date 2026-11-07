import * as React from 'react';
import { cx, Brand, Button, Card, Icon, IconName, Mark, Popover, PopoverHead, Segmented, SegmentedOption, useAutoGrow } from './base';
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
  /** Слева под полем: выбор режима. */
  tools?: React.ReactNode;
}
export function Composer({ value, placeholder = 'Спросите модель о чём-нибудь…', onChange, onSend, busy, onStop, tools }: ComposerProps) {
  const ref = useAutoGrow(value, 9);
  return (
    <div className="te-composer">
      <textarea
        ref={ref}
        rows={2}
        aria-label="Запрос"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend?.(); } }}
      />
      <div className="te-composer__bar">
        {tools}
        <span className="te-top__sp" />
        {busy
          ? <Button variant="danger" icon aria-label="Остановить" onClick={onStop}><Icon name="stop" size={18} /></Button>
          : <Button variant="primary" icon aria-label="Отправить" disabled={!value || !value.trim()} onClick={onSend}><Icon name="up" size={18} /></Button>}
      </div>
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
  /** Значки в шапке, как у карточки при наведении. */
  tools?: React.ReactNode;
  note?: React.ReactNode;
  onClose?: () => void;
}
export function TokenPanel({ index, token, value, verdict, stages, active, onStage, onPlay, children, tiles, actions, tools, note, onClose }: TokenPanelProps) {
  return (
    <Popover size="panel" label={`Токен ${index}`}>
      <PopoverHead index={index} token={token} value={value} tools={tools} onClose={onClose} />
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
  icon?: IconName;
  /** Что за технология, коротко: «текст по токенам». */
  text?: string;
  /** Режим ещё не готов: строка видна с плашкой «Скоро» и не нажимается. */
  soon?: boolean;
}
export interface HistoryItem {
  id: string;
  title: string;
  meta?: string;
  /** Значок вида: разговор, выбор из вариантов. */
  icon?: IconName;
}
export interface HistoryAction {
  id: string;
  label: string;
  icon: IconName;
  /** Удаление: просит второе нажатие и красится в err. */
  danger?: boolean;
}
export interface AsideProps {
  /** Заголовок правой панели. */
  title: string;
  children: React.ReactNode;
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
  /** Кнопки внизу колонки. */
  railActions?: React.ReactNode;
  /** Действия с чатом в меню «⋯», которое появляется у строки истории при наведении. */
  historyActions?: HistoryAction[];
  onHistoryAction?: (itemId: string, actionId: string) => void;
  /** Строка истории, название которой сейчас правят прямо в списке. */
  renaming?: string | null;
  /** Новое название или null — отмена. */
  onRename?: (itemId: string, title: string | null) => void;
  /** Подпись кнопки «начать новое» над историей; без неё кнопки нет. */
  newLabel?: string;
  onNew?: () => void;
  /** Правая панель: видна постоянно, а когда не помещается — прячется и вызывается кнопкой в шапке. */
  aside?: AsideProps;
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
  const { title, tagline, sections, current, onSection, historyLabel = 'История', history, currentRun, onRun, historyActions, onHistoryAction, renaming, onRename, railActions, newLabel, onNew, aside, model, tools, legend, dock, children, height = '100%' } = props;
  const [menu, setMenu] = React.useState<string | null>(null);        // history row whose ⋯ menu is open
  const [sure, setSure] = React.useState<string | null>(null);        // action waiting for a second press
  React.useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!(e.target as Element).closest('.te-hist__menu, .te-hist__more')) { setMenu(null); setSure(null); } };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [menu]);
  // null — as the width allows: side columns are shown on a wide screen and become drawers on a narrow one
  const [rail, setRail] = React.useState<boolean | null>(null);
  const [side, setSide] = React.useState<boolean | null>(null);
  const shell = React.useRef<HTMLDivElement>(null);
  const shown = (sel: string) => { const el = shell.current?.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; };
  const narrow = () => !!shell.current && shell.current.clientWidth <= 820;
  const closeDrawers = () => { if (narrow()) setRail(null); if (shell.current && shell.current.clientWidth <= 1180) setSide(null); };
  const railOn = rail ?? !narrow(), drawer = (rail === true && narrow()) || (side === true && !!shell.current && shell.current.clientWidth <= 1180);
  return (
    <div ref={shell} className={cx('te-shell', aside && 'has-aside', rail === true && 'is-rail-open', rail === false && 'is-rail-closed', side === true && 'is-aside-open', side === false && 'is-aside-closed')} style={{ height }}>
      <aside className="te-rail">
        <Brand title={title} tagline={tagline} />
        {newLabel && <button type="button" className="te-rail__new" onClick={() => { onNew?.(); closeDrawers(); }}><Icon name="pencil" />{newLabel}</button>}
        {sections.length > 1 && (
          <nav className="te-modes" aria-label="Режимы">
            {sections.map(s => (
              <button key={s.id} type="button" className="te-mode" disabled={s.soon} aria-current={s.id === current ? 'page' : undefined} onClick={() => { onSection?.(s.id); closeDrawers(); }}>
                {s.icon && <Icon name={s.icon} size={18} />}<span><b>{s.label}</b>{s.text && <small>{s.text}</small>}</span>{s.soon && <em className="te-soon">Скоро</em>}
              </button>
            ))}
          </nav>
        )}
        {history && history.length > 0 && (
          <>
            <p className="te-cap">{historyLabel}</p>
            <div className="te-hist">
              {history.map(h => renaming === h.id ? (
                <div key={h.id} className="te-hist__item is-on">
                  {h.icon && <Icon name={h.icon} />}
                  <span>
                    <input className="te-hist__edit" autoFocus defaultValue={h.title} aria-label="Название чата"
                      onKeyDown={e => { if (e.key === 'Enter') onRename?.(h.id, e.currentTarget.value); if (e.key === 'Escape') onRename?.(h.id, null); }}
                      onBlur={e => onRename?.(h.id, e.currentTarget.value)} />
                    {h.meta && <small>{h.meta}</small>}
                  </span>
                </div>
              ) : (
                <div key={h.id} className={cx('te-hist__row', menu === h.id && 'is-menu')}>
                  <button type="button" className={cx('te-hist__item', h.id === currentRun && 'is-on')} onClick={() => { onRun?.(h.id); closeDrawers(); }}>
                    {h.icon && <Icon name={h.icon} />}<span><b>{h.title}</b>{h.meta && <small>{h.meta}</small>}</span>
                  </button>
                  {historyActions && historyActions.length > 0 && <>
                    <button type="button" className="te-hist__more" aria-label="Действия с чатом" aria-expanded={menu === h.id}
                      onClick={() => { setMenu(menu === h.id ? null : h.id); setSure(null); }}><Icon name="more" /></button>
                    {menu === h.id && (
                      <div className="te-hist__menu" role="menu">
                        {historyActions.map(a => (
                          <button key={a.id} type="button" role="menuitem" className={cx('te-hist__act', a.danger && 'is-danger', sure === a.id && 'is-sure')}
                            onClick={() => {
                              if (a.danger && sure !== a.id) { setSure(a.id); return; }
                              setMenu(null); setSure(null); onHistoryAction?.(h.id, a.id);
                            }}><Icon name={a.icon} />{sure === a.id ? 'Точно удалить?' : a.label}</button>
                        ))}
                      </div>
                    )}
                  </>}
                </div>
              ))}
            </div>
          </>
        )}
        {railActions && <div className="te-rail__foot">{railActions}</div>}
      </aside>
      {drawer && <div className="te-scrim" onClick={() => { setRail(narrow() ? null : rail); setSide(null); }} />}
      <main className="te-main">
        <header className="te-top">
          <button type="button" className="te-top__btn" aria-label="Боковая колонка с историей" title="Боковая колонка с историей" aria-pressed={railOn}
            onClick={() => setRail(!shown('.te-rail'))}><Icon name="panelLeft" size={18} /></button>
          {model}
          <span className="te-top__sp" />
          {tools}
          {aside && <button type="button" className="te-top__btn" aria-label={aside.title} title={aside.title} aria-pressed={side ?? undefined}
            onClick={() => setSide(!shown('.te-aside'))}><Icon name="panel" size={18} /></button>}
        </header>
        {legend}
        <div className="te-body">{children}</div>
        {dock && <div className="te-dock">{dock}</div>}
      </main>
      {aside && (
        <aside className="te-aside" aria-label={aside.title}>
          <div className="te-aside__head"><b>{aside.title}</b></div>
          <div className="te-aside__body">{aside.children}</div>
        </aside>
      )}
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
