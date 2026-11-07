// Pure data and maths of the app: token shapes, sampler stages, verdicts, the choice prompt. No React, no network.

export interface Cand { id?: number; t: string; p: number; q?: number; cut?: string; k?: number; pp?: number }
export interface Tok {
  t: string; id?: number; p: number | null; q?: number; cut?: string; rank?: number; H?: number;
  n?: number[]; m?: number[]; top: Cand[];
  /** inserted by the user */ manual?: boolean; /** end-of-answer token */ end?: boolean;
  /** put there by the chat template, not chosen by the model */ syn?: boolean; special?: boolean;
}
export interface Params { model: string; temperature: number; top_k: number; top_p: number; min_p: number; repeat_penalty: number }
export interface Branch { pos: number; from?: string; to?: string; custom?: boolean; resample?: boolean }
export interface Node {
  id: string; parent?: string; children: string[]; active: number;
  role?: 'user' | 'assistant'; text?: string; tokens?: Tok[];
  status?: 'gen' | 'done' | 'error'; error?: string | null; stopped?: boolean; full?: boolean; thinkOff?: boolean;
  params?: Params; branch?: Branch; srv?: { prompt: number; cached: number; vocab: number }; stats?: { gen: number; tps: number };
}
export interface ChoiceForm { instruction: string; question: string; options: string[]; labels: LabelScheme; prefix: string; template: string; line: string }
export interface ChoiceOpt { label: string; one: number; mass: number; final: number; toks: { t: string; p: number; rank: number }[] }
export interface ChoiceResult {
  opts: ChoiceOpt[]; inside: number; other: { t: string; p: number }[]; prompt: string; vocab: number; H: number;
  seconds: number; promptTokens: number; model: string;
}
export interface Run {
  id: string; created: number; form: ChoiceForm; status: 'run' | 'done' | 'error'; error?: string;
  result?: ChoiceResult; check?: { rot: number[][]; bias: number[] }; checking?: boolean; checkError?: string;
}
export interface Chat { id: string; kind?: 'decision'; title: string; created: number; /** time of the last request */ updated?: number; nodes: Record<string, Node>; runs?: Run[]; form?: ChoiceForm }

export const uid = () => Math.random().toString(36).slice(2, 10);
export const pct = (p: number | null | undefined) => {
  if (p == null) return '—';
  const x = p * 100;
  if (x > 0 && x < 0.1) return '<0.1%';
  return (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + '%';
};
/** Make whitespace visible: a leading space is shown as a dot. */
export const vis = (s: string) => (s || '').replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '⇥') || '∅';
export const big = (n: number) => (n >= 10000 ? Math.round(n / 1000) + ' тыс' : String(n));
// tokens from our server carry ids; text alone is ambiguous (fragments of one character look the same)
export const same = (a: { id?: number; t: string }, b: { id?: number; t: string }) => (a.id != null && b.id != null ? a.id === b.id : a.t === b.t);
export const tokensText = (toks: Tok[]) => toks.filter(t => !t.end).map(t => t.t).join('');
export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/<think>[\s\S]*$/, '').trim();
export const SPECIAL_RE = /^<\|[^|>]*\|>$|^<\/?(start_of_turn|end_of_turn|eos|bos|s|think)>$/;

export function pathNodes(c: Chat): Node[] {
  const out: Node[] = [];
  let n = c.nodes.root;
  while (n.children.length) { n = c.nodes[n.children[Math.min(n.active, n.children.length - 1)]]; out.push(n); }
  return out;
}
export function historyFor(c: Chat, node: Node) {
  const chain: Node[] = [];
  let n = node.parent ? c.nodes[node.parent] : undefined;
  while (n && n.id !== 'root') { chain.unshift(n); n = n.parent ? c.nodes[n.parent] : undefined; }
  return chain.map(m => ({ role: m.role as string, content: m.role === 'user' ? m.text || '' : stripThink(tokensText(m.tokens || [])) }));
}
// the answer so far as the server wants it: token ids where known, text otherwise; template parts and the end token are skipped
export const exPrefix = (node: Node, upto: number) => (node.tokens || []).slice(0, upto)
  .filter(t => !t.syn && !t.end).map(t => (t.id != null ? t.id : t.t)).filter(x => x !== '');
