// App state, persistence and the calls to our own server (server.py). The data is mutable, as in the old index.html;
// views re-render when `bump()` is called.
import {
  Chat, ChoiceForm, ChoiceResult, Node, Params, Run, Tok, SPECIAL_RE, HeatMode,
  choicePrompt, exPrefix, formValid, historyFor, isEnded, newForm, pathNodes, spellings, tokensText, uid,
} from './logic';

export type SectionId = 'chat' | 'choice' | 'settings';
export interface Settings {
  v: number; server: string; model: string; system: string; thinking: 'auto' | 'off';
  temperature: number; top_k: number; top_p: number; min_p: number; repeat_penalty: number; seed: number;
  max_tokens: number; n_probs: number; heat: HeatMode; threshold: number; showSpecial: boolean; step: number;
  /** system — as the operating system says */
  theme: 'system' | 'light' | 'dark';
}
const DEFAULTS: Settings = {
  v: 1, server: '', model: '', system: 'Ты полезный ассистент. Отвечай по делу.', thinking: 'auto',
  temperature: 0.7, top_k: 40, top_p: 0.95, min_p: 0.05, repeat_penalty: 1.05, seed: -1,
  max_tokens: 1024, n_probs: 10, heat: 'uncertain', threshold: 0.6, showSpecial: true, step: 0, theme: 'system',
};
export const SAMPLER_DEFAULTS = { top_k: DEFAULTS.top_k, top_p: DEFAULTS.top_p, min_p: DEFAULTS.min_p, repeat_penalty: DEFAULTS.repeat_penalty, seed: DEFAULTS.seed };
// one chat is open at a time; `current` remembers it under its kind, `last` is the mode a new chat starts in
interface Db { chats: Record<string, Chat>; order: string[]; current: { chat: string | null; choice: string | null; last?: 'chat' | 'choice' } }

// own keys: the old interface keeps its chats under te.db / te.settings on the same address, and we never write there
const K_DB = 'te2.db', K_SET = 'te2.settings';
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const state = {
  settings: { ...DEFAULTS, ...load<Partial<Settings>>(K_SET, {}) } as Settings,
  db: load<Db>(K_DB, { chats: {}, order: [], current: { chat: null, choice: null } }),
  section: 'chat' as SectionId,
  busy: false,
  conn: 'idle' as 'idle' | 'ok' | 'err',
  models: [] as string[],
  saveError: '',
};
let ctrl: AbortController | null = null;

// One-time move from the old single-file interface, which kept its data under te.db / te.settings on the same address.
// The old keys are only read, never changed.
function migrateOld() {
  try {
    if (localStorage.getItem('te2.migrated')) return;
    const old = load<{ chats?: Record<string, Chat>; order?: string[]; current?: string | null }>('te.db', {});
    const os = load<Record<string, any> | null>('te.settings', null);
    if (os) {
      const pick = ['system', 'temperature', 'top_k', 'top_p', 'min_p', 'repeat_penalty', 'seed', 'max_tokens', 'n_probs', 'threshold', 'showSpecial'] as const;
      for (const k of pick) if (os[k] != null) (state.settings as any)[k] = os[k];
      if (os.thinking === 'off') state.settings.thinking = 'off';
      if (os.heat === 'off' || os.heat === 'entropy') state.settings.heat = os.heat;
      if (os.tab_tokens > 0) state.settings.step = +os.tab_tokens;
      if (os.api === 'explorer' && os.model) state.settings.model = os.model;
    }
    for (const id of old.order || Object.keys(old.chats || {})) {
      const c = old.chats && old.chats[id];
      if (!c || !c.nodes || state.db.chats[id]) continue;
      if (c.kind === 'decision' ? !(c.runs || []).length : Object.keys(c.nodes).length < 2) continue;      // empty drafts stay behind
      if (/^Нов(ый чат|ое решение)$/.test(c.title)) c.title = '';
      state.db.chats[id] = c; state.db.order.push(id);
    }
    const cur = old.current && state.db.chats[old.current];
    if (cur) state.db.current[cur.kind === 'decision' ? 'choice' : 'chat'] = cur.id;
    localStorage.setItem(K_DB, JSON.stringify(state.db));
    localStorage.setItem(K_SET, JSON.stringify(state.settings));
    localStorage.setItem('te2.migrated', '1');
  } catch {
    state.saveError = 'Не удалось перенести чаты из прежнего интерфейса: в хранилище браузера не хватило места. Они остались в прежнем хранилище; сохраните их в файл через «Данные» и удалите лишние.';
  }
}
migrateOld();
state.section = state.db.current.last || (state.db.current.choice && !state.db.current.chat ? 'choice' : 'chat');

