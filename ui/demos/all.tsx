/// <reference path="./globals.d.ts" />
const TE = TokenExplorer;
const {
  Mark, Brand, Button, Segmented, Field, Input, TextArea, Range, Checkbox, Card, Note, More, Kbd, Popover, PopoverHead, EmptyState,
  Verdict, VerdictTag, TokenChip, Answer, TokenCode, BranchBadge, CandidateRow, CandidateList, StageChain, MetricTile, MetricTiles, HeatTable,
  ModelChip, ModelPicker, Composer, ParamBar, RunCard, TokenPanel, SettingsPanel, ServerRow, HeatLegend, AppShell, Thread, UserMessage, Columns,
} = TE;
const { useState } = React;

const Demo = ({ children, col, max, top }: { children: React.ReactNode; col?: boolean; max?: number; top?: boolean }) => (
  <div className={'te-demo' + (col ? ' te-demo--col' : '')} style={{ maxWidth: max, alignItems: top ? 'flex-start' : undefined }}>{children}</div>
);

/* ---------- shared data ---------- */

type Cand = { t: string; p: number; d?: number; cut?: string; rest?: boolean };
const sub = (s: string) => <sub>{s}</sub>;
const STAGES: (TokenExplorer.Stage & { cands: Cand[] })[] = [
  {
    id: 'model', name: 'Модель', param: 'всё', count: '248 тыс', title: 'Модель',
    text: 'Что предлагает сама модель, до любых фильтров. Для каждого токена словаря она выдаёт оценку, оценки пересчитываются в вероятности.',
    formula: <>p{sub('i')} = e<sup>z{sub('i')}</sup> / Σ{sub('j')} e<sup>z{sub('j')}</sup>,&nbsp; z — оценки модели</>,
    example: <><code>·атмос</code>: 27.4%</>,
    cands: [{ t: '·атмос', p: 0.274 }, { t: '·ваша', p: 0.212 }, { t: '·«', p: 0.148 }, { t: '·вы', p: 0.046 }, { t: '·**', p: 0.033 }, { t: 'ещё 248 тыс ток.', p: 0.287, rest: true }],
  },
  {
    id: 'pen', name: 'Штраф', param: '×1.2', count: '248 тыс', title: 'Штраф за повторы ×1.2',
    text: 'Понижает токены, которые уже встречались в последних 64 токенах текста. Никого не убирает, но меняет порядок.',
    formula: <>z{sub('i')} → z{sub('i')} / r при z{sub('i')} &gt; 0,&nbsp; r = 1.2</>,
    example: <><code>·**</code> уже был в тексте: 3.3% → 2.9%</>,
    cands: [{ t: '·атмос', p: 0.275, d: 0.1 }, { t: '·ваша', p: 0.213, d: 0.1 }, { t: '·«', p: 0.149, d: 0.1 }, { t: '·вы', p: 0.046 }, { t: '·**', p: 0.029, d: -0.4 }, { t: 'ещё 248 тыс ток.', p: 0.288, d: 0.1, rest: true }],
  },
  {
    id: 'top_k', name: 'Top-K', param: '40', count: '40',
    text: 'Оставляет 40 самых вероятных токенов, остальные отбрасывает. Вероятности оставшихся пересчитываются, чтобы снова давать 100%. Было 248 тыс, осталось 40.',
    formula: <>оставить K = 40 наибольших;&nbsp; p{sub('i')} → p{sub('i')} / Σ{sub('ост.')} p{sub('j')}</>,
    example: <><code>·атмос</code>: 27.5% → 30.9%</>,
    cands: [{ t: '·атмос', p: 0.309, d: 3.4 }, { t: '·ваша', p: 0.248, d: 3.5 }, { t: '·«', p: 0.171, d: 2.2 }, { t: '·вы', p: 0.051, d: 0.5 }, { t: '·**', p: 0.037, d: 0.8 }, { t: 'ещё 35 ток.', p: 0.184, d: -10.4, rest: true }],
  },
  {
    id: 'top_p', name: 'Top-P', param: '0.95', count: '22',
    text: 'Идёт от лидера вниз и берёт токены, пока их сумма не наберёт 95%. Длинный хвост маловероятных отбрасывает. Было 40, осталось 22.',
    formula: <>оставить первые n:&nbsp; p{sub('1')} + … + p{sub('n')} ≥ 0.95</>,
    example: <><code>·атмос</code>: 30.9% → 32.5%</>,
    cands: [{ t: '·атмос', p: 0.325, d: 1.5 }, { t: '·ваша', p: 0.26, d: 1.2 }, { t: '·«', p: 0.18, d: 0.9 }, { t: '·вы', p: 0.054, d: 0.3 }, { t: '·**', p: 0.039, d: 0.2 }, { t: 'ещё 17 ток.', p: 0.142, d: -4.2, rest: true }, { t: '·ко', p: 0, cut: 'top-p' }],
  },
  {
    id: 'min_p', name: 'Min-P', param: '0.05', count: '6',
    text: 'Убирает токены, которые слабее 5% от лидера. Чем увереннее лидер, тем строже отбор. Было 22, осталось 6.',
    formula: <>оставить p{sub('i')} ≥ 0.05 · p{sub('max')} = 0.05 × 32.5% = 1.63%</>,
    example: <><code>·атмос</code>: 32.5% → 37.1%</>,
    cands: [{ t: '·атмос', p: 0.371, d: 4.6 }, { t: '·ваша', p: 0.297, d: 3.7 }, { t: '·«', p: 0.205, d: 2.5 }, { t: '·вы', p: 0.062, d: 0.8 }, { t: '·**', p: 0.045, d: 0.6 }, { t: 'ещё 1 ток.', p: 0.02, d: -12.2, rest: true }, { t: '·цель', p: 0, cut: 'min-p' }],
  },
  {
    id: 'temp', name: 'Итог', param: 'T 0.8', count: '6', title: 'Итог',
    text: 'Temperature 0.8 меньше 1: разрыв между кандидатами растёт, лидеры получают больше, слабые меньше. Получаются итоговые шансы, и токен выбирается случайно, как бросок кубика с такими гранями.',
    formula: <>q{sub('i')} = p{sub('i')}<sup>1/T</sup> / Σ{sub('j')} p{sub('j')}<sup>1/T</sup>,&nbsp; 1/T = 1.25</>,
    example: <><code>·атмос</code>: 37.1% → 41.0%</>,
    cands: [{ t: '·атмос', p: 0.41, d: 3.9 }, { t: '·ваша', p: 0.311, d: 1.4 }, { t: '·«', p: 0.196, d: -0.9 }, { t: '·вы', p: 0.044, d: -1.8 }, { t: '·**', p: 0.03, d: -1.5 }, { t: 'ещё 1 ток.', p: 0.009, d: -1.1, rest: true }],
  },
];