export const isEnded = (n: Node) => !!n.full || (n.tokens || []).some(t => t.end);

/* ---------- heat ---------- */
export type HeatMode = 'off' | 'uncertain' | 'entropy';
export function heatLevel(t: Tok, mode: HeatMode, threshold: number): 0 | 1 | 2 | 3 | 4 {
  if (mode === 'off' || t.p == null || t.manual || t.syn) return 0;
  let x: number;                                                   // 0 = sure, 1 = guessing
  if (mode === 'uncertain') { if (t.p >= threshold) return 0; x = 1 - t.p / threshold; }
  else { x = t.H != null ? Math.min(1, t.H / Math.log2(Math.max(2, t.top.length + 1))) : 0; if (x < 0.08) return 0; }
  return (x < 0.25 ? 1 : x < 0.5 ? 2 : x < 0.75 ? 3 : 4);
}

/* ---------- verdicts (wording: design-system README, the table per section) ---------- */
export type Tone = 'ok' | 'mid' | 'low' | 'manual' | 'none';
export interface VerdictData { tone: Tone; label: string; text: string }
const CUT: Record<string, string> = { top_k: 'top-k', top_p: 'top-p', min_p: 'min-p' };
export const cutName = (c?: string) => (c ? CUT[c] || c : '');

export function tokenVerdict(t: Tok): VerdictData {
  if (t.syn) return { tone: 'none', label: 'Нет данных', text: 'Этот тег поставил шаблон чата, модель его не выбирала.' };
  if (t.manual) return { tone: 'manual', label: 'Вставлено вручную', text: t.p != null && t.rank
    ? `Сама модель дала бы ему ${pct(t.p)}, место ${t.rank}` + (t.cut ? `; фильтр ${cutName(t.cut)} не пропустил бы его вовсе.` : '.')
    : 'Дальше модель продолжала уже от него.' };
  if (t.p == null) return { tone: 'none', label: 'Нет данных', text: 'Сервер не прислал вероятности для этого токена.' };
  const r = t.rank || t.top.findIndex(a => same(a, t)) + 1;
  const second = t.top.find(a => !same(a, t));
  let v: VerdictData;
  if (r === 1 && t.p >= 0.9) v = { tone: 'ok', label: 'Уверенный выбор', text: 'Модель почти не сомневалась.' };
  else if (r === 1) v = { tone: 'mid', label: 'Лидер, но были варианты', text: second ? `Ближайший соперник ${vis(second.t)} имел ${pct(second.p)}.` : '' };
  else v = { tone: 'low', label: 'Выбран не лидер', text: `Место ${r || 'за пределами списка'}: его вытянул случайный выбор` + (t.q != null ? `, после фильтров шанс был ${pct(t.q)}.` : '.') };
  if (t.top.length > 1 && t.end) v.text += ' Это конец ответа: выберите другой вариант, и модель продолжит говорить.';
  return v;
}
export function answerVerdict(toks: Tok[], threshold: number): (VerdictData & { mean: number }) | null {
  const ps = toks.filter(t => t.p != null && !t.manual && !t.syn && !t.end).map(t => t.p as number);
  if (!ps.length) return null;
  const unsure = ps.filter(p => p < threshold).length, share = unsure / ps.length;
  const text = unsure ? `Модель выбирала не наверняка в ${unsure} из ${ps.length} мест.` : 'Модель ни разу всерьёз не сомневалась.';
  const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  if (share < 0.15) return { tone: 'ok', label: 'Уверенный ответ', text, mean };
  if (share < 0.4) return { tone: 'mid', label: 'Есть сомнения', text, mean };
  return { tone: 'low', label: 'Ответ ненадёжен', text, mean };
}