/* ---------- change notification ---------- */
let version = 0, raf = 0;
const subs = new Set<() => void>();
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getVersion = () => version;
export function bump() { version++; subs.forEach(f => f()); }
// streaming pushes tokens far more often than the screen needs
function bumpSoon() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; bump(); }); }

function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); state.saveError = ''; }
  catch { state.saveError = 'Не удалось сохранить: в хранилище браузера кончилось место. Сохраните чаты в файл и удалите лишние.'; }
}
let saveT = 0;
export const saveDb = () => { clearTimeout(saveT); saveT = window.setTimeout(() => save(K_DB, state.db), 300); };
export function setSettings(patch: Partial<Settings>) { Object.assign(state.settings, patch); save(K_SET, state.settings); bump(); }

/* ---------- chats ---------- */
const kindOf = (s: SectionId) => (s === 'choice' ? 'decision' : undefined);
export const chatsOf = (s: SectionId) => state.db.order.map(id => state.db.chats[id]).filter(c => c && c.kind === kindOf(s));
export const currentChat = (s: 'chat' | 'choice' = state.section === 'choice' ? 'choice' : 'chat'): Chat | null => {
  const id = state.db.current[s];
  return (id && state.db.chats[id]) || null;
};
/** Open a chat of kind `s`, or start a new one of that kind (`id` = null). The other mode keeps its own open chat. */
export function openChat(s: 'chat' | 'choice', id: string | null) {
  if (state.busy) return;
  if (s === 'choice' && !id) resetDraft();
  state.db.current[s] = id; state.db.current.last = s; state.section = s; saveDb(); bump();
}
/** Switch the mode in the side menu: the centre shows what was open in that mode. */
export function showMode(s: 'chat' | 'choice') { if (state.busy) return; state.db.current.last = s; state.section = s; saveDb(); bump(); }
export const allChats = () => state.db.order.map(id => state.db.chats[id]).filter(Boolean);
export function setSection(s: SectionId) { state.section = s; bump(); }
function createChat(s: 'chat' | 'choice'): Chat {
  const c: Chat = { id: uid(), title: '', created: Date.now(), nodes: { root: { id: 'root', children: [], active: 0 } } };
  if (s === 'choice') { c.kind = 'decision'; c.runs = []; c.form = draftForm; }
  state.db.chats[c.id] = c; state.db.order.unshift(c.id); state.db.current[s] = c.id; state.db.current.last = s;
  return c;
}
export function deleteChat(id: string) {
  if (state.busy) return;
  delete state.db.chats[id];
  state.db.order = state.db.order.filter(x => x !== id);
  for (const s of ['chat', 'choice'] as const) if (state.db.current[s] === id) state.db.current[s] = null;
  saveDb(); bump();
}
export function renameChat(id: string, title: string) { const c = state.db.chats[id]; if (c && title.trim()) { c.title = title.trim().slice(0, 80); saveDb(); bump(); } }
function addNode(c: Chat, parentId: string, data: Partial<Node>): Node {
  const n: Node = { id: uid(), parent: parentId, children: [], active: 0, ...data };
  c.nodes[n.id] = n;
  const p = c.nodes[parentId]; p.children.push(n.id); p.active = p.children.length - 1;
  return n;
}

