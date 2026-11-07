// The new interface: sections built from the components in ../src. State and server calls live in store.ts.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Answer, AppShell, BranchBadge, Legend, ShareViz, Button, CandidateList, CandidateRow, Card, Checkbox, Composer, EmptyState, Field, Formula, Group, HeatTable,
  Icon, Input, Kbd, MetricTile, MetricTiles, ModelChip, ModelPicker, More, Note, Popover, PopoverHead, RunCard, Segmented,
  ServerRow, Setting, Slider, Sortable, StageChain, TextArea, Thread, TokenChip, TokenPanel, UserMessage, Verdict,
} from '../src/index';
import type { Stage } from '../src/index';
import * as L from './logic';
import * as S from './store';

const { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } = React;
const useStore = () => useSyncExternalStore(S.subscribe, S.getVersion);

// «сегодня, 20:41», «вчера, 09:12», «7 нояб, 20:41»
const when = (ts: number) => {
  const d = new Date(ts), now = new Date(), days = Math.round((+new Date(now.toDateString()) - +new Date(d.toDateString())) / 864e5);
  const date = days === 0 ? 'сегодня' : days === 1 ? 'вчера' : d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }).replace('.', '');
  return date + ', ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
};
/* ---------- floating layer: keeps a card next to its token without covering it ---------- */
function Float({ anchor, children, onEnter, onLeave, scroll }: { anchor: Element; children: React.ReactNode; onEnter?: () => void; onLeave?: () => void; scroll?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!ref.current || !anchor.isConnected) return;
      const r = anchor.getBoundingClientRect(), b = ref.current.getBoundingClientRect(), W = innerWidth, H = innerHeight, gap = 6;
      let left = Math.max(8, Math.min(r.left, W - 8 - b.width)), top = r.bottom + gap;
      if (top + b.height > H - 8) {
        if (r.top - gap - b.height >= 8) top = r.top - gap - b.height;
        else {                                                    // no room above or below: stand beside the token
          top = Math.max(8, H - 8 - b.height);
          left = r.right + gap + b.width <= W - 8 ? r.right + gap : Math.max(8, r.left - gap - b.width);
        }
      }
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place); if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [anchor]);
  return (
    <div ref={ref} data-float onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ position: 'fixed', zIndex: 20, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', maxWidth: 'calc(100vw - 16px)', maxHeight: scroll ? 'calc(100vh - 16px)' : undefined, overflowY: scroll ? 'auto' : undefined, borderRadius: 'var(--radius-xl)' }}>
      {children}
    </div>
  );
}

/* ---------- conversation ---------- */
// hover — the short card follows the pointer; hold — the card stays (typing a word); panel — the full breakdown
interface Open { node: string; i: number; el: Element; mode: 'hover' | 'hold' | 'panel' }

const AnswerTokens = React.memo(function AnswerTokens(p: {
  toks: L.Tok[]; from: number; to: number; count: number; heat: L.HeatMode; threshold: number; special: boolean; focus: number;
  onOpen: (i: number, el: Element) => void; onHover: (i: number, el: Element | null) => void;
}) {
  const last = useRef<Element | null>(null);
  const grab = (e: React.SyntheticEvent) => { const el = (e.target as Element).closest('.te-tok'); if (el) last.current = el; };
  const chips: React.ReactNode[] = [];
  for (let i = p.from; i < p.to; i++) {
    const t = p.toks[i];
    if (!t.t || (t.special && !p.special)) continue;
    chips.push(
      <TokenChip key={i} heat={L.heatLevel(t, p.heat, p.threshold)} manual={t.manual} special={t.special} focused={p.focus === i}
        onClick={() => last.current && p.onOpen(i, last.current)} onHover={inside => p.onHover(i, inside ? last.current : null)}>
        {t.special ? t.t.trim() : t.t}
      </TokenChip>);
  }
  return <div onClickCapture={grab} onMouseOverCapture={grab} onKeyDownCapture={grab}><Answer>{chips}</Answer></div>;
});