const candRows = (cands: Cand[], pick = true) => {
  let rank = 0;
  return cands.map(c => (
    <CandidateRow
      key={c.rest ? 'rest' : c.t}
      rank={c.rest ? '…' : c.cut ? '' : ++rank}
      label={c.t}
      mono={c.rest ? false : undefined}
      share={c.p}
      scale={cands[0].p}
      delta={c.d}
      state={c.cut ? 'cut' : c.rest ? 'rest' : c.t === '·атмос' ? 'chosen' : undefined}
      cutReason={c.cut}
      onPick={pick ? () => {} : undefined}
    />
  ));
};

const TILES = (
  <MetricTiles>
    <MetricTile label="Место" value="1" note="из 248 тыс" />
    <MetricTile label="Неопределённость" value="≈ 23" note="равных вариантов" title="Как будто модель выбирала наугад из 23 одинаково вероятных токенов" />
    <MetricTile label="Шанс после фильтров" value="41%" note="у модели 27%" />
  </MetricTiles>
);

const ANSWER = (onTok?: () => void, focus?: boolean) => (
  <Answer>
    Выбор названия <TokenChip heat={2}>зависит</TokenChip> от того, <TokenChip heat={3}>какая</TokenChip> именно{' '}
    <TokenChip manual focused={focus} onClick={onTok}>ваша</TokenChip> <TokenChip heat={1}>кофе</TokenChip>йня:{' '}
    <TokenChip heat={4}>уютная</TokenChip>, <TokenChip heat={2}>быстрая</TokenChip> или <TokenChip heat={3}>для своих</TokenChip>. Вот{' '}
    <TokenChip heat={1}>несколько</TokenChip> вариантов с кратким <TokenChip heat={2}>обоснованием</TokenChip>.
  </Answer>
);

const SECTIONS = [
  { id: 'chat', label: 'Разговор', count: 12 }, { id: 'choice', label: 'Выбор из вариантов', count: 6 }, { id: 'compare', label: 'Сравнение', count: 2 },
  { id: 'ablate', label: 'Вычёркивание', count: 3 }, { id: 'inside', label: 'Внутри модели', count: 1 },
];
const RAIL = <><Button>Настройки</Button><Button>Импорт и экспорт</Button></>;

const useParams = (initial: string | null = null) => {
  const [open, setOpen] = useState<string | null>(initial);
  const [t, setT] = useState(0.8);
  const [step, setStep] = useState('0');
  const stepLabel = step === '0' ? 'весь ответ' : step + ' ток.';
  const params: TokenExplorer.Param[] = [
    {
      id: 't', label: 'Температура', value: t.toFixed(2),
      editor: (
        <Field label="Температура" value={t.toFixed(2)} hint="Чем выше, тем чаще модель берёт не самый вероятный токен. 0 — всегда лидер.">
          <Range min={0} max={2} step={0.05} value={t} onChange={e => setT(+e.target.value)} />
        </Field>
      ),
    },
    {
      id: 'step', label: 'Шаг', value: stepLabel,
      editor: (
        <Field label="Шаг генерации" hint="Модель пишет столько токенов и ждёт. Tab — следующий шаг.">
          <Segmented quiet label="Шаг генерации" value={step} onChange={setStep}
            options={['0', '1', '8', '16', '32', '64'].map(v => ({ value: v, label: v === '0' ? 'весь ответ' : v }))} />
        </Field>
      ),
    },
    { id: 'samp', label: 'Отбор', value: 'стандартный' },
  ];
  return { params, open, onToggle: setOpen, hint: <><Kbd>Tab</Kbd> — продолжить ответ</> };
};

const Dock = ({ placeholder }: { placeholder?: string }) => {
  const [v, setV] = useState('');
  return <><Composer value={v} onChange={setV} placeholder={placeholder} /><ParamBar {...useParams()} /></>;
};

