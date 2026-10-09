import * as React from 'react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export interface MarkProps {
  /** md — 20px рядом с названием, sm — 13px рядом с именем модели. */
  size?: 'md' | 'sm';
}
export function Mark({ size = 'md' }: MarkProps) {
  return (
    <span className={cx('te-mark', size === 'sm' && 'te-mark--sm')} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

export interface BrandProps {
  title: string;
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
  /** primary — одна на экран; danger — только «Стоп» и удаление. */
  variant?: 'default' | 'primary' | 'danger' | 'dashed' | 'link';
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

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export function TextArea({ className, ...rest }: TextAreaProps) {
  return <textarea className={cx('te-input', className)} {...rest} />;
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
  onClose?: () => void;
}
export function PopoverHead({ index, token, value, onClose }: PopoverHeadProps) {
  return (
    <div className="te-pop__head">
      {index != null && <span className="te-idx">{index}</span>}
      <code className="te-code">{token}</code>
      {value != null && <span className="te-p">{value}</span>}
      {onClose && <button type="button" className="te-pop__close" aria-label="Закрыть" onClick={onClose}>✕</button>}
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
  /** Ровно три шага. */
  steps: EmptyStep[];
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
      <ol className="te-how">
        {steps.map(s => <li key={s.title}><b>{s.title}</b>{s.text}</li>)}
      </ol>
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
