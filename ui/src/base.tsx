import * as React from 'react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export interface MarkProps {
  /** md — 20px рядом с названием, sm — 13px рядом с именем модели. */
  size?: 'md' | 'sm';
}
/** Знак: развилка. Выбранная ветка — accent, бледные ветки — кандидаты, которые модель могла взять. */
export function Mark({ size = 'md' }: MarkProps) {
  return (
    <svg className={cx('te-mark', size === 'sm' && 'te-mark--sm')} viewBox="170 170 700 700" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M512 512C463 458 407 401 343 359C296 328 252 315 210 315" stroke="currentColor" strokeWidth="56" opacity=".42" />
      <path d="M512 512C572 553 626 600 684 643C731 677 779 692 823 695" stroke="currentColor" strokeWidth="56" opacity=".22" />
      <path className="te-mark__chosen" d="M512 850V512C565 446 652 431 717 372C768 326 794 277 820 225" stroke="currentColor" strokeWidth="96" />
      <circle cx="512" cy="512" r="27" fill="currentColor" />
    </svg>
  );
}

export interface BrandProps {
  title: string;
  /** Подпись под названием; по умолчанию нет. */
  tagline?: string;
}
export function Brand({ title, tagline }: BrandProps) {
  return (
    <div className="te-brand">
      <Mark />
      <div><b>{title}</b>{tagline && <small>{tagline}</small>}</div>
    </div>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary — одна на экран; soft — важное второе действие; ghost — тихое действие без рамки; danger — только «Стоп» и удаление. */
  variant?: 'default' | 'primary' | 'soft' | 'ghost' | 'danger' | 'dashed' | 'link';
  size?: 'md' | 'sm';
  /** Квадратная кнопка со знаком; нужен aria-label. */
  icon?: boolean;
}
export function Button({ variant = 'default', size = 'md', icon, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('te-btn', variant !== 'default' && `te-btn--${variant}`, size === 'sm' && 'te-btn--sm', icon && 'te-btn--icon', className)}
      {...rest}
    />
  );
}

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
}
export interface SegmentedProps<T extends string = string> {
  /** Название группы для экранного диктора. */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Тихий вид для частого параметра у поля ввода. */
  quiet?: boolean;
}
export function Segmented<T extends string = string>({ label, options, value, onChange, quiet }: SegmentedProps<T>) {
  return (
    <div className={cx('te-seg', quiet && 'te-seg--quiet')} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange?.(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface FieldProps {
  label: React.ReactNode;
  /** Текущее значение справа от подписи (для ползунка). */
  value?: React.ReactNode;
  /** Объяснение простыми словами или результат проверки. */
  hint?: React.ReactNode;
  hintTone?: 'ok' | 'err';
  /** Элемент ввода: Input, TextArea, Range или select. */
  children: React.ReactNode;
}
export function Field({ label, value, hint, hintTone, children }: FieldProps) {
  return (
    <label className="te-field">
      <span>{label}{value != null && <b>{value}</b>}</span>
      {children}
      {hint && <small className={hintTone && `is-${hintTone}`}>{hint}</small>}
    </label>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Моноширинный шрифт: токены, адреса. */
  mono?: boolean;
}
export function Input({ mono, className, ...rest }: InputProps) {
  return <input className={cx('te-input', mono && 'te-input--mono', className)} {...rest} />;
}

/** Grows a textarea with its text up to `maxRows` lines; past that it scrolls. */
export function useAutoGrow(value: unknown, maxRows = 10) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el), line = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = 'auto';
    const max = line * maxRows + pad, want = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = Math.min(want, max) + 'px';
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, maxRows]);
  return ref;
}
export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Расти вместе с текстом до стольких строк, дальше — прокрутка. */
  maxRows?: number;
}
export function TextArea({ className, maxRows, ...rest }: TextAreaProps) {
  const ref = useAutoGrow(rest.value, maxRows ?? 0);
  return <textarea ref={maxRows ? ref : undefined} className={cx('te-input', className)} {...rest} />;
}

export interface RangeProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}
export function Range({ className, ...rest }: RangeProps) {
  return <input type="range" className={cx('te-range', className)} {...rest} />;
}