function Shell({ current, tools, legend, dock, history, children }: {
  current: string; tools?: React.ReactNode; legend?: React.ReactNode; dock?: React.ReactNode;
  history: TokenExplorer.HistoryItem[]; children: React.ReactNode;
}) {
  return (
    <AppShell
      height={720} title="Token Explorer" tagline="что модель могла сказать иначе"
      sections={SECTIONS} current={current} history={history} currentRun={history[0]?.id} railActions={RAIL}
      model={<ModelChip name="Qwen3.5-0.8B-8bit" kind="языковая · свой сервер" />}
      tools={tools} legend={legend} dock={dock}
    >
      {children}
    </AppShell>
  );
}

/* ---------- Основа ---------- */

export function MarkDemo() {
  return (
    <Demo>
      <Brand title="Token Explorer" tagline="что модель могла сказать иначе" />
      <span className="te-run__who"><Mark size="sm" /> Qwen3.5-0.8B-8bit</span>
    </Demo>
  );
}

export function ButtonDemo() {
  return (
    <Demo>
      <Button variant="primary">Запустить</Button>
      <Button>Другой вариант</Button>
      <Button size="sm">⇥ Продолжить</Button>
      <Button size="sm">↻ Заново отсюда</Button>
      <Button size="sm" disabled>✓ Проверено</Button>
      <Button variant="dashed">+ вариант</Button>
      <Button variant="link">показать по шагам</Button>
      <Button variant="primary" icon aria-label="Отправить">↑</Button>
      <Button variant="danger" icon aria-label="Остановить">■</Button>
    </Demo>
  );
}

export function SegmentedDemo() {
  const [heat, setHeat] = useState('uncertain');
  const [step, setStep] = useState('0');
  return (
    <Demo col>
      <div>
        <Segmented label="Подсветка" value={heat} onChange={setHeat} options={[
          { value: 'off', label: 'Нет' }, { value: 'uncertain', label: 'Сомнения' }, { value: 'gradient', label: 'Градиент' }, { value: 'entropy', label: 'Энтропия' }]} />
      </div>
      <div>
        <span className="te-muted" style={{ fontSize: 12 }}>Шаг генерации: </span>
        <Segmented quiet label="Шаг генерации" value={step} onChange={setStep}
          options={['0', '1', '8', '16', '32', '64'].map(v => ({ value: v, label: v === '0' ? 'весь ответ' : v }))} />
      </div>
    </Demo>
  );
}