/* ---------- sampler stages ---------- */
export interface StageCalc {
  id: string; name: string; param: string; count: number | null; title: string; text: string;
  /** formula in the mini-TeX of the Formula component */
  formula: string;
  /** the same formula with the chosen token's numbers in place of the letters */
  subst?: string;
  /** what the letters mean on this token */
  vars?: { sym: string; text: string }[];
  /** share of the list this filter looks at, for the strip under the formula: kept candidates and a threshold */
  strip?: { threshold?: number; note: string };
  /** probability of a candidate at this stage; null = already removed */
  prob: (a: Cand) => number | null;
}
export function stagesFor(t: Tok, P: Params, vocab: number | null): StageCalc[] | null {
  if (!t.n || !t.m) return null;
  const n = t.n, m = t.m, k = +P.top_k, tp = +P.top_p, mp = +P.min_p, T = +P.temperature, pen = +P.repeat_penalty;
  const off = 'Выключен: все токены проходят дальше.', offFx = 'p_i → p_i';
  const self = t.top.find(a => same(a, t)), name = `«${vis(t.t)}»`, f = (x: number | null | undefined) => (x == null ? '—' : pct(x));
  const p0 = self?.p ?? t.p ?? 0, pPen = self?.pp ?? p0, pK = self?.k, pP = pK != null ? pK / m[0] : null, pM = pK != null && !t.cut ? pK / m[1] : null;
  const st: StageCalc[] = [{ id: 'model', name: 'Модель', param: 'всё', count: vocab, title: 'Модель', prob: a => a.p,
    text: 'Что предлагает сама модель, до любых фильтров. Для каждого токена словаря она выдаёт оценку, оценки пересчитываются в вероятности.',
    formula: 'p_i = \\frac{e^{z_i}}{Σ_j e^{z_j}}', subst: `p_i = ${f(p0)}`,
    vars: [{ sym: 'i', text: `токен ${name}` }, { sym: 'z_i', text: 'его оценка (логит)' }, { sym: 'Σ_j', text: `сумма по всем ${vocab ? big(vocab) : ''} токенам словаря` }] }];
  if (t.top.some(a => a.pp != null)) st.push({ id: 'pen', name: 'Штраф', param: '×' + pen, count: vocab, title: `Штраф за повторы ×${pen}`, prob: a => a.pp ?? a.p,
    text: 'Понижает токены, которые уже встречались в последних 64 токенах текста. Никого не убирает, но меняет порядок.',
    formula: `z_i → \\frac{z_i}{r} при z_i > 0,  r = ${pen}`, subst: `p_i: ${f(p0)} → ${f(pPen)}`,
    vars: [{ sym: 'r', text: `сила штрафа, ${pen}` }, { sym: 'p_i', text: pPen < p0 ? `${name} уже был в тексте и потерял в шансах` : `${name} в тексте не встречался` }] });
  if (t.top.some(a => a.k != null)) {
    // the leader's share when min-p looks at the list, to show the real threshold
    const lead = Math.max(0, ...t.top.filter(a => a.k != null && a.cut !== 'top_k' && a.cut !== 'top_p').map(a => (a.k as number) / m[0]));
    st.push(
      { id: 'top_k', name: 'Top-K', param: k > 0 ? String(k) : 'выкл', count: n[0], title: k > 0 ? `Top-K ${k}` : 'Top-K', prob: a => (a.cut === 'top_k' || a.k == null ? null : a.k),
        text: k > 0 ? `Оставляет ${k} самых вероятных токенов, остальные отбрасывает. Вероятности оставшихся пересчитываются, чтобы снова давать 100%.` : off,
        formula: k > 0 ? `p_i → \\frac{p_i}{p_1 + … + p_{${k}}}` : offFx,
        subst: pK != null ? `\\frac{${f(pPen)}}{${f(pPen / pK)}} = ${f(pK)}` : `${name} отсечён`,
        vars: k > 0 ? [{ sym: `p_1 + … + p_{${k}}`, text: `сколько вероятности у ${k} лучших: ${f(pK ? pPen / pK : null)}` }] : [],
        strip: k > 0 ? { note: `${k} лучших из ${vocab ? big(vocab) : 'словаря'}` } : undefined },
      { id: 'top_p', name: 'Top-P', param: tp < 1 ? String(tp) : 'выкл', count: n[1], title: tp < 1 ? `Top-P ${tp}` : 'Top-P',
        prob: a => (a.cut === 'top_k' || a.cut === 'top_p' || a.k == null ? null : a.k / m[0]),
        text: tp < 1 ? `Идёт от лидера вниз и берёт токены, пока их сумма не наберёт ${Math.round(tp * 100)}%. Длинный хвост маловероятных отбрасывает.` : off,
        formula: tp < 1 ? `p_1 + … + p_n ≥ ${tp}` : offFx,
        subst: tp < 1 ? `p_1 + … + p_{${n[1]}} = ${f(m[0])}` : `p_i → p_i`,
        vars: tp < 1 ? [{ sym: 'n', text: `сколько токенов понадобилось, чтобы набрать ${Math.round(tp * 100)}%: ${n[1]}` }] : [],
        strip: tp < 1 ? { threshold: tp, note: `набрано ${f(m[0])} — граница ${Math.round(tp * 100)}%` } : undefined },
      { id: 'min_p', name: 'Min-P', param: mp > 0 ? String(mp) : 'выкл', count: n[2], title: mp > 0 ? `Min-P ${mp}` : 'Min-P',
        prob: a => (a.cut || a.k == null ? null : a.k / m[1]),
        text: mp > 0 ? `Убирает токены, которые слабее ${+(mp * 100).toFixed(1)}% от лидера. Чем увереннее лидер, тем строже отбор.` : off,
        formula: mp > 0 ? `p_i ≥ ${mp} · p_{max}` : offFx,
        subst: mp > 0 ? `${f(pP)} ${pP != null && pP >= mp * lead ? '≥' : '<'} ${mp} × ${f(lead)} = ${f(mp * lead)}` : 'p_i → p_i',
        vars: mp > 0 ? [{ sym: 'p_{max}', text: `шанс лидера, ${f(lead)}` }, { sym: 'p_i', text: `шанс ${name}, ${f(pP)}` }] : [],
        strip: mp > 0 ? { threshold: mp * lead, note: `порог ${f(mp * lead)}: всё, что левее, уходит` } : undefined });
  }
  st.push({ id: 'temp', name: 'Итог', param: 'T ' + T, count: n[2], title: 'Итог', prob: a => (a.cut ? null : a.q ?? null),
    text: (T <= 0 ? 'Temperature 0: случайности нет, всегда берётся лидер.'
      : T < 1 ? `Temperature ${T} меньше 1: разрыв между кандидатами растёт, лидеры получают больше, слабые меньше.`
      : T > 1 ? `Temperature ${T} больше 1: разница сглаживается, слабые кандидаты получают больше шансов.`
      : 'Temperature 1 ничего не меняет.') + ' Токен выбирается случайно, как бросок кубика с такими гранями.',
    formula: T <= 0 ? 'q_{max} = 1' : `q_i = \\frac{p_i^{1/T}}{Σ_j p_j^{1/T}}`,
    subst: T <= 0 ? `q_i = ${t.q != null ? f(t.q) : '0'}` : `\\frac{${f(pM)}^{${(1 / T).toFixed(2)}}}{Σ_j p_j^{${(1 / T).toFixed(2)}}} = ${t.q != null ? f(t.q) : '0'}`,
    vars: T > 0 ? [{ sym: 'T', text: `температура, ${T}` }, { sym: 'q_i', text: `итоговый шанс ${name}` }] : [] });
  return st;
}
export interface StageRow { c: Cand; p: number; delta?: number; cut?: string; chosen: boolean }
/** Candidates of one stage: survivors by probability, then those this very stage removed. */
export function stageRows(t: Tok, stages: StageCalc[], idx: number) {
  const cur = stages[idx], prev = idx > 0 ? stages[idx - 1] : null;
  const live: StageRow[] = [], cut: StageRow[] = [];
  for (const c of t.top) {
    const p = cur.prob(c), before = prev ? prev.prob(c) : null;
    if (p != null) live.push({ c, p, delta: before != null ? (p - before) * 100 : undefined, chosen: same(c, t) });
    else if (before != null) cut.push({ c, p: 0, cut: cutName(c.cut), chosen: same(c, t) });
  }
  live.sort((a, b) => b.p - a.p);
  const shown = live.reduce((s, r) => s + r.p, 0);
  const rest = cur.count != null ? Math.max(0, cur.count - live.length) : 0;
  return { live, cut, rest, restShare: Math.max(0, 1 - shown) };
}