/* ---------- server ---------- */
const base = () => (state.settings.server || location.origin).replace(/\/+$/, '');
export const serverAddress = base;
const netError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m === 'Failed to fetch' || m === 'Load failed' ? 'Не удалось связаться с сервером. Проверьте, что он запущен.' : m;
};
export async function connect() {
  try {
    const info = await (await fetch(base() + '/info')).json();
    if (info.engine !== 'token-explorer') throw new Error('not ours');
    const j = await (await fetch(base() + '/v1/models')).json();
    state.models = (j.data || []).map((m: { id: string }) => m.id);
    if (!state.models.includes(state.settings.model)) { state.settings.model = info.model && state.models.includes(info.model) ? info.model : state.models[0] || ''; save(K_SET, state.settings); }
    state.conn = 'ok';
  } catch { state.conn = 'err'; state.models = []; }
  bump();
}
async function sse(url: string, body: unknown, signal: AbortSignal | undefined, onJson: (j: any) => boolean) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const txt = await res.text(); let msg = txt.slice(0, 300);
    try { msg = JSON.parse(txt).error.message || msg; } catch { /* keep raw text */ }
    throw new Error(`Сервер ответил ${res.status}: ${msg}`);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let j: any; try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      if (onJson(j)) return;
    }
  }
}
const systemMsgs = () => { const s = state.settings.system.trim(); return s ? [{ role: 'system', content: s }] : []; };
const paramsNow = (): Params => { const s = state.settings; return { model: s.model, temperature: +s.temperature, top_k: +s.top_k, top_p: +s.top_p, min_p: +s.min_p, repeat_penalty: +s.repeat_penalty }; };
const toTok = (j: any): Tok => {
  const t: Tok = { t: j.t, id: j.id, p: j.p, rank: j.rank, H: j.H, n: j.n, m: j.m, top: j.top || [], special: !!j.eos || SPECIAL_RE.test(String(j.t).trim()) };
  if (j.q != null) t.q = j.q; else t.cut = j.cut;
  if (j.forced) t.manual = true;
  if (j.eos) t.end = true;
  return t;
};