export function FieldDemo() {
  const [t, setT] = useState(0.8);
  const [url, setUrl] = useState('http://localhost:8090');
  const [sys, setSys] = useState('Ты полезный ассистент. Отвечай по делу.');
  const [sp, setSp] = useState(true);
  return (
    <Demo col max={380}>
      <Field label="Адрес сервера" hint="Сервер на связи, моделей: 2." hintTone="ok">
        <Input value={url} onChange={e => setUrl(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Температура" value={t.toFixed(2)} hint="Чем выше, тем чаще модель берёт не самый вероятный токен.">
        <Range min={0} max={2} step={0.05} value={t} onChange={e => setT(+e.target.value)} />
      </Field>
      <Field label="Системный промпт"><TextArea rows={2} value={sys} onChange={e => setSys(e.target.value)} /></Field>
      <Checkbox label="Показывать служебные токены" hint="</think>, <|im_end|> и подобные." checked={sp} onChange={setSp} />
    </Demo>
  );
}

export function CardDemo() {
  return (
    <Demo col max={560}>
      <Card title="Проверка устойчивости" action={<Button variant="link">как это считается</Button>}>
        <p style={{ marginBottom: 0 }}>Ответ зависит от порядка: «яблоко» выигрывает только при 1 из 4 перестановок.</p>
      </Card>
      <Note action={<Button size="sm">Выбрать другую</Button>}>Модель не отдаёт вероятности токенов: разбор по этапам недоступен.</Note>
      <Note tone="err">Сервер не отвечает. Проверьте, что он запущен.</Note>
    </Demo>
  );
}

export function PopoverDemo() {
  const c = STAGES[0].cands.slice(0, 3);
  return (
    <Demo top>
      <Popover label="Токен №10">
        <PopoverHead index="№10" token="·атмос" value="27%" />
        <Verdict tone="mid" label="Лидер, но были варианты">Ближайший соперник ·ваша имел 21%.</Verdict>
        <CandidateList compact>{candRows(c, false)}</CandidateList>
        <p className="te-pop__foot">Клик — полный разбор и ветвление.</p>
      </Popover>
    </Demo>
  );
}

export function EmptyStateDemo() {
  const [picked, setPicked] = useState('');
  return (
    <Demo col>
      <EmptyState
        title={<>Что модель могла сказать <TokenChip heat={3}>иначе</TokenChip></>}
        lead="Задайте вопрос — и смотрите, из чего модель выбирала каждое слово ответа."
        steps={[
          { title: 'Спросите', text: 'Модель ответит как обычно.' },
          { title: 'Наведите на слово', text: 'Увидите, какие были варианты и насколько она сомневалась.' },
          { title: 'Выберите другое', text: 'Ответ продолжится от вашего варианта новой веткой.' },
        ]}
        examples={['Придумай название для кофейни', 'Какая планета ближе всего к Солнцу?', 'Продолжи: «Однажды осенью…»']}
        onExample={setPicked}
      />
      {picked && <p className="te-muted" style={{ margin: 0, fontSize: 12 }}>В поле запроса подставлено: «{picked}»</p>}
    </Demo>
  );
}

/* ---------- Разбор ---------- */

export function VerdictTagDemo() {
  return (
    <Demo col>
      <Verdict tone="ok" label="Уверенный выбор">Модель почти не сомневалась.</Verdict>
      <Verdict tone="mid" label="Есть сомнения">Ближайший соперник <b>груша</b> имел 26%.</Verdict>
      <Verdict tone="low" label="Ответ ненадёжен">Победитель меняется при перестановке вариантов.</Verdict>
      <p className="te-verdict"><VerdictTag tone="manual">Вставлено вручную</VerdictTag><VerdictTag tone="none">Нет данных</VerdictTag></p>
    </Demo>
  );
}

export function TokenChipDemo() {
  const [focus, setFocus] = useState(false);
  return (
    <Demo col>
      {ANSWER(() => setFocus(f => !f), focus)}
      <div>
        <TokenCode>·атмос</TokenCode>{' '}
        <BranchBadge>замена <code>·атмос</code> на <code>·ваша</code> в токене №10</BranchBadge>{' '}
        <TokenChip special>{'<|im_end|>'}</TokenChip>
      </div>
    </Demo>
  );
}

const OPTS = [{ l: 'A', t: 'яблоко', p: 0.38 }, { l: 'B', t: 'груша', p: 0.26 }, { l: 'C', t: 'морковь', p: 0.27 }, { l: 'D', t: 'слива', p: 0.087 }];
const optRows = (deltas?: number[]) => OPTS.map((o, i) => (
  <CandidateRow key={o.l} letter={o.l} label={o.t} share={o.p} scale={0.38} delta={deltas?.[i]} state={i === 0 ? 'chosen' : undefined} />
));

export function CandidateRowDemo() {
  return (
    <Demo col max={460}>
      <CandidateList caption={['место', 'шанс (к прошлому этапу, п.п.)']}>{candRows(STAGES[3].cands)}</CandidateList>
      <CandidateList options>{optRows([2.1, -0.8, 0.4, -1.7])}</CandidateList>
    </Demo>
  );
}

export function StageChainDemo() {
  const [a, setA] = useState('top_p');
  return <Demo col max={460}><StageChain label="Этапы отбора" stages={STAGES} active={a} onSelect={setA} /></Demo>;
}

export function MetricTileDemo() {
  return <Demo col max={460}>{TILES}</Demo>;
}

const CHECK_COLS = ['Вариант', 'на 1-м месте', 'на 2-м месте', 'на 3-м месте', 'на 4-м месте', 'в среднем'];
const CHECK_ROWS: TokenExplorer.HeatRow[] = [
  { label: 'A. яблоко', values: [0.38, 0.36, 0.15, 0.13, 0.26] },
  { label: 'B. груша', values: [0.36, 0.26, 0.088, 0.093, 0.2] },
  { label: 'C. морковь', values: [0.44, 0.36, 0.27, 0.14, 0.31], top: 4 },
  { label: 'D. слива', values: [0.41, 0.31, 0.15, 0.087, 0.24] },
];
const CHECK = (
  <Card title="Проверка устойчивости">
    <p>Ответ зависит от порядка: «яблоко» выигрывает только при 1 из 4 перестановок. В среднем впереди «морковь».</p>
    <HeatTable columns={CHECK_COLS} rows={CHECK_ROWS} />
  </Card>
);

export function HeatTableDemo() {
  return <Demo col max={620}>{CHECK}</Demo>;
}

/* ---------- Каркас ---------- */

function LivePanel({ onClose }: { onClose?: () => void }) {
  const [a, setA] = useState('top_p');
  const [custom, setCustom] = useState('');
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const play = () => {
    let i = 0;
    const tick = () => { setA(STAGES[i].id); if (++i < STAGES.length) timer.current = window.setTimeout(tick, 1400); };
    window.clearTimeout(timer.current);
    tick();
  };
  const cur = STAGES.find(s => s.id === a)!;
  return (
    <TokenPanel
      index="№10" token="·атмос" value="27%" onClose={onClose ?? (() => {})} onPlay={play}
      verdict={<Verdict tone="mid" label="Лидер, но были варианты">Ближайший соперник ·ваша имел 21%.</Verdict>}
      stages={STAGES} active={a} onStage={setA}
      tiles={TILES}
      actions={<>
        <Input mono placeholder="свой текст вместо этого" aria-label="Свой текст" value={custom} onChange={e => setCustom(e.target.value)} />
        <Button size="sm">Подставить</Button><Button size="sm">↻ Заново отсюда</Button>
      </>}
      note="Клик по варианту, свой текст или «заново» создают новую ветку; исходный ответ сохраняется."
    >
      <CandidateList caption={['место', a === 'model' ? 'шанс' : 'шанс (к прошлому этапу, п.п.)']} height={226}>{candRows(cur.cands)}</CandidateList>
    </TokenPanel>
  );
}

export function TokenPanelDemo() {
  return <Demo top><LivePanel /></Demo>;
}

const CHOICE_STAGES: TokenExplorer.Stage[] = [
  { id: 'one', name: 'Один токен', param: 'метка', count: '71%', title: 'Один токен', text: 'Сколько вероятности модель отдала самим меткам A, B, C, D. Остальное ушло на другие продолжения.', formula: 'P(k) = p(«A»), p(«B»), …' },
  { id: 'sum', name: 'Сумма', param: 'все написания', count: '84%', title: 'Сумма по написаниям', text: 'К метке добавлены её другие написания: с пробелом, строчная, со скобкой. Так варианту достаётся всё, что модель имела в виду.', formula: 'P(k) = p(«A») + p(«·A») + p(«a») + …' },
  { id: 'final', name: 'Итог', param: 'до 100%', count: '4', title: 'Итог', text: 'Всё, что не метка, отброшено, а вероятности вариантов пересчитаны так, чтобы давать 100%.', formula: 'P(k) → P(k) / Σ P(j)' },
];

function ChoiceRun() {
  const [a, setA] = useState('final');
  const [checked, setChecked] = useState(true);
  const k = a === 'one' ? 0.71 : a === 'sum' ? 0.84 : 1;
  return (
    <RunCard
      model="Qwen3.5-0.8B-8bit" meta={<span>прогон 2 из 2</span>} question="Какое слово лишнее?"
      verdict={<Verdict tone="low" label="Ответ ненадёжен">Выбрано <b>яблоко</b>, но «морковь» и «груша» почти рядом.</Verdict>}
      value="38%"
      stats={[{ value: '0.13', label: 'с' }, { value: '64', label: 'ток. в промпте' }, { prefix: 'неопределённость', value: '≈ 3.6', label: 'равных вариантов' }]}
      actions={<>
        <Button size="sm" disabled={checked} onClick={() => setChecked(true)}>{checked ? '✓ Проверено' : 'Проверить устойчивость'}</Button>
        <Button size="sm">Взять за основу</Button>
      </>}
    >
      <StageChain label="Этапы" stages={CHOICE_STAGES} active={a} onSelect={setA} fixedHeight={false} />
      <CandidateList options>
        {OPTS.map((o, i) => <CandidateRow key={o.l} letter={o.l} label={o.t} share={o.p * k} scale={0.38} state={i === 0 ? 'chosen' : undefined} />)}
      </CandidateList>
      {checked && CHECK}
      <More summary="Точный промпт: что увидела модель"><pre>{'Вопрос: Какое слово лишнее?\nA. яблоко\nB. груша\nC. морковь\nD. слива\nОтвет:'}</pre></More>
    </RunCard>
  );
}

export function RunCardDemo() {
  return <Demo col max={792}><ChoiceRun /></Demo>;
}

export function ParamBarDemo() {
  const [v, setV] = useState('');
  const p = useParams('t');
  return <Demo col max={792}><div><Composer value={v} onChange={setV} /><ParamBar {...p} /></div></Demo>;
}

const MODEL_GROUPS: TokenExplorer.ModelGroup[] = [
  {
    label: 'Языковые модели', models: [
      { id: 'qwen', name: 'Qwen3.5-0.8B-8bit', source: 'свой сервер', sections: ['Разговор', 'Выбор из вариантов', 'Сравнение', 'Внутри модели'] },
      { id: 'bonsai', name: 'Ternary-Bonsai-27B-mlx-2bit', source: 'свой сервер', sections: ['Разговор', 'Выбор из вариантов', 'Сравнение', 'Внутри модели'] },
      { id: 'gemma', name: 'gemma-3-4b-it', source: 'LM Studio', sections: ['Разговор', 'Сравнение'], note: 'без разбора по этапам' },
    ],
  },
  { label: 'Модели решений', models: [{ id: 'laya', name: 'Laya-small', source: 'свой сервер', sections: ['Выбор из вариантов'] }] },
  { label: 'Модели эмбеддингов', models: [{ id: 'bge', name: 'bge-m3', source: 'LM Studio · не загружена', status: 'idle', sections: ['Выбор из вариантов'] }] },
];

export function ModelPickerDemo() {
  const [cur, setCur] = useState('qwen');
  const m = MODEL_GROUPS.flatMap(g => g.models.map(x => ({ ...x, kind: g.label }))).find(x => x.id === cur)!;
  const kind = m.kind === 'Языковые модели' ? 'языковая' : m.kind === 'Модели решений' ? 'модель решений' : 'эмбеддинги';
  return (
    <Demo col top>
      <ModelChip name={m.name} kind={`${kind} · ${m.source.split(' · ')[0]}`} status={m.status ?? 'ok'} />
      <ModelPicker groups={MODEL_GROUPS} current={cur} onPick={setCur} summary="Найдено на 2 серверах" footerAction={<Button variant="link">Серверы и адреса</Button>} />
    </Demo>
  );
}

const SETTINGS_TABS = [{ value: 'servers', label: 'Серверы' }, { value: 'dialog', label: 'Диалог' }, { value: 'view', label: 'Отображение' }, { value: 'data', label: 'Данные' }];

function Settings() {
  const [tab, setTab] = useState('servers');
  const [n, setN] = useState(10);
  const [th, setTh] = useState(0.6);
  const [sp, setSp] = useState(false);
  const [think, setThink] = useState('auto');
  return (
    <SettingsPanel tabs={SETTINGS_TABS} tab={tab} onTab={setTab}>
      {tab === 'servers' && <>
        <Card>
          <ServerRow name="Свой сервер" address="localhost:8090" status="ok" note="На связи, моделей: 3. Полный разбор по этапам." />
          <ServerRow name="LM Studio" address="localhost:1234" status="ok" note="На связи, моделей: 2. Вероятности есть, действие сэмплеров не видно." />
          <ServerRow name="llama.cpp" address="localhost:8080" status="err" note="Не отвечает. Запустите сервер или удалите адрес." />
        </Card>
        <div className="te-inline"><Input mono placeholder="http://localhost:порт" aria-label="Адрес нового сервера" /><Button>Добавить сервер</Button></div>
        <p className="te-muted" style={{ fontSize: 12, margin: 0 }}>Приложение само определяет, что это за сервер и какие у него модели. Выбирать протокол не нужно.</p>
      </>}
      {tab === 'dialog' && <Card>
        <Field label="Системный промпт" hint="Текст, который модель видит перед каждым разговором."><TextArea rows={3} defaultValue="Ты полезный ассистент. Отвечай по делу." /></Field>
        <Field label="Размышления перед ответом" hint="Модель может сначала порассуждать про себя; рассуждения тоже разбираются по токенам.">
          <Segmented label="Размышления" value={think} onChange={setThink} options={[{ value: 'auto', label: 'Как решит модель' }, { value: 'off', label: 'Сразу отвечать' }]} />
        </Field>
      </Card>}
      {tab === 'view' && <Card>
        <Field label="Кандидатов на каждый токен" value={n} hint="Сколько вариантов сохранять рядом с каждым словом ответа."><Range min={2} max={20} step={1} value={n} onChange={e => setN(+e.target.value)} /></Field>
        <Field label="Порог подсветки «сомнения»" value={Math.round(th * 100) + '%'} hint="Подсвечиваются слова, в которых модель была уверена меньше этого."><Range min={0.1} max={0.99} step={0.01} value={th} onChange={e => setTh(+e.target.value)} /></Field>
        <Checkbox label="Показывать служебные токены" hint="</think>, <|im_end|> и подобные." checked={sp} onChange={setSp} />
      </Card>}
      {tab === 'data' && <Card>
        <p style={{ marginTop: 0 }}>Чаты и прогоны хранятся в этом браузере. Сохраните их в файл, чтобы перенести или не потерять.</p>
        <div className="te-inline"><Button>Сохранить всё в файл</Button><Button>Загрузить из файла</Button></div>
      </Card>}
    </SettingsPanel>
  );
}

export function SettingsPanelDemo() {
  return <Demo col><Settings /></Demo>;
}

export function AppShellDemo() {
  const [heat, setHeat] = useState('uncertain');
  const [panel, setPanel] = useState(false);
  return (
    <Shell
      current="chat"
      tools={<Segmented label="Подсветка" value={heat} onChange={setHeat} options={[
        { value: 'off', label: 'Нет' }, { value: 'uncertain', label: 'Сомнения' }, { value: 'gradient', label: 'Градиент' }, { value: 'entropy', label: 'Энтропия' }]} />}
      legend={<HeatLegend end="чем ярче, тем больше сомнений">Подсвечены места, где модель была уверена меньше чем на 60%</HeatLegend>}
      dock={<Dock />}
      history={[
        { id: '1', title: 'Придумай название для кофейни', meta: 'ответов и веток: 2 · сегодня' },
        { id: '2', title: 'Почему небо синее', meta: 'ответов и веток: 1 · вчера' },
        { id: '3', title: 'Продолжи: «Однажды осенью…»', meta: 'ответов и веток: 4 · 3 окт' },
      ]}
    >
      <Thread>
        <UserMessage>Придумай название для кофейни и объясни выбор</UserMessage>
        <RunCard
          model="Qwen3.5-0.8B-8bit"
          meta={<><span>ветка 2 из 2</span><BranchBadge>замена <code>·атмос</code> на <code>·ваша</code> в токене №10</BranchBadge></>}
          verdict={<Verdict tone="mid" label="Есть сомнения">В 55 местах из 100 модель выбирала не наверняка.</Verdict>}
          stats={[{ value: '100', label: 'ток.' }, { value: '34.1', label: 'ток/с' }, { value: '50%', label: 'средняя уверенность' }]}
          actions={<><Button size="sm">⇥ Продолжить</Button><Button size="sm">↻ Другой вариант</Button><Button size="sm">Копировать</Button></>}
        >
          {ANSWER(() => setPanel(p => !p), panel)}
          {panel && <LivePanel onClose={() => setPanel(false)} />}
        </RunCard>
      </Thread>
    </Shell>
  );
}

/* ---------- Экраны ---------- */

export function ScreenChoiceDemo() {
  return (
    <Shell
      current="choice"
      dock={
        <Card raised>
          <div className="te-card__head">
            <span className="te-run__q" style={{ fontSize: 15 }}>Какое слово лишнее?</span>
            <span className="te-inline" style={{ alignItems: 'center' }}><Button variant="link">развернуть ▴</Button><Button variant="primary">Запустить</Button></span>
          </div>
        </Card>
      }
      history={[{ id: '1', title: 'Какое слово лишнее?', meta: 'прогонов: 2 · сегодня' }, { id: '2', title: 'Какая планета ближе всего…', meta: 'прогонов: 6 · сегодня' }]}
    >
      <Thread><ChoiceRun /></Thread>
    </Shell>
  );
}

export function ScreenSettingsDemo() {
  return (
    <Shell current="" history={[]}>
      <Settings />
    </Shell>
  );
}

function CompareCol({ model, tone, label, why, value, children, cands }: {
  model: string; tone: TokenExplorer.VerdictTone; label: string; why: string; value: string; children: React.ReactNode; cands: [string, number][];
}) {
  return (
    <RunCard model={model} verdict={<Verdict tone={tone} label={label}>{why}</Verdict>} value={value}>
      <Answer>{children}</Answer>
      <CandidateList>
        {cands.map(([t, p], i) => <CandidateRow key={t} rank={i + 1} label={t} share={p} scale={cands[0][1]} state={i === 0 ? 'chosen' : undefined} />)}
      </CandidateList>
    </RunCard>
  );
}

export function ScreenCompareDemo() {
  return (
    <Shell
      current="compare"
      tools={<Button size="sm">+ вторая модель: gemma-3-4b-it ▾</Button>}
      dock={<Dock placeholder="Один запрос — двум моделям…" />}
      history={[{ id: '1', title: 'Какая планета ближе всего…', meta: '2 модели · сегодня' }, { id: '2', title: 'Столица Австралии', meta: '2 модели · вчера' }]}
    >
      <Thread wide>
        <p className="te-run__q">Какая планета ближе всего к Солнцу?</p>
        <Verdict tone="low" label="Модели расходятся">Ответы разошлись на токене №3: одна уверена, другая почти гадает.</Verdict>
        <Columns>
          <CompareCol model="Qwen3.5-0.8B-8bit" tone="ok" label="Уверенный выбор" why="Модель почти не сомневалась." value="91%"
            cands={[['·Меркурий', 0.91], ['·Венера', 0.062], ['·Солнце', 0.011]]}>
            Ближе всего <TokenChip focused>Меркурий</TokenChip>.
          </CompareCol>
          <CompareCol model="gemma-3-4b-it" tone="mid" label="Есть сомнения" why="Соперник ·Меркурий имел 44%." value="48%"
            cands={[['·Венера', 0.48], ['·Меркурий', 0.44], ['·Марс', 0.03]]}>
            Ближе всего <TokenChip heat={3} focused>Венера</TokenChip>, <TokenChip heat={2}>хотя</TokenChip> Меркурий рядом.
          </CompareCol>
        </Columns>
        <Card title="Где модели расходятся">
          <HeatTable
            columns={['Токен', 'Qwen3.5', 'gemma-3', 'разница, п.п.']} plain={[2]}
            format={(v, c) => (c === 2 ? String(Math.round(v * 100)) : TE.pct(v))}
            rows={[
              { label: '№1 ·Ближе', values: [0.88, 0.81, 0.07] },
              { label: '№2 ·всего', values: [0.97, 0.95, 0.02] },
              { label: '№3 ·Меркурий / ·Венера', values: [0.91, 0.48, 0.43], top: 2 },
            ]}
          />
        </Card>
      </Thread>
    </Shell>
  );
}

const SENTENCES = [
  { t: 'Меркурий — первая планета от Солнца.', d: -58, heat: 4 as const },
  { t: 'Его орбита лежит в 58 млн км от звезды.', d: -9, heat: 2 as const },
  { t: 'Венера — вторая, она ярче всех на небе.', d: 6, heat: 1 as const },
  { t: 'Земля — третья планета.', d: 0, heat: 0 as const },
];

export function ScreenAblationDemo() {
  const [off, setOff] = useState<number | null>(0);
  const base = 0.91;
  const now = off == null ? base : Math.max(0.02, base + SENTENCES[off].d / 100);
  const st = (id: string, name: string, param: string, count: string, text: string): TokenExplorer.Stage => ({ id, name, param, count, text, title: name });
  const [a, setA] = useState('cmp');
  return (
    <Shell
      current="ablate"
      tools={<Segmented label="Единица" value="s" options={[{ value: 's', label: 'По предложению' }, { value: 'p', label: 'По абзацу' }]} />}
      dock={<Dock placeholder="Вопрос к тексту…" />}
      history={[{ id: '1', title: 'Какая планета ближе всего…', meta: '4 предложения · сегодня' }, { id: '2', title: 'Кто автор письма?', meta: '11 предложений · вчера' }]}
    >
      <Thread>
        <RunCard
          model="Qwen3.5-0.8B-8bit" meta={<span>вычёркивание по предложению</span>} question="Какая планета ближе всего к Солнцу?"
          verdict={<Verdict tone="low" label="Ответ держится на одном предложении">Без первого предложения шанс ответа «Меркурий» падает с 91% до 33%.</Verdict>}
          value={TE.pct(now)}
          stats={[{ value: '5', label: 'прогонов' }, { value: '0.7', label: 'с' }, { value: '4', label: 'предложения в тексте' }]}
          actions={<><Button size="sm" onClick={() => setOff(null)}>Вернуть всё</Button><Button size="sm">Копировать</Button></>}
        >
          <StageChain label="Этапы" active={a} onSelect={setA} fixedHeight={false} stages={[
            st('full', 'Весь текст', 'как есть', '91%', 'Сначала модель отвечает по полному тексту — это точка отсчёта.'),
            st('cut', 'Без одного', '4 прогона', '33–97%', 'Затем текст подаётся столько раз, сколько в нём предложений, каждый раз без одного.'),
            st('cmp', 'Сравнение', 'п.п.', '−58', 'Чем сильнее изменился шанс ответа без предложения, тем больше оно решило. Минус — без него ответ слабеет, плюс — крепнет.'),
          ]} />
          <Answer>
            {SENTENCES.map((s, i) => (
              <React.Fragment key={i}>
                <TokenChip heat={s.heat || undefined} focused={off === i} onClick={() => setOff(off === i ? null : i)}>
                  {off === i ? <s>{s.t}</s> : s.t}
                </TokenChip>{' '}
              </React.Fragment>
            ))}
          </Answer>
          <CandidateList wrap caption={['предложение', 'шанс ответа без него (сдвиг, п.п.)']}>
            {SENTENCES.map((s, i) => (
              <CandidateRow key={i} rank={i + 1} mono={false} label={s.t} share={Math.max(0.02, base + s.d / 100)} scale={1}
                delta={s.d || undefined} state={off === i ? 'chosen' : undefined} onPick={() => setOff(off === i ? null : i)} />
            ))}
          </CandidateList>
        </RunCard>
      </Thread>
    </Shell>
  );
}

const LAYERS: TokenExplorer.HeatRow[] = [
  { label: 'Слои 1–4', values: [0.02, 0.03, 0.01, 0.94] },
  { label: 'Слои 5–8', values: [0.08, 0.11, 0.04, 0.77] },
  { label: 'Слои 9–12', values: [0.21, 0.26, 0.09, 0.44] },
  { label: 'Слои 13–16', values: [0.47, 0.31, 0.08, 0.14] },
  { label: 'Слои 17–20', values: [0.78, 0.14, 0.03, 0.05], top: 0 },
  { label: 'Слои 21–24', values: [0.91, 0.06, 0.01, 0.02] },
];

export function ScreenInsideDemo() {
  const [view, setView] = useState('layers');
  const [a, setA] = useState('decide');
  const st = (id: string, name: string, param: string, count: string, text: string): TokenExplorer.Stage => ({ id, name, param, count, text, title: name });
  return (
    <Shell
      current="inside"
      tools={<Segmented label="Вид" value={view} onChange={setView} options={[{ value: 'layers', label: 'По слоям' }, { value: 'attn', label: 'Куда смотрела' }]} />}
      dock={<Dock />}
      history={[{ id: '1', title: 'Какая планета ближе всего…', meta: 'токен №3 · сегодня' }]}
    >
      <Thread>
        <UserMessage>Какая планета ближе всего к Солнцу?</UserMessage>
        <RunCard
          model="Qwen3.5-0.8B-8bit" meta={<span>токен №3 из 4</span>}
          verdict={<Verdict tone="ok" label="Определилась рано">Модель выбрала «Меркурий» к 17-му слою из 24 и дальше не меняла решение.</Verdict>}
          value="91%"
          stats={[{ value: '24', label: 'слоя' }, { prefix: 'решение на слое', value: '17', label: '' }]}
        >
          <Answer>Ближе всего <TokenChip focused>Меркурий</TokenChip>.</Answer>
          {view === 'layers' ? <>
            <StageChain label="Этапы" active={a} onSelect={setA} fixedHeight={false} stages={[
              st('early', 'Начало', 'слои 1–8', 'нет ответа', 'В первых слоях модель ещё разбирает сам вопрос: ни один кандидат не выделяется.'),
              st('mid', 'Выбор', 'слои 9–16', '2 кандидата', 'В середине появляются планеты: «Меркурий» и «Венера» идут почти рядом.'),
              st('decide', 'Решение', 'слои 17–24', '1 лидер', 'С 17-го слоя «Меркурий» уходит вперёд и остаётся лидером до конца. Чем раньше это случилось, тем увереннее модель.'),
            ]} />
            <Card title="Шанс кандидата по слоям">
              <HeatTable columns={['Слой', '·Меркурий', '·Венера', '·Марс', 'остальное']} rows={LAYERS} />
            </Card>
          </> : (
            <Card title="На какие слова смотрела модель">
              <p>Выбирая «Меркурий», модель сильнее всего опиралась на слова «ближе» и «Солнцу».</p>
              <Answer>
                Какая <TokenChip heat={2}>планета</TokenChip> <TokenChip heat={4}>ближе</TokenChip> <TokenChip heat={1}>всего</TokenChip> к{' '}
                <TokenChip heat={4}>Солнцу</TokenChip>? <TokenChip heat={1}>Ближе</TokenChip> всего
              </Answer>
              <CandidateList caption={['слово', 'доля внимания']}>
                {([['·ближе', 0.34], ['·Солнцу', 0.31], ['·планета', 0.14], ['·всего', 0.06]] as [string, number][]).map(([t, p], i) => (
                  <CandidateRow key={t} rank={i + 1} label={t} share={p} scale={0.34} />
                ))}
              </CandidateList>
            </Card>
          )}
        </RunCard>
      </Thread>
    </Shell>
  );
}