export interface CheckboxProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}
export function Checkbox({ label, hint, checked, onChange }: CheckboxProps) {
  return (
    <label className="te-check">
      <input type="checkbox" checked={!!checked} onChange={e => onChange?.(e.target.checked)} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export interface CardProps {
  /** Заголовок группы прописными. */
  title?: React.ReactNode;
  /** Ссылка или кнопка справа от заголовка. */
  action?: React.ReactNode;
  /** Тень: только поле запроса и конструктор внизу экрана. */
  raised?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Card({ title, action, raised, children, style }: CardProps) {
  return (
    <section className={cx('te-card', raised && 'te-card--raised')} style={style}>
      {(title || action) && (
        <div className="te-card__head">{title && <p className="te-cap">{title}</p>}{action}</div>
      )}
      {children}
    </section>
  );
}

export interface NoteProps {
  tone?: 'warn' | 'err';
  /** Одно действие справа. */
  action?: React.ReactNode;
  children: React.ReactNode;
}
export function Note({ tone = 'warn', action, children }: NoteProps) {
  return (
    <div className={cx('te-note', tone === 'err' && 'te-note--err')} role={tone === 'err' ? 'alert' : undefined}>
      <span>{children}</span>{action}
    </div>
  );
}

export interface MoreProps {
  summary: React.ReactNode;
  children: React.ReactNode;
}
/** Свёрнутые подробности: точный промпт, сырые данные. */
export function More({ summary, children }: MoreProps) {
  return <details className="te-more"><summary>{summary}</summary>{children}</details>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="te-kbd">{children}</kbd>;
}

export interface PopoverProps {
  /** card — коротко при наведении; panel — полный разбор по клику. */
  size?: 'card' | 'panel';
  /** Название для экранного диктора. */
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Popover({ size = 'card', label, children, style }: PopoverProps) {
  return (
    <div className={cx('te-pop', size === 'panel' && 'te-pop--panel')} role="dialog" aria-label={label} style={style}>
      {children}
    </div>
  );
}

export interface PopoverHeadProps {
  index?: React.ReactNode;
  token: React.ReactNode;
  /** Главная цифра. */
  value?: React.ReactNode;
  /** Значки действий справа: подробнее, своё слово, заново отсюда. */
  tools?: React.ReactNode;
  onClose?: () => void;
}
export function PopoverHead({ index, token, value, tools, onClose }: PopoverHeadProps) {
  return (
    <div className="te-pop__head">
      {index != null && <span className="te-idx">{index}</span>}
      <code className="te-code">{token}</code>
      {value != null && <span className="te-p">{value}</span>}
      <span className="te-pop__tools">{tools}</span>
      {onClose && <button type="button" className="te-pop__close" aria-label="Закрыть" onClick={onClose}><Icon name="x" size={14} /></button>}
    </div>
  );
}

export interface EmptyStep {
  title: string;
  text: string;
}
export interface EmptyStateProps {
  /** Вопрос, на который отвечает раздел. */
  title: React.ReactNode;
  lead: React.ReactNode;
  /** Три шага; можно не передавать, если раздел понятен из примеров. */
  steps?: EmptyStep[];
  examplesLabel?: string;
  examples?: string[];
  onExample?: (text: string) => void;
  /** Заметка над заголовком, например «модель не подключена». */
  notice?: React.ReactNode;
}
export function EmptyState({ title, lead, steps, examplesLabel = 'Попробуйте', examples, onExample, notice }: EmptyStateProps) {
  return (
    <div className="te-empty">
      {notice}
      <h1>{title}</h1>
      <p>{lead}</p>
      {steps && steps.length > 0 && <ol className="te-how">
        {steps.map(s => <li key={s.title}><b>{s.title}</b>{s.text}</li>)}
      </ol>}
      {examples && examples.length > 0 && (
        <>
          <p className="te-cap">{examplesLabel}</p>
          <div className="te-chips">
            {examples.map(e => <Button key={e} onClick={() => onExample?.(e)}>{e}</Button>)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- icons ---------- */
const line = (d: string) => <path d={d} />;
const dot = (cx: number, cy: number, r = 1.3) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const ICONS = {
  chat: line('M4 5h16v11H10l-5 4v-4H4z'),
  choice: line('M3.5 6.5 5 8l3-3.5M3.5 16.5 5 18l3-3.5M12 6.5h8.5M12 16.5h8.5'),
  plus: line('M12 5v14M5 12h14'),
  sliders: <>{line('M4 7h8M18 7h2M4 17h2M12 17h8')}<circle cx="15" cy="7" r="2.5" /><circle cx="9" cy="17" r="2.5" /></>,
  thermo: line('M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0zM12 10v7'),
  step: line('M5 5v14M9 12h10M15 8l4 4-4 4'),
  filter: line('M4 5h16l-6 7.5V18l-4 2v-7.5z'),
  text: line('M6 4h9l4 4v12H6zM9 12h7M9 16h7'),
  eye: <>{line('M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z')}<circle cx="12" cy="12" r="2.6" /></>,
  data: line('M5 6.5C5 5.1 8.1 4 12 4s7 1.1 7 2.5v11c0 1.4-3.1 2.5-7 2.5s-7-1.1-7-2.5zM5 6.5C5 7.9 8.1 9 12 9s7-1.1 7-2.5M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5'),
  server: <>{line('M4 5h16v6H4zM4 13h16v6H4z')}{dot(7.5, 8, 1)}{dot(7.5, 16, 1)}</>,
  trash: line('M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7'),
  pencil: line('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3'),
  download: line('M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14'),
  upload: line('M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14'),
  copy: line('M9 9h10v11H9zM5 15V4h10'),
  refresh: line('M19 12a7 7 0 1 1-2.2-5.1M19 4.5V8h-3.5'),
  continue: line('M4 12h11M11 7.5l4.5 4.5-4.5 4.5M19.5 5v14'),
  grip: <>{dot(9, 6)}{dot(15, 6)}{dot(9, 12)}{dot(15, 12)}{dot(9, 18)}{dot(15, 18)}</>,
  x: line('M6 6l12 12M18 6 6 18'),
  chevron: line('M6 9l6 6 6-6'),
  left: line('M14.5 6l-6 6 6 6'),
  right: line('M9.5 6l6 6-6 6'),
  panel: line('M4 5h16v14H4zM14.5 5v14'),
  panelLeft: line('M4 5h16v14H4zM9.5 5v14'),
  image: <>{line('M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18')}<circle cx="15.5" cy="9" r="1.8" /></>,
  more: <>{dot(6, 12, 1.5)}{dot(12, 12, 1.5)}{dot(18, 12, 1.5)}</>,
  fastForward: line('M5 6l6 6-6 6M12 6l6 6-6 6'),
  sun: <><circle cx="12" cy="12" r="4" />{line('M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4')}</>,
  moon: line('M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z'),
  info: <><circle cx="12" cy="12" r="8.5" />{line('M12 11v5.5M12 7.8v.2')}</>,
  menu: line('M4 7h16M4 12h16M4 17h16'),
  up: line('M12 19V5M6 11l6-6 6 6'),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
  check: line('M5 12.5l4.5 4.5L19 7.5'),
  dice: <>{line('M5 5h14v14H5z')}{dot(9, 9)}{dot(12, 12)}{dot(15, 15)}</>,
  bulb: line('M9.5 17.5h5M10.5 20.5h3M8.5 14a6 6 0 1 1 7 0c-.6.5-1 1.2-1 2h-5c0-.8-.4-1.5-1-2z'),
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  shuffle: line('M4 7h3c5 0 4.5 10 9.5 10H20M17 14l3 3-3 3M4 17h3c1.3 0 2.2-.7 3-1.7M13.5 8.7C14.3 7.7 15.2 7 16.5 7H20M17 4l3 3-3 3'),
  repeat: line('M17 4l3 3-3 3M20 7H8a4 4 0 0 0 0 8M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 0-8'),
  ruler: line('M4 15 15 4l5 5L9 20zM8 14l1.5 1.5M11 11l1.5 1.5M14 8l1.5 1.5'),
  layers: line('M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5'),
};
export type IconName = keyof typeof ICONS;
export interface IconProps {
  name: IconName;
  /** Сторона в px; по умолчанию 16. */
  size?: number;
}
/** Значок: линия цветом текста. Рядом с подписью, а не вместо неё. */
export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg className="te-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange?: (value: number) => void;
  /** heat — шкала от холодного к горячему (температура); по умолчанию заливка акцентом до ползунка. */
  tone?: 'accent' | 'heat';
  label: string;
}
/** Ползунок с заливкой. */
export function Slider({ min, max, step = 1, value, onChange, tone = 'accent', label }: SliderProps) {
  const fill = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <input type="range" className={cx('te-slider', tone === 'heat' && 'te-slider--heat')} aria-label={label} min={min} max={max} step={step} value={value}
      style={{ '--fill': fill + '%' } as React.CSSProperties} onChange={e => onChange?.(+e.target.value)} />
  );
}

export interface GroupProps {
  icon?: IconName;
  title: string;
  /** Текущее значение коротко, справа от заголовка. */
  value?: React.ReactNode;
  /** Свёрнута ли при первом показе. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}
/** Сворачиваемая группа настроек со значком. */
export function Group({ icon, title, value, defaultOpen = true, children }: GroupProps) {
  return (
    <details className="te-group" open={defaultOpen || undefined}>
      <summary>{icon && <Icon name={icon} />}<b>{title}</b>{value != null && <span>{value}</span>}<Icon name="chevron" size={14} /></summary>
      <div className="te-group__body">{children}</div>
    </details>
  );
}

export interface SettingProps {
  icon?: IconName;
  label: string;
  /** Текущее значение справа, крупно. */
  value?: React.ReactNode;
  /** Одна короткая фраза: что изменится. Показывается во всплывающей подсказке. */
  hint?: string;
  children?: React.ReactNode;
}
/** Строка настройки: значок, название, значение и элемент управления под ними. */
export function Setting({ icon, label, value, hint, children }: SettingProps) {
  return (
    <div className="te-setting" title={hint}>
      <div className="te-setting__head">{icon && <Icon name={icon} />}<span>{label}</span>{value != null && <b>{value}</b>}</div>
      {children}
    </div>
  );
}

export interface SortableProps<T> {
  items: T[];
  /** Переставить элемент с места from на место to; вызывается, когда строку отпустили. */
  onMove: (from: number, to: number) => void;
  /** Содержимое строки. position — место, на котором строка стоит сейчас, пока её или соседку тащат: по нему пишут номер. */
  children: (item: T, index: number, position: number) => React.ReactNode;
  /** Название ручки для экранного диктора. */
  handleLabel?: string;
}
interface DragState { from: number; to: number; dy: number; start: number; tops: number[]; heights: number[]; gap: number }
/** Список, строки которого переставляют мышью за ручку: соседи расступаются на лету. С клавиатуры — стрелками на ручке. */
export function Sortable<T>({ items, onMove, children, handleLabel = 'Перетащить' }: SortableProps<T>) {
  const box = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [settle, setSettle] = React.useState(false);               // one frame without transitions after a drop
  React.useEffect(() => { if (settle) { const id = requestAnimationFrame(() => setSettle(false)); return () => cancelAnimationFrame(id); } }, [settle]);
  const begin = (k: number, e: React.PointerEvent) => {
    if (e.button !== 0 || !box.current) return;
    e.preventDefault();
    const rows = Array.from(box.current.children) as HTMLElement[];
    const rects = rows.map(r => r.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic event) */ }
    setDrag({ from: k, to: k, dy: 0, start: e.clientY, tops: rects.map(r => r.top), heights: rects.map(r => r.height), gap });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.start, mid = drag.tops[drag.from] + drag.heights[drag.from] / 2 + dy;
    // the new place = how many other rows have their middle above the dragged row's middle
    const to = drag.tops.reduce((n, t, i) => n + (i !== drag.from && mid > t + drag.heights[i] / 2 ? 1 : 0), 0);
    setDrag({ ...drag, dy, to });
  };
  const end = () => {
    if (!drag) return;
    if (drag.to !== drag.from) { setSettle(true); onMove(drag.from, drag.to); }
    setDrag(null);
  };
  const shift = (k: number) => {
    if (!drag || k === drag.from) return 0;
    const step = drag.heights[drag.from] + drag.gap;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -step;
    if (drag.to < drag.from && k >= drag.to && k < drag.from) return step;
    return 0;
  };
  const position = (k: number) => (!drag ? k : k === drag.from ? drag.to : k + Math.sign(shift(k)));
  return (
    <div ref={box} className={cx('te-sort', drag && 'is-sorting', settle && 'is-settle')}>
      {items.map((it, k) => {
        const dragged = drag?.from === k;
        return (
          <div key={k} className={cx('te-sort__row', dragged && 'is-drag')}
            style={{ transform: dragged ? `translateY(${drag!.dy}px)` : shift(k) ? `translateY(${shift(k)}px)` : undefined }}>
            <button type="button" className="te-sort__grip" aria-label={handleLabel}
              onPointerDown={e => begin(k, e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
              onKeyDown={e => {
                if (e.key === 'ArrowUp' && k > 0) { e.preventDefault(); onMove(k, k - 1); }
                if (e.key === 'ArrowDown' && k < items.length - 1) { e.preventDefault(); onMove(k, k + 1); }
              }}><Icon name="grip" /></button>
            {children(it, k, position(k))}
          </div>
        );
      })}
    </div>
  );
}