/* ---------- conversation ---------- */
async function generate(c: Chat, node: Node, force: (number | string)[] | null, full = false) {
  const s = state.settings, toks = node.tokens!;
  if (node.thinkOff == null) node.thinkOff = s.thinking === 'off';
  c.updated = Date.now();
  node.params = paramsNow(); node.status = 'gen'; node.error = null; node.stopped = false; node.full = false;
  state.busy = true; ctrl = new AbortController(); bump();
  const t0 = performance.now(), n0 = toks.length;
  try {
    await sse(base() + '/generate', {
      messages: [...systemMsgs(), ...historyFor(c, node)], prefix: exPrefix(node, toks.length), force: force || [],
      thinking: !node.thinkOff, max_tokens: s.step > 0 && !full ? s.step : +s.max_tokens, n_probs: +s.n_probs, seed: +s.seed, ...node.params, model: s.model || undefined,
    }, ctrl.signal, j => {
      if (j.type === 'start') {
        node.srv = { prompt: j.prompt_tokens, cached: j.cached_tokens, vocab: j.vocab };
        if (j.think_open && !toks.length) toks.push({ t: '<think>\n', p: null, top: [], syn: true, special: true });
      } else if (j.type === 'token') { toks.push(toTok(j)); bumpSoon(); }
      else if (j.type === 'done') return true;
      return false;
    });
    node.status = 'done';
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') { node.status = 'done'; node.stopped = true; }
    else { node.status = 'error'; node.error = netError(e); }
  }
  const gen = toks.length - n0;
  node.stats = { gen, tps: gen / Math.max((performance.now() - t0) / 1000, 0.001) };
  // a continuation that produced nothing means the model had already finished its turn
  if (n0 > 0 && gen === 0 && node.status === 'done' && !node.stopped) node.full = true;
  state.busy = false; ctrl = null; saveDb(); bump();
}
export const stop = () => ctrl?.abort();
export async function send(text: string) {
  text = text.trim();
  if (!text || state.busy) return;
  const c = currentChat('chat') || createChat('chat');
  const path = pathNodes(c), leaf = path.length ? path[path.length - 1] : c.nodes.root;
  const u = addNode(c, leaf.id, { role: 'user', text });
  if (!c.title) c.title = text.slice(0, 60);
  await generate(c, addNode(c, u.id, { role: 'assistant', tokens: [] }), null);
}
/** A new answer that shares the first `i` tokens with `src`; `alt` is put at position `i`, otherwise the model samples again. */
export function branchAt(c: Chat, src: Node, i: number, alt?: { id?: number; t: string; custom?: boolean }) {
  if (state.busy) return;
  const n = addNode(c, src.parent!, { role: 'assistant', tokens: src.tokens!.slice(0, i).map(t => ({ ...t })), thinkOff: src.thinkOff });
  if (alt) n.branch = { pos: i, from: src.tokens![i] ? src.tokens![i].t : '', to: alt.t, custom: !!alt.custom };
  else if (i > 0) n.branch = { pos: i, resample: true };
  // the server replays the inserted token itself and returns it with probabilities
  generate(c, n, alt ? [alt.id != null ? alt.id : alt.t] : null);
}
/** Grow the last answer by one step; `full` — write it to the end, ignoring the step. */
export function continueLast(full = false) {
  const c = currentChat('chat');
  if (state.busy || !c) return;
  const p = pathNodes(c), n = p[p.length - 1];
  if (n && n.role === 'assistant' && !isEnded(n)) generate(c, n, null, full);
}
export function switchVariant(c: Chat, n: Node, dir: number) {
  const p = c.nodes[n.parent!], k = p.children.indexOf(n.id) + dir;
  if (state.busy || k < 0 || k >= p.children.length) return;
  p.active = k; saveDb(); bump();
}
/** A wider candidate list for one position; kept in memory only, the browser storage is small. */
const moreCache = new Map<string, Tok['top']>();
export const moreFor = (node: Node, i: number) => moreCache.get(node.id + ':' + i);
export async function fetchMore(c: Chat, node: Node, i: number, count: number) {
  const t = node.tokens![i], P = node.params || paramsNow();
  let top: Tok['top'] | null = null;
  await sse(base() + '/generate', {
    messages: [...systemMsgs(), ...historyFor(c, node)], prefix: exPrefix(node, i), force: [t.id != null ? t.id : t.t],
    thinking: !node.thinkOff, max_tokens: 0, n_probs: count, ...P, model: P.model || undefined,
  }, undefined, j => { if (j.type === 'token') top = j.top; return j.type === 'done'; });
  if (top) { moreCache.set(node.id + ':' + i, top); bump(); }
}

/* ---------- choice from options ---------- */
// the form of a choice chat that has no runs yet lives here, so that typing does not create empty chats
let draftForm: ChoiceForm = newForm();
export const currentForm = (): ChoiceForm => currentChat('choice')?.form || draftForm;
export function setForm(patch: Partial<ChoiceForm>) { Object.assign(currentForm(), patch); if (currentChat('choice')) saveDb(); bump(); }
export function resetDraft(form?: ChoiceForm) { draftForm = form ? JSON.parse(JSON.stringify(form)) : newForm(); }