/* ---------- choice from options ---------- */
export type LabelScheme = 'num' | 'lat' | 'cyr';
export const LABELS: Record<LabelScheme, { name: string; at: (k: number) => string; how: string }> = {
  num: { name: '1 2 3', at: k => String(k + 1), how: 'его номером' },
  lat: { name: 'A B C', at: k => String.fromCharCode(65 + k), how: 'его буквой' },
  cyr: { name: 'а б в', at: k => 'абвгдежзиклмнопрст'[k] || String(k + 1), how: 'его буквой' },
};
export const instructionFor = (s: LabelScheme) => `Выбери один правильный вариант ответа. Ответь только ${LABELS[s].how}.`;
export const newForm = (): ChoiceForm => ({
  instruction: instructionFor('num'), question: '', options: ['', ''],
  labels: 'num', prefix: 'Ответ:', template: '{инструкция}\n\nВопрос: {вопрос}\n\nВарианты:\n{варианты}', line: '{метка}. {текст}',
});
export const formLabels = (f: ChoiceForm) => f.options.map((_, k) => LABELS[f.labels].at(k));
export function choicePrompt(f: ChoiceForm) {
  const labels = formLabels(f);
  const lines = f.options.map((o, k) => f.line.replace('{метка}', labels[k]).replace('{текст}', o)).join('\n');
  return { labels, content: f.template.replace('{инструкция}', f.instruction).replace('{вопрос}', f.question).replace('{варианты}', lines) };
}
// a label can be written by several tokens: "1", " 1", "1." ... all of them mean the same answer
export const spellings = (l: string) => [...new Set([l, l.toUpperCase(), l.toLowerCase()])]
  .flatMap(x => [x, ' ' + x, x + '.', ' ' + x + '.', x + ')', ' ' + x + ')', '\n' + x]);