let lastStage = 'model';
function TokenDetails({ chat, node, i, onClose, onMode }: { chat: L.Chat; node: L.Node; i: number; onClose: () => void; onMode: (m: Open['mode'] | null) => void }) {
  const t0 = node.tokens![i], more = S.moreFor(node, i), t = more ? { ...t0, top: more } : t0;
  const P = node.params!, vocab = node.srv?.vocab ?? null;
  const stages = L.stagesFor(t, P, vocab);
  const [active, setActive] = useState(lastStage);
  const { tools, field } = useWord(chat, node, i, onMode, true);
  const [loading, setLoading] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const v = L.tokenVerdict(t0);
  const verdict = <Verdict tone={v.tone} label={v.label}>{v.text}</Verdict>;
  if (!stages) return (
    <Popover size="panel" label={`Токен №${i + 1}`}>
      <PopoverHead token={L.vis(t.t)} value={t.p != null ? L.pct(t.p) : undefined} tools={tools} onClose={onClose} />
      {field}{verdict}
    </Popover>
  );
  const idx = Math.max(0, stages.findIndex(s => s.id === active)), cur = stages[idx];
  const pick = (id: string) => { lastStage = id; setActive(id); };
  const play = () => {
    let k = 0;
    const tick = () => { pick(stages[k].id); if (++k < stages.length) timer.current = window.setTimeout(tick, 1400); };
    clearTimeout(timer.current); tick();
  };
  const rows = L.stageRows(t, stages, idx), scale = rows.live[0]?.p || 1;
  const self = t.top.find(a => L.same(a, t));                       // the chosen token as a candidate: only there it has k and pp
  const view: Stage[] = stages.map((s, k) => {
    const before = k > 0 ? stages[k - 1] : null;
    const counts = before && before.count != null && s.count != null && before.count !== s.count ? ` Было ${L.big(before.count)}, осталось ${L.big(s.count)}.` : '';
    return {
      id: s.id, name: s.name, param: s.param, count: s.count != null ? L.big(s.count) : '—', title: s.title, text: s.text + counts, formula: <Formula>{s.formula}</Formula>,
      example: s.subst ? <Formula>{s.subst}</Formula> : undefined,
      visual: <>
        {s.strip && before && (() => {
          // what this filter looks at: candidates with their share on the way in, best first
          const items = t.top.map(c => ({ c, p: before.prob(c) })).filter(x => x.p != null).sort((a, b) => (b.p as number) - (a.p as number)).slice(0, 24)
            .map(x => ({ share: x.p as number, kept: s.prob(x.c) != null, chosen: L.same(x.c, t), label: `${L.vis(x.c.t)}: ${L.pct(x.p)}` }));
          return <ShareViz kind={s.id === 'min_p' ? 'bars' : 'stack'} items={items} threshold={s.strip.threshold} note={s.strip.note} />;
        })()}
        <Legend items={s.vars || []} />
      </>,
    };
  });
  const wider = async () => { setLoading(true); try { await S.fetchMore(chat, node, i, t.top.length + 25); } catch { /* the short list stays */ } setLoading(false); };
  return (
    <TokenPanel index={`№${i + 1}`} token={L.vis(t.t)} value={L.pct(t.p)} tools={tools} verdict={<>{field}{verdict}</>} stages={view} active={cur.id} onStage={pick} onPlay={play} onClose={onClose}>
      <CandidateList caption={['место', idx === 0 ? 'шанс' : 'шанс (к прошлому этапу, п.п.)']} height={226}>
        {rows.live.map((r, k) => (
          <CandidateRow key={r.c.id ?? r.c.t} rank={k + 1} label={L.vis(r.c.t)} share={r.p} scale={scale} delta={idx ? r.delta : undefined}
            state={r.chosen ? 'chosen' : undefined} onPick={r.chosen || S.state.busy ? undefined : () => S.branchAt(chat, node, i, { id: r.c.id, t: r.c.t })} />))}
        {rows.rest > 0 && <CandidateRow key="rest" rank="…" mono={false} label={loading ? 'загружаю…' : `ещё ${L.big(rows.rest)} ток.`} share={rows.restShare} scale={scale}
          state="rest" onPick={loading || S.state.busy || t.top.length >= 300 ? undefined : wider} />}
        {rows.cut.map(r => <CandidateRow key={'cut' + (r.c.id ?? r.c.t)} rank="" label={L.vis(r.c.t)} share={0} state="cut" cutReason={r.cut} />)}
      </CandidateList>
    </TokenPanel>
  );
}
function useWord(chat: L.Chat, node: L.Node, i: number, onMode: (m: Open['mode'] | null) => void, inPanel: boolean) {
  const [word, setWord] = useState<string | null>(null);
  const busy = S.state.busy;
  const put = () => { if (word) S.branchAt(chat, node, i, { t: word, custom: true }); };
  const tools = <>
    <Button size="sm" variant={inPanel ? 'soft' : 'ghost'} icon aria-pressed={inPanel} aria-label="Как выбирался токен" title="Как выбирался токен" onClick={() => onMode(inPanel ? 'hold' : 'panel')}><Icon name="info" size={15} /></Button>
    <Button size="sm" variant={word != null ? 'soft' : 'ghost'} icon aria-pressed={word != null} aria-label="Своё слово вместо этого" title="Своё слово вместо этого" disabled={busy}
      onClick={() => { setWord(w => (w == null ? '' : null)); if (!inPanel) onMode(word == null ? 'hold' : 'hover'); }}><Icon name="pencil" size={15} /></Button>
    <Button size="sm" variant="ghost" icon aria-label="Заново с этого места" title="Заново с этого места" disabled={busy} onClick={() => S.branchAt(chat, node, i)}><Icon name="refresh" size={15} /></Button>
  </>;
  const field = word != null && <div className="te-inline">
    <Input mono autoFocus placeholder="своё слово" aria-label="Своё слово" value={word} onChange={e => setWord(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') put(); if (e.key === 'Escape') { setWord(null); if (!inPanel) onMode('hover'); } }} />
    <Button size="sm" variant="primary" icon aria-label="Подставить" disabled={!word || busy} onClick={put}><Icon name="up" size={15} /></Button>
  </div>;
  return { tools, field };
}
function TokenCard({ chat, node, i, onMode }: { chat: L.Chat; node: L.Node; i: number; onMode: (m: Open['mode'] | null) => void }) {
  const t = node.tokens![i], v = L.tokenVerdict(t), top = t.top.slice(0, 5), busy = S.state.busy;
  const { tools, field } = useWord(chat, node, i, onMode, false);
  return (
    <Popover label={`Токен №${i + 1}`}>
      <PopoverHead token={L.vis(t.t)} value={t.p != null ? L.pct(t.p) : undefined} tools={tools} />
      {field}
      <Verdict tone={v.tone} label={v.label}>{v.text}</Verdict>
      {top.length > 0 && <CandidateList compact>
        {top.map((c, k) => <CandidateRow key={c.id ?? c.t} rank={k + 1} label={L.vis(c.t)} share={c.p} scale={top[0].p} state={L.same(c, t) ? 'chosen' : undefined}
          onPick={L.same(c, t) || busy ? undefined : () => S.branchAt(chat, node, i, { id: c.id, t: c.t })} />)}
      </CandidateList>}
    </Popover>
  );
}

function AssistantRun({ chat, node, open, setOpen }: { chat: L.Chat; node: L.Node; open: Open | null; setOpen: (o: Open | null) => void }) {
  const s = S.state.settings, toks = node.tokens!, busy = S.state.busy, gen = node.status === 'gen';
  const sibs = chat.nodes[node.parent!].children, at = sibs.indexOf(node.id);
  const hover = useRef(0);
  const mine = open && open.node === node.id ? open : null;
  const later = (f: () => void, ms: number) => { clearTimeout(hover.current); hover.current = window.setTimeout(f, ms); };
  const onOpen = React.useCallback((i: number, el: Element) => { clearTimeout(hover.current); setOpen(mine && mine.mode === 'panel' && mine.i === i ? null : { node: node.id, i, el, mode: 'panel' }); }, [mine, node.id, setOpen]);
  const onHover = React.useCallback((i: number, el: Element | null) => {
    if (open && open.mode !== 'hover') return;
    if (el) later(() => setOpen({ node: node.id, i, el, mode: 'hover' }), open ? 60 : 180);
    else later(() => setOpen(null), 260);                          // time to move the pointer onto the card
  }, [open, node.id, setOpen]);
  // thinking comes first and ends with </think>; it is shown folded, the answer after it
  const thinks = toks.length > 0 && toks[0].t.trim() === '<think>';
  const endIdx = thinks ? toks.findIndex(t => t.t.trim() === '</think>') : -1;
  const split = thinks ? (endIdx < 0 ? toks.length : endIdx + 1) : 0;
  const common = { toks, count: toks.length, heat: s.heat, threshold: s.threshold, special: s.showSpecial, focus: mine ? mine.i : -1, onOpen, onHover };
  const v = gen ? null : L.answerVerdict(toks.slice(split), s.threshold);
  const b = node.branch;
  return (
    <RunCard
      model={node.params?.model || s.model}
      meta={<>
        {sibs.length > 1 && <span className="te-inline" style={{ alignItems: 'center' }}>
          <Button size="sm" variant="ghost" aria-label="Предыдущая ветка" disabled={busy || at === 0} onClick={() => S.switchVariant(chat, node, -1)}><Icon name="left" size={14} /></Button>
          <span>ветка {at + 1} из {sibs.length}</span>
          <Button size="sm" variant="ghost" aria-label="Следующая ветка" disabled={busy || at === sibs.length - 1} onClick={() => S.switchVariant(chat, node, 1)}><Icon name="right" size={14} /></Button>
        </span>}
        {b && <BranchBadge>{b.resample ? <>заново с токена №{b.pos + 1}</> : b.custom ? <>свой текст <code>{L.vis(b.to || '')}</code> в токене №{b.pos + 1}</>
          : <>замена <code>{L.vis(b.from || '')}</code> на <code>{L.vis(b.to || '')}</code> в токене №{b.pos + 1}</>}</BranchBadge>}
        {gen && <span>пишет…</span>}
      </>}
      verdict={v && <Verdict tone={v.tone} label={v.label}>{v.text}</Verdict>}
      stats={node.stats && !gen ? [{ value: toks.filter(t => !t.syn).length, label: 'ток.' }, { value: node.stats.tps.toFixed(1), label: 'ток/с' },
        ...(v ? [{ value: L.pct(v.mean), label: 'средняя уверенность' }] : [])] : undefined}
      actions={!gen && <>
        {!L.isEnded(node) && <>
          <Button size="sm" variant="ghost" icon aria-label="Продолжить на один шаг" title="Продолжить на один шаг (Tab)" disabled={busy} onClick={() => S.continueLast()}><Icon name="continue" size={16} /></Button>
          <Button size="sm" variant="ghost" icon aria-label="Дописать до конца" title="Дописать до конца" disabled={busy} onClick={() => S.continueLast(true)}><Icon name="fastForward" size={16} /></Button>
        </>}
        <Button size="sm" variant="ghost" icon aria-label="Другой вариант ответа" title="Другой вариант ответа" disabled={busy} onClick={() => S.branchAt(chat, node, 0)}><Icon name="refresh" size={16} /></Button>
        <Button size="sm" variant="ghost" icon aria-label="Копировать ответ" title="Копировать ответ" onClick={() => navigator.clipboard?.writeText(L.stripThink(L.tokensText(toks)))}><Icon name="copy" size={16} /></Button>
      </>}
    >
      {split > 0 && (endIdx < 0
        ? <><p className="te-cap">Модель размышляет</p><AnswerTokens {...common} from={0} to={split} /></>
        : <More summary={`Размышления модели: ${split} ток.`}><div style={{ marginTop: 6 }}><AnswerTokens {...common} from={0} to={split} /></div></More>)}
      <AnswerTokens {...common} from={split} to={toks.length} />
      {node.error && <Note tone="err">{node.error}</Note>}
      {mine && mine.el.isConnected && (
        <Float key={mine.mode === 'panel' ? 'panel' : 'card'} anchor={mine.el} scroll={mine.mode === 'panel'}
          onEnter={() => clearTimeout(hover.current)} onLeave={() => { if (mine.mode === 'hover') later(() => setOpen(null), 260); }}>
          {mine.mode === 'panel' ? <TokenDetails key={mine.i} chat={chat} node={node} i={mine.i} onClose={() => setOpen(null)} onMode={m => setOpen(m ? { ...mine, mode: m } : null)} />
            : <TokenCard key={mine.i} chat={chat} node={node} i={mine.i} onMode={m => setOpen(m ? { ...mine, mode: m } : null)} />}
        </Float>)}
    </RunCard>
  );
}

function Conversation({ notice }: { notice: React.ReactNode }) {
  const chat = S.currentChat('chat'), path = chat ? L.pathNodes(chat) : [];
  const [open, setOpen] = useState<Open | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const count = path.reduce((n, x) => n + (x.tokens ? x.tokens.length : 1), 0);
  // follow the text while it grows, unless the reader has scrolled away; a new message always scrolls into view
  const len = useRef(0);
  useEffect(() => {
    const box = body.current?.closest('.te-body');
    if (box && (path.length !== len.current || box.scrollHeight - box.scrollTop - box.clientHeight < 260)) box.scrollTop = box.scrollHeight;
    len.current = path.length;
  }, [count, S.state.busy, chat?.id]);
  useEffect(() => { setOpen(null); }, [chat?.id, path.map(n => n.id).join()]);
  useEffect(() => {
    const down = (e: MouseEvent) => { const el = e.target as Element; if (!el.closest('[data-float]') && !el.closest('.te-tok')) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, []);
  if (!chat || !path.length) return (
    <Thread>
      <EmptyState notice={notice} title="О чём спросить модель?"
        lead="У каждого слова ответа были соперники. Задайте вопрос, наведите на любое слово — и выберите другое, чтобы увидеть, куда свернул бы ответ."
        examples={['Расскажи короткую сказку про кота', 'Придумай название для кофейни', 'Сколько будет 17 × 23? Объясни']} onExample={S.send} />
    </Thread>
  );
  return (
    <Thread>
      {notice}
      {path.map(n => n.role === 'user' ? <UserMessage key={n.id}>{n.text}</UserMessage>
        : <AssistantRun key={n.id} chat={chat} node={n} open={open} setOpen={setOpen} />)}
      <div ref={body} />
    </Thread>
  );
}

// modes are named by the kind of model they look into; new kinds (image generation...) become new rows here
const MODES = [
  { id: 'chat', label: 'Генерация текста', icon: 'chat' as const },
  { id: 'choice', label: 'Классификация текста', icon: 'choice' as const },
  { id: 'image', label: 'Генерация изображений', icon: 'image' as const, soon: true },
];
function ChatDock() {
  const [text, setText] = useState('');
  const submit = () => { if (text.trim() && !S.state.busy) { S.send(text); setText(''); } };
  return <Composer value={text} onChange={setText} onSend={submit} busy={S.state.busy} onStop={S.stop} />;
}

/* ---------- choice from options ---------- */
const CHOICE_STAGES: (Stage & { id: L.ChoiceStage })[] = [
  { id: 'one', name: 'Один токен', param: 'метка', count: '', title: 'Один токен', text: 'Сколько вероятности модель отдала самим меткам. Остальное ушло на другие продолжения.', formula: <Formula>{'P_k = p(«1»)'}</Formula> },
  { id: 'sum', name: 'Сумма', param: 'все написания', count: '', title: 'Сумма по написаниям', text: 'К метке добавлены её другие написания: с пробелом, с точкой, со скобкой. Так варианту достаётся всё, что модель имела в виду.', formula: <Formula>{'P_k = p(«1») + p(«·1») + p(«1.») + …'}</Formula> },
  { id: 'final', name: 'Итог', param: 'до 100%', count: '', title: 'Итог', text: 'Всё, что не метка, отброшено, а вероятности вариантов пересчитаны так, чтобы давать 100%.', formula: <Formula>{'P_k → \\frac{P_k}{Σ_j P_j}'}</Formula> },
];
function ChoiceRun({ chat, run, k, onReuse }: { chat: L.Chat; run: L.Run; k: number; onReuse: () => void }) {
  const [stage, setStage] = useState<L.ChoiceStage>('final');
  const f = run.form, r = run.result, runs = chat.runs!;
  const changes = L.formChanges(k > 0 ? runs[k - 1].form : undefined, f);
  const meta = <><span>прогон {k + 1} из {runs.length}</span>{changes.length > 0 && <BranchBadge>изменено: {changes.join(', ')}</BranchBadge>}</>;
  if (!r) return (
    <RunCard model={S.state.settings.model} meta={meta} question={f.question}>
      {run.status === 'run' ? <p className="te-muted" style={{ margin: 0 }}>Модель читает вопрос…</p> : <Note tone="err">{run.error}</Note>}
    </RunCard>
  );
  const v = L.choiceVerdict(run), shares = r.opts.map(o => L.optShare(o, stage)), max = Math.max(...shares, 1e-9);
  const win = r.opts.reduce((b, o, i) => (o.final > r.opts[b].final ? i : b), 0);
  const stages = CHOICE_STAGES.map(s => ({ ...s, count: s.id === 'final' ? String(r.opts.length) : L.pct(r.opts.reduce((a, o) => a + L.optShare(o, s.id), 0)) }));
  const n = f.options.length, c = run.check;
  // rot[s][i] is option i after s cyclic shifts, i.e. standing at position (i - s) mod n
  const table = c && f.options.map((o, i) => {
    const byPos = Array.from({ length: n }, (_, pos) => c.rot[(i - pos + n) % n][i]);
    return { label: `${r.opts[i].label}. ${o}`, values: [...byPos, byPos.reduce((a, x) => a + x, 0) / n] };
  });
  const best = table ? table.reduce((b, row, i) => (row.values[n] > table[b].values[n] ? i : b), 0) : -1;
  return (
    <RunCard model={r.model} meta={meta} question={f.question} verdict={<Verdict tone={v.tone} label={v.label}>{v.text}</Verdict>} value={L.pct(r.opts[win].final)}
      stats={[{ value: r.seconds.toFixed(2), label: 'с' }, { value: r.promptTokens, label: 'ток. в промпте' }, { prefix: 'неопределённость', value: '≈ ' + +(2 ** r.H).toFixed(1), label: 'равных вариантов' }]}
      actions={<>
        <Button size="sm" variant="ghost" icon aria-label={c ? 'Устойчивость проверена' : 'Проверить устойчивость к порядку вариантов'} title={c ? 'Устойчивость проверена' : run.checking ? 'Проверяю…' : 'Проверить устойчивость к порядку вариантов'}
          disabled={S.state.busy || !!c} onClick={() => S.checkChoice(run)}><Icon name={c ? 'check' : 'shuffle'} size={16} /></Button>
        <Button size="sm" variant="ghost" icon aria-label="Взять за основу" title="Взять за основу: перенести вопрос и варианты в форму" disabled={S.state.busy} onClick={() => { S.setForm(JSON.parse(JSON.stringify(f))); onReuse(); }}><Icon name="copy" size={16} /></Button>
      </>}>
      <StageChain label="Этапы" stages={stages} active={stage} onSelect={id => setStage(id as L.ChoiceStage)} fixedHeight={false} />
      <CandidateList options wrap>
        {r.opts.map((o, i) => <CandidateRow key={i} letter={o.label} label={f.options[i]} share={shares[i]} scale={max} state={i === win ? 'chosen' : undefined} />)}
      </CandidateList>
      {r.inside < 0.5
        ? <Note>На метки пришлось только {L.pct(r.inside)}: модель хотела ответить иначе{r.other.length ? ` — например, ${r.other.slice(0, 3).map(t => `«${L.vis(t.t)}» (${L.pct(t.p)})`).join(', ')}` : ''}. Попробуйте другие метки или начало ответа.</Note>
        : r.inside < 0.99 && <p className="te-muted" style={{ margin: 0, fontSize: 12.5 }}>На метки пришлось {L.pct(r.inside)} вероятности{r.other.length ? `; остальное — ${r.other.slice(0, 3).map(t => `«${L.vis(t.t)}» ${L.pct(t.p)}`).join(', ')}` : ''}.</p>}
      {run.checkError && <Note tone="err">{run.checkError}</Note>}
      {c && table && <Card title="Проверка устойчивости">
        <p>{best === win ? `Ответ не зависит от порядка: в среднем по всем перестановкам впереди тоже «${f.options[win]}».` : `Ответ зависит от порядка: в среднем по перестановкам впереди «${f.options[best]}», а не «${f.options[win]}».`}</p>
        <HeatTable columns={['Вариант', ...f.options.map((_, p) => `на ${p + 1}-м месте`), 'в среднем']} rows={table.map((row, i) => (i === best ? { ...row, top: n } : row))} />
        <p style={{ fontSize: 13 }}>Без содержания, по одним меткам, модель выбрала бы так: {c.bias.map((b, i) => <React.Fragment key={i}>{i > 0 && ', '}<b>{r.opts[i].label}</b> — {L.pct(b)}</React.Fragment>)}.</p>
      </Card>}
      <More summary="Точный промпт: что увидела модель"><pre>{r.prompt}</pre></More>
    </RunCard>
  );
}
// ready-made questions for the empty Decision Model screen, like the examples of Language Model
const CHOICE_PRESETS = [
  { question: 'Какая планета ближе всего к Солнцу?', options: ['Венера', 'Меркурий', 'Марс'] },
  { question: 'Какое слово лишнее?', options: ['яблоко', 'груша', 'морковь', 'слива'] },
  { question: 'Какой тон у отзыва «Доставили быстро, но коробка помята»?', options: ['положительный', 'нейтральный', 'отрицательный'] },
];
function Choice({ notice, onReuse }: { notice: React.ReactNode; onReuse: () => void }) {
  const chat = S.currentChat('choice'), end = useRef<HTMLDivElement>(null);
  const n = chat?.runs?.length || 0;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [n, chat?.id]);
  if (!chat || !n) return (
    <Thread>
      <EmptyState notice={notice} title="Какой вариант выберет модель"
        lead="Модель читает вопрос с вариантами и не пишет ни слова: видно, какую метку она собиралась назвать и с какой вероятностью. Соберите запрос ниже и запустите."
        examples={CHOICE_PRESETS.map(p => p.question)} onExample={q => { const p = CHOICE_PRESETS.find(x => x.question === q); if (p) S.setForm({ question: p.question, options: p.options.slice() }); }} />
    </Thread>
  );
  return (
    <Thread>
      {notice}
      {chat.runs!.map((run, k) => <ChoiceRun key={run.id} chat={chat} run={run} k={k} onReuse={onReuse} />)}
      <div ref={end} />
    </Thread>
  );
}
function ChoiceDock({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const f = S.currentForm(), labels = L.formLabels(f), busy = S.state.busy;
  const opts = (next: string[]) => S.setForm({ options: next });
  const move = (from: number, to: number) => { const a = f.options.slice(); a.splice(to, 0, a.splice(from, 1)[0]); opts(a); };
  const [fresh, setFresh] = useState('');                     // the empty row at the end: typing there adds an option
  const add = () => { if (fresh.trim() && f.options.length < 10) { opts([...f.options, fresh]); setFresh(''); } };
  const send = () => { if (!busy && L.formValid(f)) S.runChoice(); };
  return (
    <div className="te-composer te-composer--form">
      <div className="te-form__scroll">
      {open && <div className="te-form__adv">
        <Field label="Инструкция"><TextArea rows={2} value={f.instruction} onChange={e => S.setForm({ instruction: e.target.value })} /></Field>
        <Field label="Начало ответа модели" hint="Модель продолжает с этого места, поэтому сразу называет метку."><Input mono value={f.prefix} onChange={e => S.setForm({ prefix: e.target.value })} /></Field>
        <Field label="Шаблон запроса" hint="{инструкция}, {вопрос}, {варианты} заменяются полями формы."><TextArea className="te-input--mono" rows={4} value={f.template} onChange={e => S.setForm({ template: e.target.value })} /></Field>
        <Field label="Строка варианта" hint="{метка} и {текст}."><Input mono value={f.line} onChange={e => S.setForm({ line: e.target.value })} /></Field>
      </div>}
      <span className="te-form__cap">Вопрос</span>
      <TextArea maxRows={6} rows={1} className="te-form__q" aria-label="Вопрос" placeholder="Вопрос к модели…" value={f.question} onChange={e => S.setForm({ question: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <div className="te-form__labels"><span>Варианты</span>
        <Segmented quiet label="Метки вариантов" value={f.labels} options={(Object.keys(L.LABELS) as L.LabelScheme[]).map(v => ({ value: v, label: L.LABELS[v].name }))}
          onChange={v => S.setForm({ labels: v, instruction: f.instruction === L.instructionFor(f.labels) ? L.instructionFor(v) : f.instruction })} />
      </div>
      <div className="te-form__opts">
        <Sortable items={f.options} onMove={move} handleLabel="Перетащить вариант">
          {(o, k, pos) => <>
            <span className="te-lb">{labels[pos]}</span>
            <input className="te-form__opt" value={o} placeholder="Текст варианта" aria-label={`Вариант ${labels[k]}`} onChange={e => opts(f.options.map((x, j) => (j === k ? e.target.value : x)))} />
            <Button size="sm" variant="ghost" icon className="is-danger" aria-label="Удалить вариант" title="Удалить вариант" disabled={f.options.length <= 2} onClick={() => opts(f.options.filter((_, j) => j !== k))}><Icon name="x" size={14} /></Button>
          </>}
        </Sortable>
        {f.options.length < 10 && <div className="te-form__add">
          <span className="te-form__gap" />
          <span className="te-lb is-ghost"><Icon name="plus" size={14} /></span>
          <input className="te-form__opt" value={fresh} placeholder="Добавить вариант" aria-label="Новый вариант" onChange={e => setFresh(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
          <span className="te-form__gap te-form__gap--end" />
        </div>}
      </div>
      </div>
      <div className="te-composer__bar">
        <span className="te-top__sp" />
        <Button variant={open ? 'soft' : 'ghost'} icon aria-pressed={open} aria-label="Инструкция и шаблон промпта" title="Инструкция и шаблон промпта" onClick={() => setOpen(!open)}><Icon name="pencil" size={17} /></Button>
        <Button variant="primary" icon aria-label="Запустить" title="Запустить" disabled={busy || !L.formValid(f)} onClick={send}><Icon name="up" size={18} /></Button>
      </div>
    </div>
  );
}

/* ---------- settings: the right column ---------- */
const STEPS = ['0', '1', '8', '16', '32', '64'];
const tempWord = (t: number) => (t === 0 ? 'всегда лидер' : t < 0.5 ? 'осторожно' : t <= 1 ? 'обычно' : t <= 1.4 ? 'смело' : 'хаотично');
function SettingsPanel({ section }: { section: 'chat' | 'choice' }) {
  const s = S.state.settings, set = S.setSettings, st = S.state;
  const [addr, setAddr] = useState(s.server);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const custom = (Object.keys(S.SAMPLER_DEFAULTS) as (keyof typeof S.SAMPLER_DEFAULTS)[]).some(k => +s[k] !== S.SAMPLER_DEFAULTS[k]);
  const sl = (k: keyof S.Settings, min: number, max: number, step: number, label: string) =>
    <Slider label={label} min={min} max={max} step={step} value={+s[k]} onChange={v => set({ [k]: v } as Partial<S.Settings>)} />;
  return <>
    {section === 'chat' && <>
      <Group icon="thermo" title="Температура" value={tempWord(+s.temperature)}>
        <Setting label="Насколько смело выбирать" value={(+s.temperature).toFixed(2)} hint="0 — всегда самый вероятный токен. Чем выше, тем чаще модель берёт не лидера.">
          <Slider tone="heat" label="Температура" min={0} max={2} step={0.05} value={+s.temperature} onChange={v => set({ temperature: v })} />
        </Setting>
      </Group>
      <Group icon="step" title="Шаг генерации" value={s.step ? `${s.step} ток.` : 'весь ответ'}>
        <Setting label="Писать за раз" hint="Модель пишет столько токенов и ждёт. Tab — следующий шаг.">
          <Segmented quiet label="Шаг генерации" value={String(s.step)} onChange={v => set({ step: +v })} options={STEPS.map(v => ({ value: v, label: v === '0' ? 'весь ответ' : v }))} />
        </Setting>
      </Group>
      <Group icon="filter" title="Отбор токенов" value={custom ? 'изменён' : 'стандартный'} defaultOpen={false}>
        <Setting icon="layers" label="Top-K" value={s.top_k || 'выкл'} hint="Оставить столько самых вероятных токенов. 0 — не ограничивать.">{sl('top_k', 0, 200, 1, 'Top-K')}</Setting>
        <Setting icon="ruler" label="Top-P" value={s.top_p >= 1 ? 'выкл' : s.top_p} hint="Брать токены от лидера вниз, пока их сумма не наберёт эту долю. 1 — выключен.">{sl('top_p', 0.05, 1, 0.01, 'Top-P')}</Setting>
        <Setting icon="filter" label="Min-P" value={s.min_p || 'выкл'} hint="Убрать токены слабее этой доли от лидера. 0 — выключен.">{sl('min_p', 0, 0.5, 0.01, 'Min-P')}</Setting>
        <Setting icon="repeat" label="Штраф за повторы" value={'×' + s.repeat_penalty} hint="Понижает токены, которые недавно уже были в тексте. ×1 — выключен.">{sl('repeat_penalty', 1, 1.5, 0.01, 'Штраф за повторы')}</Setting>
        <Setting icon="dice" label="Зерно случайности" hint="Одно и то же неотрицательное число даёт один и тот же ответ. −1 — каждый раз по-новому.">
          <Input mono type="number" aria-label="Зерно случайности" value={s.seed} onChange={e => set({ seed: Math.round(+e.target.value) })} />
        </Setting>
        {custom && <Button size="sm" variant="ghost" onClick={() => set(S.SAMPLER_DEFAULTS)}><Icon name="refresh" size={14} />Вернуть стандартные</Button>}
      </Group>
      <Group icon="text" title="Диалог" value={s.thinking === 'off' ? 'без размышлений' : undefined} defaultOpen={false}>
        <Setting label="Системный промпт" hint="Текст, который модель видит перед каждым разговором.">
          <TextArea rows={3} aria-label="Системный промпт" value={s.system} onChange={e => set({ system: e.target.value })} />
        </Setting>
        <Setting icon="bulb" label="Размышления" hint="Модель может сначала порассуждать про себя; рассуждения тоже разбираются по токенам.">
          <Segmented quiet label="Размышления" value={s.thinking} onChange={v => set({ thinking: v })} options={[{ value: 'auto', label: 'как решит модель' }, { value: 'off', label: 'сразу отвечать' }]} />
        </Setting>
        <Setting label="Предел длины" value={s.max_tokens + ' ток.'} hint="На этом числе токенов модель остановится, даже если не договорила.">{sl('max_tokens', 64, 4096, 64, 'Предел длины ответа')}</Setting>
      </Group>
      <Group icon="eye" title="Подсветка" value={s.heat === 'off' ? 'нет' : s.heat === 'uncertain' ? 'сомнения' : 'энтропия'} defaultOpen={false}>
        <Setting label="Что подсвечивать" hint="Сомнения — токены, в которых модель была уверена меньше порога. Энтропия — места, где вероятность размазана по многим вариантам.">
          <Segmented quiet label="Подсветка" value={s.heat} onChange={v => set({ heat: v })} options={[{ value: 'off', label: 'нет' }, { value: 'uncertain', label: 'сомнения' }, { value: 'entropy', label: 'энтропия' }]} />
        </Setting>
        {s.heat === 'uncertain' && <Setting label="Порог уверенности" value={Math.round(s.threshold * 100) + '%'} hint="Подсвечиваются слова, в которых модель была уверена меньше этого.">{sl('threshold', 0.1, 0.99, 0.01, 'Порог подсветки')}</Setting>}
        <Setting label="Кандидатов на токен" value={s.n_probs} hint="Сколько вариантов сохранять рядом с каждым словом ответа.">{sl('n_probs', 2, 20, 1, 'Кандидатов на токен')}</Setting>
        <Checkbox label="Служебные токены" hint="</think>, <|im_end|> и подобные" checked={s.showSpecial} onChange={v => set({ showSpecial: v })} />
      </Group>
    </>}
    {section === 'choice' && <Card>
      <p style={{ margin: 0, fontSize: 13 }}>В этом режиме модель ничего не пишет, поэтому температура и отбор токенов на результат не влияют: читаются вероятности как есть.</p>
    </Card>}
    <Group icon="server" title="Сервер" value={st.conn === 'ok' ? 'на связи' : st.conn === 'err' ? 'не отвечает' : '…'} defaultOpen={st.conn === 'err'}>
      <ServerRow name="Свой сервер" address={S.serverAddress().replace(/^https?:\/\//, '')} status={st.conn}
        note={st.conn === 'ok' ? `Моделей: ${st.models.length}` : st.conn === 'err' ? 'Запустите server.py или поправьте адрес' : 'Проверяю…'} />
      <div className="te-inline">
        <Input mono placeholder={location.origin} aria-label="Адрес сервера" value={addr} onChange={e => setAddr(e.target.value)} />
        <Button size="sm" onClick={() => { set({ server: addr.trim() }); S.connect(); }}>Подключить</Button>
      </div>
    </Group>
    <Group icon="data" title="Данные" defaultOpen={false}>
      <p style={{ margin: 0, fontSize: 13 }}>Всё хранится в этом браузере.</p>
      <div className="te-inline" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" onClick={S.exportAll}><Icon name="download" size={14} />Сохранить всё</Button>
        <Button size="sm" onClick={() => file.current?.click()}><Icon name="upload" size={14} />Загрузить</Button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setMsg(await S.importFile(f)); e.target.value = ''; }} />
      </div>
      {msg && <p style={{ margin: 0, fontSize: 12.5 }}>{msg}</p>}
    </Group>
  </>;
}

/* ---------- app ---------- */
function App() {
  useStore();
  const st = S.state, s = st.settings, sec = st.section === 'choice' ? 'choice' : 'chat';
  const [picker, setPicker] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = s.theme === 'system' ? (mq.matches ? 'light' : 'dark') : s.theme; };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme]);
  const dark = s.theme === 'dark' || (s.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  useEffect(() => { S.connect(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || S.state.section !== 'chat') return;
      const el = e.target as Element;
      if (el !== document.body && !el.closest('.te-composer') && !el.closest('.te-tok')) return;      // do not steal Tab from forms
      if (S.lastAssistant(S.currentChat('chat'))) { e.preventDefault(); S.continueLast(); }
    };
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-picker]')) setPicker(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, []);
  const cur = S.currentChat(sec);
  const history = S.allChats().map(c => ({
    id: c.id, title: c.title || (c.kind === 'decision' ? 'Вопрос' : 'Без названия'), icon: c.kind === 'decision' ? 'choice' as const : 'chat' as const,
    meta: when(c.updated || c.created) + ' · ' + (c.kind === 'decision' ? `прогонов: ${c.runs?.length || 0}` : `веток: ${Object.values(c.nodes).filter(n => n.role === 'assistant').length}`),
  }));
  const notice = st.saveError ? <Note tone="err">{st.saveError}</Note>
    : st.conn === 'err' ? <Note tone="err" action={<Button size="sm" onClick={S.connect}>Проверить снова</Button>}>Сервер не отвечает. Запустите server.py и проверьте адрес в настройках.</Note>
    : st.conn === 'ok' && !st.models.length ? <Note>На сервере нет моделей: положите модель MLX в папку models.</Note> : null;
  const legend = sec === 'chat' && s.heat !== 'off' && cur
    ? <span className="te-legend"><span>{s.heat === 'uncertain' ? `уверенность ниже ${Math.round(s.threshold * 100)}%` : 'энтропия'}</span><i /></span> : undefined;
  return (
    <AppShell title="Token Explorer" height="100vh"
      sections={MODES} current={sec} onSection={id => S.openChat(id as 'chat' | 'choice', null)}
      newLabel="Новый чат"
      onNew={() => S.openChat('chat', null)}
      history={history} currentRun={cur?.id || ''} renaming={renaming}
      historyActions={[{ id: 'rename', label: 'Переименовать', icon: 'pencil' }, { id: 'save', label: 'Сохранить в файл', icon: 'download' }, { id: 'delete', label: 'Удалить', icon: 'trash', danger: true }]}
      onHistoryAction={(id, act) => {
        const c = S.state.db.chats[id];
        if (!c) return;
        if (act === 'rename') setRenaming(id); else if (act === 'save') S.exportChat(c); else S.deleteChat(id);
      }}
      onRename={(id, title) => { if (title != null) S.renameChat(id, title); setRenaming(null); }} onRun={id => S.openChat(S.state.db.chats[id]?.kind === 'decision' ? 'choice' : 'chat', id)}
      aside={{ title: 'Настройки', children: <SettingsPanel section={sec} /> }}
      model={<div data-picker style={{ position: 'relative', minWidth: 0 }}>
        <ModelChip name={s.model || 'Модель не выбрана'} status={st.conn} onClick={() => setPicker(p => !p)} />
        {picker && <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 15 }}>
          <ModelPicker current={s.model} onPick={id => { if (!st.busy) S.setSettings({ model: id }); setPicker(false); }}
            groups={[{ label: 'Модели на сервере', models: st.models.map(m => ({ id: m, name: m, source: m === s.model ? 'выбрана' : '', sections: [] })) }]}
            summary={st.conn === 'ok' ? 'Первая загрузка модели занимает несколько секунд' : 'Сервер не отвечает'} />
        </div>}
      </div>}
      tools={<>{legend}<button type="button" className="te-top__btn" aria-label={dark ? 'Светлая тема' : 'Тёмная тема'} title={dark ? 'Светлая тема' : 'Тёмная тема'}
        onClick={() => S.setSettings({ theme: dark ? 'light' : 'dark' })}><Icon name={dark ? 'sun' : 'moon'} size={18} /></button></>}
      dock={sec === 'chat' ? <ChatDock /> : <ChoiceDock open={formOpen} setOpen={setFormOpen} />}
    >
      {sec === 'chat' ? <Conversation notice={notice} /> : <Choice notice={notice} onReuse={() => undefined} />}
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