async function score(f: ChoiceForm): Promise<ChoiceResult> {
  const { labels, content } = choicePrompt(f);
  const res = await fetch(base() + '/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: state.settings.model || undefined, messages: [{ role: 'user', content }], thinking: false,
    prefix: f.prefix ? [f.prefix] : [], watch: labels.flatMap(spellings), n_probs: 12, skip_space: true }) });
  const j = await res.json().catch(() => ({ error: { message: 'Сервер ответил ' + res.status } }));
  if (!res.ok || j.error) throw new Error((j.error && j.error.message) || 'Сервер ответил ' + res.status);
  const key = (s: string) => s.replace(/[\s.)]/g, '').toLowerCase(), watched = new Set(j.watch.map((w: any) => w.id));
  const opts = labels.map(l => {
    const toks = j.watch.filter((w: any) => key(w.text) === l.toLowerCase()).sort((a: any, b: any) => b.p - a.p);
    return { label: l, one: toks[0] ? toks[0].p : 0, mass: toks.reduce((s: number, w: any) => s + w.p, 0), final: 0,
      toks: toks.slice(0, 4).map((w: any) => ({ t: w.t, p: +w.p.toPrecision(4), rank: w.rank })) };
  });
  const inside = opts.reduce((s, o) => s + o.mass, 0);
  opts.forEach(o => { o.final = inside > 0 ? o.mass / inside : 1 / opts.length; });
  return { opts, inside, other: j.top.filter((t: any) => !watched.has(t.id)).slice(0, 5).map((t: any) => ({ t: t.t, p: t.p })),
    prompt: j.prompt, vocab: j.vocab, H: j.H, seconds: j.seconds, promptTokens: j.prompt_tokens, model: j.model };
}
export async function runChoice() {
  const f = currentForm();
  if (state.busy || !formValid(f)) return;
  const c = currentChat('choice') || createChat('choice');
  const run: Run = { id: uid(), created: Date.now(), form: JSON.parse(JSON.stringify(f)), status: 'run' };
  c.runs!.push(run); c.updated = run.created;
  if (!c.title) c.title = f.question.slice(0, 60);
  state.busy = true; bump();
  try { run.result = await score(run.form); run.status = 'done'; }
  catch (e) { run.status = 'error'; run.error = netError(e); }
  state.busy = false; saveDb(); bump();
}
// Stability: every option visits every position (cyclic shifts), plus a content-free run that shows what the labels attract by themselves
export async function checkChoice(run: Run) {
  if (state.busy || !run.result) return;
  const f = run.form, n = f.options.length;
  state.busy = true; run.checking = true; run.checkError = undefined; bump();
  try {
    const rot = [run.result.opts.map(o => o.final)];
    for (let s = 1; s < n; s++) {
      const r = await score({ ...f, options: f.options.map((_, k) => f.options[(k + s) % n]) });
      rot.push(f.options.map((_, i) => r.opts[(i - s + n) % n].final));          // back to the original order of options
    }
    const blank = await score({ ...f, question: '—', options: f.options.map(() => '—') });
    run.check = { rot, bias: blank.opts.map(o => o.final) };
  } catch (e) { run.checkError = netError(e); }
  state.busy = false; run.checking = false; saveDb(); bump();
}

/* ---------- data ---------- */
function download(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = name + '.json'; a.click();
  URL.revokeObjectURL(a.href);
}
export const exportAll = () => download(`token-explorer-${new Date().toISOString().slice(0, 10)}`, { app: 'token-explorer', format: 2, db: state.db });
export const exportChat = (c: Chat) => download((c.title || 'token-explorer').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 40) || 'token-explorer', c);
function adopt(chats: Chat[]): number {
  let n = 0;
  for (const c of chats) {
    if (!c || !c.id || !c.nodes || state.db.chats[c.id]) continue;
    state.db.chats[c.id] = c; state.db.order.push(c.id); n++;
  }
  save(K_DB, state.db); bump();
  return n;
}
export async function importFile(file: File): Promise<string> {
  try {
    const j = JSON.parse(await file.text()), db = j.db || j;
    const chats: Chat[] = db.chats ? Object.values(db.chats) : db.nodes ? [db] : [];
    if (!chats.length) return 'В файле нет чатов.';
    return `Добавлено чатов: ${adopt(chats)}.`;
  } catch { return 'Не удалось прочитать файл.'; }
}
export const lastAssistant = (c: Chat | null) => { const p = c ? pathNodes(c) : []; const n = p[p.length - 1]; return n && n.role === 'assistant' ? n : null; };
export { tokensText };