export const formValid = (f: ChoiceForm) => !!f.question.trim() && f.options.length >= 2 && f.options.every(o => o.trim());
export function formChanges(prev: ChoiceForm | undefined, cur: ChoiceForm): string[] {
  if (!prev) return [];
  const out: string[] = [], eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (prev.instruction !== cur.instruction) out.push('инструкция');
  if (prev.question !== cur.question) out.push('вопрос');
  if (!eq(prev.options, cur.options)) out.push(eq(prev.options.slice().sort(), cur.options.slice().sort()) ? 'порядок вариантов' : 'варианты');
  if (prev.labels !== cur.labels) out.push('метки');
  if (prev.prefix !== cur.prefix) out.push('начало ответа');
  if (prev.template !== cur.template || prev.line !== cur.line) out.push('шаблон');
  return out;
}
export type ChoiceStage = 'one' | 'sum' | 'final';
export const optShare = (o: ChoiceOpt, s: ChoiceStage) => (s === 'one' ? o.one : s === 'sum' ? o.mass : o.final);
export function choiceVerdict(run: Run): VerdictData {
  const r = run.result!, f = run.form, byP = r.opts.map((o, i) => ({ o, i })).sort((a, b) => b.o.final - a.o.final);
  const top = byP[0], second = byP[1], name = (i: number) => `«${f.options[i]}»`;
  if (run.check) {
    const n = f.options.length, wins = run.check.rot.filter(row => row.indexOf(Math.max(...row)) === top.i).length;
    if (wins < n) return { tone: 'low', label: 'Ответ ненадёжен', text: `${name(top.i)} выигрывает только при ${wins} из ${n} перестановок вариантов.` };
  }
  if (top.o.final >= 0.8) return { tone: 'ok', label: 'Уверенный выбор', text: `Выбрано ${name(top.i)}; ближайший соперник ${name(second.i)} имел ${pct(second.o.final)}.` };
  if (top.o.final >= 0.5) return { tone: 'mid', label: 'Есть сомнения', text: `Выбрано ${name(top.i)}, но ${name(second.i)} имел ${pct(second.o.final)}.` };
  return { tone: 'low', label: 'Ответ ненадёжен', text: `Выбрано ${name(top.i)}, но ${name(second.i)} почти рядом: ${pct(second.o.final)}.` };
}
