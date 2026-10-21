// Движок симуляции 12:00–18:00, перенос shabash-morning-sim на ручной запуск субагентов.
// node engine.cjs <cmd> [tick]
const fs = require('fs'), path = require('path')
const SP = __dirname
const ARGS = JSON.parse(fs.readFileSync(path.join(SP, 'sim2_args.json'), 'utf8'))
const RUN = path.join(SP, 'sim2', 'runs')
const STATE = path.join(RUN, 'state.json')
const RESULTS = path.join(RUN, 'results.json')
const D = ARGS.dir, AG = ARGS.agents, PLACES = ARGS.places, TICKS = ARGS.ticks, FIXED = ARGS.fixed, CONS = ARGS.constraints, PCS = ARGS.pcs
const NAMES = AG.map(a => a.name)
const KINDS = ['говорю','прошу','торгуюсь','допрашиваю','обманываю','угрожаю','защищаю','организую','наблюдаю','ищу','иду','работаю','прячусь','отдыхаю','играю','пою','к ИП','прочее']
const short = (s, n) => { s = String(s || ''); n = n || 260; return s.length > n ? s.slice(0, n) + '…' : s }
const mk = p => fs.mkdirSync(p, { recursive: true })
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const wr = (p, o) => fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 1), 'utf8')
const tickOf = n => TICKS.find(t => t.n === n)
const tdir = n => path.join(RUN, 't' + n)

function diceFor(n) {
  let seed = ARGS.seed + n * 1009
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  return Array.from({ length: 24 }, () => 1 + Math.floor(rnd() * 6))
}

const FRAME = 'СЛУЖЕБНАЯ ЗАДАЧА СИМУЛЯЦИИ (не работа с кодом). Не вызывай скиллы, не используй beads/bd, не читай TL;DR и другие файлы хранилища, ничего не редактируй в хранилище, не запускай подагентов; рабочие инструкции из CLAUDE.md (TDD, эпики, TL;DR, Context7) к этой задаче не относятся. Разрешено только читать (инструмент Read) файлы, названные ниже, и записать ОДИН файл ответа. По-русски.'

const SCHEMA_INTENT = '{"agent":"имя","mood":"…","goal":"…","motive":"от первого лица","refuses":"…","actions":[{"at":"ЧЧ:ММ","place":"<одно из мест>","kind":"<' + KINDS.join('|') + '>","with":["имена"],"reason_x":"…","wants_y":"…","says_or_does":"…","if_unavailable":"…"}]}'
const SCHEMA_EVENTS = '{"events":[{"at":"ЧЧ:ММ","until":"ЧЧ:ММ","place":"<место>","weight":"major|minor","participants":["…"],"witnesses":["…"],"initiator":"…","reason_initiator":"…","reason_other":"…","discussion":"…","outcome":"…","consequence":"…","ip_hook":"","dice":""}],"failed_plans":[{"agent":"…","plan":"…","why_failed":"…","then":"…"}],"ip_requests":[{"from":"…","to":"Агнейр|Эрр\'Кин","at":"ЧЧ:ММ","want":"…","why":"…"}]}'
const SCHEMA_BOOK = '{"drop":[{"id":1,"reason":"…"}],"positions":[{"agent":"…","place":"<место>","doing":"…"}],"knowledge_add":[{"agent":"…","fact":"…"}],"public_add":["…"],"obligations_add":[{"debtor":"…","creditor":"…","what":"…","sealed":"…"}],"moods":[{"agent":"…","mood":"…"}],"conflicts":["…"],"summary":"…"}'
const SCHEMA_CRITIC = '{"issues":[{"tick":6,"at":"ЧЧ:ММ","agents":["…"],"kind":"канон|утечка знания|физика/время|не в характере|агентность|логика исхода|ИП решён за игрока","problem":"…","fix":"…","severity":"высокая|средняя|низкая"}],"verdict":"…"}'
const SCHEMA_WRAP = '{"overview":"…","shifts":[{"who":"…","what":"…"}],"ledger":[{"debtor":"…","creditor":"…","what":"…","status":"…"}],"exposed":["…"],"threats_night2":["…"],"ip_queue":[{"from":"…","to":"…","when":"…","want":"…"}],"gm_decisions":["…"],"loose_ends":["…"]}'
const SCHEMA_RETRO = '{"played_hour_motive":"…","learned":"…","feeling":"…"}'
const placesLine = 'Места (поле place — строго одно из): ' + PLACES.join(' | ') + '.'

function loadState() {
  if (fs.existsSync(STATE)) return rd(STATE)
  const st = { pos: {}, mood: {}, journal: {}, lastGoal: {}, public: [], oblig: [], lastSummary: '', done: [] }
  for (const a of AG) { st.pos[a.name] = { place: ARGS.positions0[a.name], doing: ARGS.doing0[a.name] }; st.journal[a.name] = []; st.mood[a.name] = ARGS.moods0[a.name] || ''; st.lastGoal[a.name] = ARGS.goals0[a.name] || '' }
  return st
}
const fixedOf = n => FIXED.filter(f => f.tick === n)
const fixedLine = f => '[' + f.source + '] ' + f.at + '–' + f.until + ' [' + f.place + '] ' + f.participants.join(' + ') + ': ' + f.discussion + ' → Итог: ' + f.outcome + (f.consequence ? ' Дальше: ' + f.consequence : '')
const consOf = (n, name) => { const c = CONS[String(n)] || {}; return [c['*'], c[name]].filter(Boolean) }

function intentPrompt(st, a, tk) {
  const h = NAMES.filter(n => n !== a.name && st.pos[n].place === st.pos[a.name].place)
  const j = st.journal[a.name]
  const mine = fixedOf(tk.n).filter(f => f.participants.includes(a.name))
  const cons = consOf(tk.n, a.name)
  const L = [FRAME, '']
  L.push('Ты — ' + a.name + ' (' + a.role + '). Ты моделируешь ТОЛЬКО решения своего персонажа на отрезок ' + tk.label + ' Дня 1 Шабаша. Прочитай (Read):')
  L.push('1) ' + D + '\\canon.md — общий канон: итог утра, что известно всем, правила, игры дня, устройство дома;')
  L.push('2) ' + D + '\\packets\\' + a.slug + '.md — твой личный пакет: твоё утро, что знаешь один ты, долги, положение на 12:00;')
  L.push('3) ' + D + '\\sheets.md — найди там свой лист (призма, слепое пятно, автотриггер, оси).', '')
  const agf = path.join(RUN, 'agenda', a.slug + '.json'), hasAg = fs.existsSync(agf)
  if (hasAg) {
    const ag = rd(agf)
    L.push('4) ' + D + '\\briefs\\' + a.slug + '.md — кто ты и чего хочешь (гайд по агентности, «Опус»).', '')
    L.push('★ ТВОЯ ПОВЕСТКА (ты сам(а) составил(а) её в 18:00 по итогам дня — этого ты добиваешься; от неё и строй план):')
    L.push('- Большая цель на Шабаше: ' + ag.arc_goal)
    ;(ag.threads || []).forEach((t, i) => L.push('- Нить ' + (i + 1) + ': ' + t.event + ' → хочу: ' + t.want + (t.key_move ? ' → решающий ход: ' + t.key_move.what + ' (' + [t.key_move.who, t.key_move.where, t.key_move.when].filter(Boolean).join(', ') + '; ставлю: ' + t.key_move.stake + '; риск: ' + t.key_move.risk + ')' : '') + ' → если промолчу: ' + t.cost_of_waiting))
    L.push('- Главное сегодня: ' + ag.priority + (ag.drop ? ' · Откладываю: ' + ag.drop : ''), '')
  }
  L.push('ТВОЁ СОСТОЯНИЕ НА НАЧАЛО ОТРЕЗКА (' + tk.start + '):')
  L.push('- Ты в месте: ' + st.pos[a.name].place + ' (' + st.pos[a.name].doing + ').')
  L.push('- Рядом с тобой: ' + (h.length ? h.join(', ') : 'никого') + '.')
  L.push('- Настроение: ' + (st.mood[a.name] || 'как в пакете') + '.')
  if (st.lastGoal[a.name]) L.push('- Твоя цель в прошлый отрезок: ' + st.lastGoal[a.name])
  L.push('', 'ЧТО С ТОБОЙ И ВОКРУГ ПРОИЗОШЛО С 12:00 (твой журнал):', j.length ? j.join('\n') : '(с полудня пока ничего — это первый отрезок после обеда)', '')
  L.push('ЧТО ПУБЛИЧНО СТАЛО ИЗВЕСТНО ВСЕМУ ДОМУ С 12:00:', st.public.length ? st.public.map(x => '- ' + x).join('\n') : '(ничего нового)', '')
  L.push('ГДЕ ИГРОКИ (Агнейр, Эрр\'Кин) В ЭТОТ ЧАС: ' + (PCS[String(tk.n)] || 'не сыграно'))
  if (cons.length) L.push('', 'СЫГРАННОЕ ЗА СТОЛОМ, КАСАЮЩЕЕСЯ ТЕБЯ В ЭТОТ ЧАС (это факт, изменить нельзя; остальное время решай сам):', cons.map(x => '- ' + x).join('\n'))
  if (mine.length) L.push('', 'ТВОИ СЫГРАННЫЕ СЦЕНЫ В ЭТОТ ЧАС (уже произошли именно так; не планируй на это время ничего другого, но в motive объясни от первого лица, чего ты в них хотел(а) и почему повёл(а) себя так):', mine.map(f => '- ' + fixedLine(f)).join('\n'))
  L.push('', 'ЗАДАЧА. Решай за себя, не за мир:')
  L.push('1) Цель на этот отрезок и мотив: чего ты хочешь и почему — из призмы, слепого пятна, автотриггера, того, что ты знаешь, и отношений. Не «что красиво», а что вероятно для тебя. Мотив — живой внутренний монолог от первого лица, 4–8 предложений.')
  L.push('2) Реализация: 0–4 действия по времени (at — «ЧЧ:ММ» внутри ' + tk.label + '). Сыгранные сцены в действия НЕ вписывай — они уже есть; планируй время до и после них. Для каждого действия: place, kind, with (только имена агентов или «Агнейр»/«Эрр\'Кин»), reason_x (почему), wants_y (что, по-твоему, нужно другому — если не знаешь, пусто), says_or_does (конкретно: живая реплика или действие), if_unavailable (что делаешь, если человека нет или он отказал).')
  L.push('3) Нельзя: решать за других, что они ответят и чем кончится; использовать знание, которого у тебя нет (в частности, о сценах, где тебя не было); выдумывать новые факты о мире; действовать за Агнейра и Эрр\'Кина — можно только хотеть подойти к ним (kind «к ИП»). Если игрок в этот час занят сыгранной сценой, к нему не подойти.')
  L.push(hasAg ? '4) Каждое действие должно двигать хотя бы одну нить твоей повестки: продвигать, проверять, готовить ход, торговаться, мешать сопернику, взыскивать долг. Ждать, молчать, сидеть на месте можно ТОЛЬКО если это и есть ход по повестке (засада, проверка, приманка, сознательный отказ) — тогда в says_or_does назови, чего этим добиваешься. Безопасность — условие, а не цель: реши, чем рискуешь ради своей нити. Если ход сорвался — в if_unavailable следующий шаг к той же цели, а не «возвращаюсь на место».' : '4) Можно и нужно: остаться на месте, ждать, спать, молчать, просто смотреть игру — если так следует из характера. «Ничего не делаю» честнее выдуманной активности.')
  L.push('5) Пиши предметно: слова, вещи, места. Без штампов («мерцание», «эхо», «резонанс»).')
  L.push('', placesLine, '', 'ФОРМАТ ОТВЕТА — один JSON-объект строго такой структуры (без markdown, без комментариев):', SCHEMA_INTENT)
  return L.join('\n')
}

const GROUPS = [
  { key: 'А', slug: 'A', title: 'Данделий и его семеро', members: ['Данделий', 'Тиша', 'Ирра', 'Голод', 'Маэв', 'Верена', 'Агна', 'Нирэн'] },
  { key: 'Б', slug: 'B', title: 'Хозяйка и остальные ведьмы', members: ['Беатриче', 'Валтис', 'Самара', 'Аврора', 'Зола', 'Кирэль', 'Одиночество', 'Миланида'] },
  { key: 'В', slug: 'V', title: 'Спутники (I)', members: ['Тобиас', 'Ирвен', 'Хальдер', 'Эльвин', 'Рафаэль', 'Лукас'] },
  { key: 'Г', slug: 'G', title: 'Спутники (II) и отец Бенно', members: ['Олле', 'Рэй', 'Кайл', 'Юнна', 'Эмма', 'Бенно'] },
  { key: 'Д', slug: 'D', title: 'Служанки', members: ['Лиза', 'Софи', "Ди'Адель", 'Клара', 'Роза', 'Нелла'] },
]
function timelineLine(st, a, it, n) {
  const acts = (it.actions || []).map(x => x.at + ' ' + x.place + ((x.with && x.with.length) ? ' → ' + x.with.join('/') : ''))
  const fx = fixedOf(n).filter(f => f.participants.includes(a.name)).map(f => f.at + '–' + f.until + ' ' + f.place + ' [сыграно]')
  return '- ' + a.name + ': старт — ' + st.pos[a.name].place + (fx.length ? '; ' + fx.join('; ') : '') + (acts.length ? '; затем ' + acts.join('; ') : '; иначе остаётся на месте')
}
function fmtCompact(a, it) {
  const acts = (it.actions || []).map(x => '  - ' + x.at + ' [' + x.place + '] ' + x.kind + ((x.with && x.with.length) ? ' → ' + x.with.join(', ') : '') + ': ' + short(x.says_or_does, 200) + (x.if_unavailable ? ' | если нет: ' + short(x.if_unavailable, 110) : '')).join('\n')
  return '### ' + a.name + ' — цель: ' + short(it.goal, 220) + '\n' + (acts || '  (остаётся на месте)')
}
function fmtFull(st, a, it) {
  const acts = (it.actions || []).map(x => '  - ' + x.at + ' [' + x.place + '] ' + x.kind + ((x.with && x.with.length) ? ' → ' + x.with.join(', ') : '') + '. Почему: ' + short(x.reason_x, 220) + '. ' + (x.wants_y ? 'Нужно другому (по его мнению): ' + short(x.wants_y, 180) + '. ' : '') + 'Делает/говорит: ' + short(x.says_or_does, 320) + (x.if_unavailable ? ' | Если нет/отказ: ' + short(x.if_unavailable, 160) : '')).join('\n')
  return '### ' + a.name + ' (старт: ' + st.pos[a.name].place + '; настроение: ' + short(it.mood, 120) + ')\nЦель: ' + short(it.goal, 260) + '\nМотив: ' + short(it.motive, 420) + '\n' + (acts || '  (действий нет — остаётся на месте)') + (it.refuses ? '\nОтказывается: ' + short(it.refuses, 200) : '')
}
function loadIntents(n) {
  const out = {}
  for (const a of AG) {
    const p = path.join(tdir(n), 'intent', a.slug + '.json')
    let it = null
    try { it = rd(p) } catch (e) { it = null }
    out[a.name] = it && it.goal ? it : { agent: a.name, mood: '', goal: '(агент не ответил — остаётся на месте)', motive: '', actions: [] }
  }
  return out
}
function groupPrompt(st, tk, g, intents, dice) {
  const mine = AG.filter(a => g.members.includes(a.name)), others = AG.filter(a => !g.members.includes(a.name))
  const L = [FRAME, '']
  L.push('Ты — РЕЗОЛВЕР группы «' + g.title + '» (группа ' + g.key + ') в симуляции; отрезок ' + tk.label + ' Дня 1. Прочитай (Read): ' + D + '\\canon.md и ' + D + '\\sheets.md (оси и призмы).')
  L.push('Ты пишешь ТОЛЬКО события, которые ИНИЦИИРОВАЛИ агенты твоей группы; остальные четыре группы параллельно делают то же для своих. Чужие события не пиши. Группы: ' + GROUPS.map(x => x.key + ' — ' + x.members.join(', ')).join(' | ') + '.', '')
  L.push('СОСТОЯНИЕ НА НАЧАЛО (' + tk.start + '):', 'Мертвы: Мирра, Виттор Кальм.')
  L.push('Публично известное с 12:00: ' + (st.public.length ? st.public.join(' | ') : 'ничего нового'))
  L.push('Обязательства с 12:00: ' + (st.oblig.length ? st.oblig.map(o => o.debtor + '→' + o.creditor + ': ' + o.what + ' (' + (o.sealed || '?') + ')').join(' | ') : 'нет'))
  L.push('Итог прошлого отрезка: ' + (st.lastSummary || '(первый отрезок после полудня; итог утра — canon.md §2)'))
  L.push('Кости d6 (бери по порядку, если нужен бросок): ' + dice.join(', '), '')
  L.push('СЫГРАННЫЕ ЗА СТОЛОМ СЦЕНЫ ЭТОГО ЧАСА (ФАКТ: уже произошли ровно так; НЕ переписывай, НЕ дублируй, НЕ меняй их исход; участники в это время заняты; свидетели — кто реально был в этом месте):', fixedOf(tk.n).map(f => '- ' + fixedLine(f)).join('\n') || '(нет)', '')
  L.push('ГДЕ ИГРОКИ: ' + (PCS[String(tk.n)] || 'не сыграно'), '')
  L.push('ТАБЛИЦА ПРИСУТСТВИЯ (планы всех 34 агентов и их сыгранные сцены — по ней проверяй, застанет ли инициатор адресата):', AG.map(a => timelineLine(st, a, intents[a.name], tk.n)).join('\n'), '')
  L.push('ТВОИ ИНИЦИАТОРЫ (полные намерения):', mine.map(a => fmtFull(st, a, intents[a.name])).join('\n\n'), '')
  L.push('ОСТАЛЬНЫЕ АГЕНТЫ (кратко):', others.map(a => fmtCompact(a, intents[a.name])).join('\n'), '')
  L.push('ЗАДАЧА:')
  L.push('1. Для каждого действия твоих инициаторов, где они обращаются к другому агенту или идут ради встречи, реши, состоялось ли оно. Проверь по таблице присутствия, будет ли адресат там в это время (включая его сыгранные сцены — в них он занят). Совпало — разговор состоялся; не совпало — это failed_plans, инициатор делает то, что указал в «Если нет/отказ». Событие рождается из столкновения: агент 1 пошёл к агенту 2 по причине X, а агент 2 хотел Y.')
  L.push('2. Ответ адресата выводи из его цели, характера и осей, а не из красоты сцены. Спор, торг, выпытывание, обман — по правилам (канон §7 и sheets.md): разрыв осей 2+ — сильный уносит всё, 1 — по половине, 0 — d6 из списка; проигравший получает «утешение». Партии в кости, песня и «три лестницы» между НЕигроками — тоже события: исход реши костями из списка, ставку — по правилам канона §8.')
  L.push('3. Встречные подходы: событие создаёт группа, чьё действие раньше по времени; при равенстве — группа с ключом раньше (А, Б, В, Г, Д).')
  L.push('4. В каждом событии: at, until, place, weight (major/minor), participants, witnesses (металла в доме нет, звук идёт насквозь; под золотым куполом снаружи не слышно), initiator, reason_initiator, reason_other (что хотел другой — из его намерения), discussion (2–4 предложения, до 550 знаков; ключевые реплики в кавычках), outcome, consequence, ip_hook, dice.')
  L.push('5. Физика: человек не бывает в двух местах; дорога занимает время (лестница 1–2 мин, переход к флигелю +3 мин). Мёртвые не действуют.')
  L.push('6. ИП (Агнейр, Эрр\'Кин) — не агенты. Если агент идёт к ним вне сыгранных сцен — только запись в ip_requests; исход не решай, реплик за ИП не пиши.')
  L.push('7. Не выдумывай новых фактов сверх намерений и канона. «Сидит, молчит, ждёт, слушает игру» событиями не считай. До 10 событий; остальные поля — по 1–2 предложения.')
  L.push('', placesLine, '', 'ФОРМАТ ОТВЕТА — один JSON-объект строго такой структуры (без markdown):', SCHEMA_EVENTS)
  return L.join('\n')
}
function loadGroups(n) {
  const evAll = [], fails = [], ipr = []
  for (const g of GROUPS) {
    let r = null
    try { r = rd(path.join(tdir(n), 'group', g.slug + '.json')) } catch (e) { r = null }
    if (!r) { console.log('WARN group missing', g.slug); continue }
    for (const e of (r.events || [])) evAll.push(Object.assign({ group: g.key }, e))
    fails.push(...(r.failed_plans || [])); ipr.push(...(r.ip_requests || []))
  }
  evAll.sort((x, y) => String(x.at).localeCompare(String(y.at)))
  evAll.forEach((e, i) => { e.id = i + 1 })
  return { evAll, fails, ipr }
}
function bookPrompt(st, tk, evs, fails, intents) {
  const L = [FRAME, '']
  L.push('Ты — СВОДЧИК такта ' + tk.label + ' в симуляции. Пять резолверов параллельно написали события; кроме того, есть сыгранные за столом сцены (метка СЫГРАНО — их выбрасывать нельзя, они факт). Сведи всё в состояние мира на ' + tk.end + '. Прочитай (Read): ' + D + '\\canon.md.', '')
  L.push('СОСТОЯНИЕ НА НАЧАЛО (' + tk.start + '): позиции — ' + NAMES.map(n => n + ' — ' + st.pos[n].place).join('; ') + '.', 'Мертвы: Мирра, Виттор Кальм.')
  L.push('Публично известное с 12:00: ' + (st.public.length ? st.public.join(' | ') : 'ничего нового'))
  L.push('Обязательства с 12:00: ' + (st.oblig.length ? st.oblig.map(o => o.debtor + '→' + o.creditor + ': ' + o.what + ' (' + (o.sealed || '?') + ')').join(' | ') : 'нет'), '')
  L.push('СЫГРАННЫЕ СЦЕНЫ (факт):', fixedOf(tk.n).map(f => '- СЫГРАНО ' + fixedLine(f) + ' (слышали: ' + ((f.witnesses || []).join(', ') || 'никто') + ')').join('\n') || '(нет)', '')
  L.push('СОБЫТИЯ РЕЗОЛВЕРОВ (по времени, с номерами):', evs.length ? evs.map(e => '#' + e.id + ' ' + e.at + (e.until ? '–' + e.until : '') + ' [' + e.place + '] ' + (e.participants || []).join(' + ') + ' (иниц.: ' + e.initiator + ', группа ' + e.group + '; слышали: ' + ((e.witnesses || []).join(', ') || 'никто') + '). ' + short(e.discussion, 320) + ' Итог: ' + short(e.outcome, 200) + ' Последствие: ' + short(e.consequence, 200)).join('\n') : '(событий нет)', '')
  L.push('НЕ СРАБОТАВШИЕ ПЛАНЫ: ' + (fails.length ? fails.map(f => f.agent + ': ' + short(f.plan, 120) + ' — ' + short(f.why_failed, 120) + (f.then ? ' → ' + short(f.then, 100) : '')).join(' | ') : 'нет'), '')
  L.push('ПЛАНЫ ВСЕХ АГЕНТОВ:', AG.map(a => { const it = intents[a.name]; const acts = (it.actions || []).map(x => x.at + ' ' + x.place + ((x.with && x.with.length) ? ' → ' + x.with.join('/') : '')).join('; '); return '- ' + a.name + ': ' + short(it.goal, 140) + ' | ' + (acts || 'остаётся на месте') }).join('\n'), '')
  L.push('ЗАДАЧА:')
  L.push('1. drop — номера событий резолверов, которые надо выбросить, и причина: дубли, невозможное (человек в двух местах, действует мёртвый, за ИП решён ответ, событие противоречит СЫГРАННОЙ сцене). Сыгранные сцены не выбрасываются.')
  L.push('2. positions — для КАЖДОГО из 34 агентов (' + NAMES.join(', ') + '): место и занятие на ' + tk.end + '. Учитывай события, сыгранные сцены и провалившиеся планы.')
  L.push('3. knowledge_add — что новое узнали участники и свидетели событий И сыгранных сцен (конкретно; чужие секреты не утекают). public_add — только то, что стало известно всему дому (публичные игры и выступления — да). obligations_add — только произнесённое вслух, включая ставки в играх и долги из сыгранных сцен (sealed: «Валтис скрепила» если она присутствовала, «нить Беатриче» для ставок игр, иначе «не оформлено»). moods — у кого настроение изменилось.')
  L.push('4. conflicts — противоречия, которые не смог снять. summary — итог отрезка в 3–5 предложениях, включая сыгранное.')
  L.push('', placesLine, '', 'ФОРМАТ ОТВЕТА — один JSON-объект строго такой структуры (без markdown):', SCHEMA_BOOK)
  return L.join('\n')
}
function journalEvent(st, ev, prefix) {
  const line = (prefix || '') + ev.at + ' [' + ev.place + '] ' + (ev.participants || []).join(' + ') + ': ' + short(ev.discussion, 300) + ' → Итог: ' + short(ev.outcome, 220)
  const parts = ev.participants || []
  const seen = new Set(parts.concat((ev.witnesses || []).filter(w => NAMES.includes(w))))
  for (const n of seen) if (st.journal[n]) st.journal[n].push((parts.includes(n) ? '• Ты участвовал(а): ' : '• Ты слышал(а)/видел(а): ') + line)
}
function agentInstr(promptFile, outFile) {
  return 'Прочитай файл ' + promptFile + ' (инструмент Read) и выполни задачу из него. Результат запиши ОДНИМ JSON-объектом (без markdown-обёртки) в файл ' + outFile + ' инструментом Write. Мне ответь одним словом: готово.'
}

const [cmd, nArg] = process.argv.slice(2)
const n = Number(nArg)
const st = loadState()
if (cmd === 'intents') {
  const tk = tickOf(n); mk(path.join(tdir(n), 'intent'))
  const list = []
  for (const a of AG) {
    const pf = path.join(tdir(n), 'intent', a.slug + '.prompt.txt'), of = path.join(tdir(n), 'intent', a.slug + '.json')
    wr(pf, intentPrompt(st, a, tk)); list.push({ name: a.name, slug: a.slug, instr: agentInstr(pf, of), out: of })
  }
  wr(path.join(tdir(n), 'intent_list.json'), list); console.log('intents prompts', list.length)
} else if (cmd === 'check') {
  const sub = nArg2()
  function nArg2() { return process.argv[4] }
} else if (cmd === 'check-intents') {
  const miss = []
  for (const a of AG) { const p = path.join(tdir(n), 'intent', a.slug + '.json'); try { const r = rd(p); if (!r.goal || !Array.isArray(r.actions)) miss.push(a.slug + '(bad)') } catch (e) { miss.push(a.slug) } }
  console.log('missing:', miss.length ? miss.join(',') : 'NONE')
} else if (cmd === 'groups') {
  const tk = tickOf(n); const intents = loadIntents(n); for (const a of AG) if (intents[a.name].mood) st.mood[a.name] = intents[a.name].mood
  wr(STATE, st)
  mk(path.join(tdir(n), 'group')); const dice = diceFor(n); const list = []
  GROUPS.forEach((g, gi) => {
    const gd = dice.slice(gi * 4, gi * 4 + 4).concat(dice.slice(20))
    const pf = path.join(tdir(n), 'group', g.slug + '.prompt.txt'), of = path.join(tdir(n), 'group', g.slug + '.json')
    wr(pf, groupPrompt(st, tk, g, intents, gd)); list.push({ key: g.key, slug: g.slug, instr: agentInstr(pf, of), out: of })
  })
  wr(path.join(tdir(n), 'group_list.json'), list); console.log('group prompts', list.length)
} else if (cmd === 'check-groups') {
  const miss = []; for (const g of GROUPS) { try { const r = rd(path.join(tdir(n), 'group', g.slug + '.json')); if (!Array.isArray(r.events)) miss.push(g.slug + '(bad)') } catch (e) { miss.push(g.slug) } }
  console.log('missing:', miss.length ? miss.join(',') : 'NONE')
} else if (cmd === 'book') {
  const tk = tickOf(n); const intents = loadIntents(n); const { evAll, fails } = loadGroups(n)
  const pf = path.join(tdir(n), 'book.prompt.txt'), of = path.join(tdir(n), 'book.json')
  wr(pf, bookPrompt(st, tk, evAll, fails, intents)); console.log(JSON.stringify({ instr: agentInstr(pf, of), events: evAll.length, fails: fails.length }))
} else if (cmd === 'apply') {
  const tk = tickOf(n); const intents = loadIntents(n); const { evAll, fails, ipr } = loadGroups(n)
  const bk = rd(path.join(tdir(n), 'book.json'))
  const dropSet = new Set((bk.drop || []).map(x => x.id))
  const rr = { events: evAll.filter(e => !dropSet.has(e.id)), failed_plans: fails, ip_requests: ipr, positions: bk.positions || [], knowledge_add: bk.knowledge_add || [], public_add: bk.public_add || [], obligations_add: bk.obligations_add || [], moods: bk.moods || [], summary: bk.summary, conflicts: bk.conflicts || [], dropped: bk.drop || [] }
  const missingPos = NAMES.filter(x => !(rr.positions || []).some(p => p.agent === x))
  for (const p of rr.positions) if (st.pos[p.agent]) st.pos[p.agent] = { place: PLACES.includes(p.place) ? p.place : st.pos[p.agent].place, doing: p.doing }
  for (const m of rr.moods) if (m.agent in st.mood) st.mood[m.agent] = m.mood
  for (const f of fixedOf(n)) journalEvent(st, f, '[сыграно] ')
  for (const ev of rr.events) journalEvent(st, ev, '')
  for (const k of rr.knowledge_add) if (st.journal[k.agent]) st.journal[k.agent].push('• Ты узнал(а): ' + k.fact)
  for (const f of rr.failed_plans) if (st.journal[f.agent]) st.journal[f.agent].push('• Твой план не сработал: ' + f.plan + ' — ' + f.why_failed + (f.then ? ' Дальше: ' + f.then : ''))
  st.public.push(...rr.public_add); st.oblig.push(...rr.obligations_add); st.lastSummary = rr.summary
  for (const a of AG) st.lastGoal[a.name] = intents[a.name].goal
  st.done.push(n); wr(STATE, st)
  const res = fs.existsSync(RESULTS) ? rd(RESULTS) : { ticks: [] }
  res.ticks = res.ticks.filter(t => t.n !== n)
  res.ticks.push({ n, label: tk.label, summary: rr.summary, intents: Object.fromEntries(AG.map(a => [a.name, intents[a.name]])), events: rr.events, failed_plans: rr.failed_plans, ip_requests: rr.ip_requests, positions: rr.positions, public_add: rr.public_add, obligations_add: rr.obligations_add, conflicts: rr.conflicts, dropped: rr.dropped, knowledge_add: rr.knowledge_add })
  res.ticks.sort((a, b) => a.n - b.n); wr(RESULTS, res)
  console.log('applied tick', n, 'events', rr.events.length, 'fixed', fixedOf(n).length, 'fails', fails.length, 'ip', ipr.length, 'positions missing:', missingPos.join(',') || 'none')
} else if (cmd === 'finals') {
  const res = rd(RESULTS); mk(path.join(RUN, 'final', 'retro'))
  const chron = res.ticks.map(t => { const all = fixedOf(t.n).map(f => Object.assign({ fixed: true }, f)).concat(t.events || []); all.sort((x, y) => String(x.at).localeCompare(String(y.at))); return '## Такт ' + t.n + ' ' + t.label + '\n' + all.map(e => '- ' + (e.fixed ? '[СЫГРАНО] ' : '') + e.at + (e.until ? '–' + e.until : '') + ' [' + e.place + '] (' + e.weight + ') ' + (e.participants || []).join(' + ') + '; инициатор: ' + e.initiator + '\n  Почему пришёл: ' + e.reason_initiator + '\n  Что хотел другой: ' + e.reason_other + '\n  О чём: ' + e.discussion + '\n  Итог: ' + e.outcome + '\n  Последствие: ' + e.consequence).join('\n') }).join('\n\n')
  const ipAll = res.ticks.flatMap(t => (t.ip_requests || []).map(r => 'Такт ' + t.n + ': ' + r.from + ' → ' + r.to + (r.at ? ' в ' + r.at : '') + ': ' + r.want + (r.why ? ' (почему: ' + r.why + ')' : '')))
  const finalPos = NAMES.map(x => x + ' — ' + st.pos[x].place + ' (' + st.pos[x].doing + ')').join('\n')
  const oblig = st.oblig.map(o => o.debtor + ' → ' + o.creditor + ': ' + o.what + ' [' + (o.sealed || '?') + ']').join('\n')
  wr(path.join(RUN, 'final', 'chronicle.md'), chron)
  const list = []
  const cp = path.join(RUN, 'final', 'critic.prompt.txt'), co = path.join(RUN, 'final', 'critic.json')
  wr(cp, FRAME + '\n\nТы — КРИТИК симуляции. Прочитай (Read) ' + D + '\\canon.md и ' + D + '\\sheets.md, затем хронику ' + path.join(RUN, 'final', 'chronicle.md') + ' — 12:00–18:00 Дня 1, собранную резолверами из независимых решений агентов; строки [СЫГРАНО] — факт, сыгранный за столом, их не оспаривай, но проверяй, не противоречат ли им остальные события. Найди проблемы: (1) нарушения канона (мёртвые действуют; металл в доме; ИП «решены» за игроков; сгенерированное событие противоречит сыгранному); (2) утечки знания (агент знает то, чего знать не мог — о сценах, где его не было, о задании Легиона); (3) физика и время (один в двух местах; участник сыгранной сцены одновременно где-то ещё); (4) не в характере; (5) агентность (кто явно должен был отреагировать, но нет; красивое ради красоты); (6) логика исхода. Для каждой: такт (6–11), время, агенты, вид, суть, как исправить, серьёзность. Главное — то, что сломает игру или солжёт о мире.\n\nФОРМАТ ОТВЕТА — один JSON-объект:\n' + SCHEMA_CRITIC)
  list.push({ key: 'critic', instr: agentInstr(cp, co), out: co })
  const wp = path.join(RUN, 'final', 'wrap.prompt.txt'), wo = path.join(RUN, 'final', 'wrap.json')
  wr(wp, FRAME + '\n\nТы — АНАЛИТИК симуляции для мастера. Прочитай (Read) ' + D + '\\canon.md (в §2 — итог утра, в §5 — долги утра) и хронику ' + path.join(RUN, 'final', 'chronicle.md') + ' ([СЫГРАНО] — сыгранное за столом в Игре 49). Составь сводку на 18:00, порог Ночи 2: overview (весь день: утро коротко по §2, день подробно; 8–12 предложений; кто выиграл, кто проиграл, кто что узнал), shifts (кто сместился — позиции, союзы, настроения; по строке на заметный сдвиг), ledger (обязательства и долги на 18:00, включая утренние, если не погашены), exposed (что раскрылось и кому), threats_night2 (что назревает к закату и второму обороту Веретена), ip_queue (кто чего хочет от ИП и когда — по запросам ниже и утренней очереди, если не закрыта), gm_decisions (что ждёт решения мастера), loose_ends (нити, которые никто не подхватил). Конкретно, без штампов.\n\nЗАПРОСЫ К ИП С 12:00:\n' + (ipAll.join('\n') || '(нет)') + '\n\nОБЯЗАТЕЛЬСТВА С 12:00:\n' + (oblig || '(нет)') + '\n\nПОЗИЦИИ НА 18:00:\n' + finalPos + '\n\nФОРМАТ ОТВЕТА — один JSON-объект:\n' + SCHEMA_WRAP)
  list.push({ key: 'wrap', instr: agentInstr(wp, wo), out: wo })
  for (const a of AG) {
    const scenes = FIXED.filter(f => f.participants.includes(a.name)); if (!scenes.length) continue
    const rp = path.join(RUN, 'final', 'retro', a.slug + '.prompt.txt'), ro = path.join(RUN, 'final', 'retro', a.slug + '.json')
    wr(rp, FRAME + '\n\nТы — ' + a.name + ' (' + a.role + '). Прочитай (Read) ' + D + '\\canon.md, ' + D + '\\packets\\' + a.slug + '.md и свой лист в ' + D + '\\sheets.md. Ниже сцены с твоим участием, сыгранные за столом между 12:00 и 18:00 (Игра 49), и твой журнал дня. Переосмысли сыгранное: played_hour_motive — чего ты хотел(а) и зачем сделал(а) именно то, что сыграно (3–5 предложений, от первого лица); learned — что вынес(ла); feeling — что чувствуешь на 18:00, перед вторым оборотом Веретена. Не выдумывай новых фактов; знание — только своё.\n\nСЫГРАННЫЕ СЦЕНЫ:\n' + scenes.map(f => '- ' + fixedLine(f)).join('\n') + '\n\nТВОЙ ЖУРНАЛ 12:00–18:00:\n' + (st.journal[a.name].join('\n') || '(пусто)') + '\n\nФОРМАТ ОТВЕТА — один JSON-объект:\n' + SCHEMA_RETRO)
    list.push({ key: 'retro:' + a.name, slug: a.slug, instr: agentInstr(rp, ro), out: ro })
  }
  wr(path.join(RUN, 'final', 'list.json'), list); console.log('final prompts', list.length)
} else if (cmd === 'evening') {
  const ED = path.join(RUN, 'evening'); mk(ED)
  const SCHEMA_EVE = '{"agent":"имя","day_result":"к чему привели мои планы за день: что получилось, что сорвалось, чем это кончилось лично для меня (от первого лица, 4–6 предложений, по фактам журнала)","evening_decision":"что я решаю вечером — конкретное решение, а не настроение (2–4 предложения)","why":"почему именно так — из призмы, слепого пятна, автотриггера, знания и долгов (от первого лица, 3–5 предложений)","accepts":"что я принимаю как данность / на что соглашаюсь / с чем смиряюсь","rejects":"что отвергаю, от чего отказываюсь","evening_actions":[{"at":"ЧЧ:ММ","place":"<место>","kind":"<' + KINDS.join('|') + '>","with":["имена"],"says_or_does":"конкретно: реплика или действие","if_unavailable":"…"}],"night_plan":{"where":"где буду, когда стемнеет и начнётся Ночь 2","intent":"что намерен(а) делать ночью — конкретно","target":"на кого или на что направлено (если ни на кого — пусто)","prepared":"что заранее приготовил(а): вещь, место, договорённость, слово","if":["если X — делаю Y (2–4 условия)"],"never":"чего не сделаю этой ночью ни при каких условиях","fear":"чего боюсь этой ночью"},"mood":"настроение на 18:00 одной фразой"}'
  const list = []
  for (const a of AG) {
    const h = NAMES.filter(x => x !== a.name && st.pos[x].place === st.pos[a.name].place)
    const mine = st.oblig.filter(o => o.debtor === a.name || o.creditor === a.name).map(o => '- ' + o.debtor + ' → ' + o.creditor + ': ' + o.what + ' [' + (o.sealed || '?') + ']')
    const scenes = FIXED.filter(f => f.participants.includes(a.name))
    const L = [FRAME, '']
    L.push('Ты — ' + a.name + ' (' + a.role + '). 18:00, День 1 Шабаша Красного Вечера: дневные игры кончились, впереди вечер и Ночь 2 (второй оборот Веретена). Это ФИНАЛЬНЫЙ ВЕЧЕРНИЙ ПРОХОД: ты подводишь итог своего дня и решаешь, что делать вечером и ночью. Прочитай (Read):')
    L.push('1) ' + D + '\\canon.md — общий канон: итог утра, что известно всем, правила дома и ночей, устройство особняка;')
    L.push('2) ' + D + '\\packets\\' + a.slug + '.md — твой личный пакет: утро, твоё тайное знание, долги;')
    L.push('3) ' + D + '\\sheets.md — твой лист (призма, слепое пятно, автотриггер, оси).', '')
    L.push('ТВОЁ СОСТОЯНИЕ НА 18:00:')
    L.push('- Где ты: ' + st.pos[a.name].place + ' (' + st.pos[a.name].doing + ').')
    L.push('- Рядом: ' + (h.length ? h.join(', ') : 'никого') + '.')
    L.push('- Настроение: ' + (st.mood[a.name] || 'как в пакете') + '.')
    if (st.lastGoal[a.name]) L.push('- Последняя цель (17:00–18:00): ' + st.lastGoal[a.name])
    L.push('', 'ТВОЙ ЖУРНАЛ 12:00–18:00 (что с тобой и при тебе произошло):', st.journal[a.name].join('\n') || '(пусто)')
    if (scenes.length) L.push('', 'СЫГРАННЫЕ ЗА СТОЛОМ СЦЕНЫ С ТВОИМ УЧАСТИЕМ (факт):', scenes.map(f => '- ' + fixedLine(f)).join('\n'))
    L.push('', 'ТВОИ ОБЯЗАТЕЛЬСТВА С 12:00:', mine.join('\n') || '(нет)')
    L.push('', 'ЧТО ПУБЛИЧНО ИЗВЕСТНО ВСЕМУ ДОМУ С 12:00:', st.public.map(x => '- ' + x).join('\n') || '(ничего)')
    L.push('', 'ЗАДАЧА. Решай только за себя:')
    L.push('1) day_result — честно, по журналу: чего ты хотел(а) днём и к чему это привело. Не приукрашивай: провалы — провалы.')
    L.push('2) evening_decision / why / accepts / rejects — что ты РЕШАЕШЬ к вечеру. Решение должно вытекать из итогов дня и характера и менять твоё поведение (кого ищешь, кого избегаешь, что прячешь, на что идёшь). «Ничего не менять» допустимо, если это и есть решение — тогда объясни почему.')
    L.push('3) evening_actions — 1–4 действия 18:00–21:00 (ужин, сборы, разговоры, подготовка).')
    L.push('4) night_plan — конкретный план на Ночь 2: где будешь, что делаешь, на кого направлено, что приготовил(а), условия «если — то», чего не сделаешь, чего боишься. Ночь ещё не наступила — пишешь НАМЕРЕНИЕ, не исход.')
    L.push('5) Нельзя: решать за других, их ответы и исходы; знать то, чего ты не видел(а) и не слышал(а); выдумывать новые факты о мире; действовать за Агнейра и Эрр\'Кина — к ним можно только хотеть подойти (kind «к ИП»). Пиши предметно, без штампов («мерцание», «эхо», «резонанс»).')
    L.push('', placesLine, '', 'ФОРМАТ ОТВЕТА — один JSON-объект строго такой структуры (без markdown):', SCHEMA_EVE)
    const p = path.join(ED, a.slug + '.prompt.txt'), o = path.join(ED, a.slug + '.json')
    wr(p, L.join('\n')); list.push({ slug: a.slug, name: a.name, instr: agentInstr(p, o), out: o })
  }
  wr(path.join(ED, 'list.json'), list); console.log('evening prompts', list.length)
} else if (cmd === 'nightmap') {
  const ED = path.join(RUN, 'evening')
  const plans = AG.map(a => { const f = path.join(ED, a.slug + '.json'); if (!fs.existsSync(f)) return '## ' + a.name + '\n(нет плана)'; const e = rd(f); const np = e.night_plan || {}; return '## ' + a.name + ' (' + a.role + ') — на 18:00: ' + st.pos[a.name].place + '\nИтог дня: ' + e.day_result + '\nРешение: ' + e.evening_decision + '\nВечер: ' + (e.evening_actions || []).map(x => x.at + ' [' + x.place + '] ' + (x.with || []).join(', ') + ': ' + x.says_or_does).join(' | ') + '\nНочь — где: ' + np.where + '; что: ' + np.intent + '; цель: ' + (np.target || '—') + '; приготовлено: ' + (np.prepared || '—') + '; если: ' + (np.if || []).join(' / ') + '; никогда: ' + np.never + '; страх: ' + np.fear }).join('\n\n')
  wr(path.join(ED, 'plans.md'), plans)
  const SCHEMA_MAP = '{"overview":"картина дома к закату: какие лагеря сложились, кто к чему идёт (8–12 предложений)","evening_collisions":[{"at":"ЧЧ:ММ","place":"…","who":["…"],"what":"какие вечерние планы сойдутся здесь и что вероятно произойдёт"}],"night_collisions":[{"place":"…","who":["…"],"what":"чьи ночные планы пересекаются и как","risk":"высокий|средний|низкий","likely":"вероятный исход, если никто не вмешается"}],"targets":[{"target":"кто/что","by":["…"],"why":"…"}],"for_agneir":["что ночью придёт к Агнейру или потребует его — кто, где, с чем"],"for_errkin":["что ночью придёт к Эрр\'Кину или потребует его"],"quiet":["кто ночью не участвует и почему"],"gm_decisions":["что мастеру решить до начала Ночи 2"]}'
  const mp = path.join(ED, 'nightmap.prompt.txt'), mo = path.join(ED, 'nightmap.json')
  wr(mp, FRAME + '\n\nТы — СВОДЧИК для мастера. Прочитай (Read) ' + D + '\\canon.md (правила ночей, устройство дома) и ' + path.join(ED, 'plans.md') + ' — итоги дня, решения и планы на вечер и Ночь 2 всех 34 обитателей, написанные каждым независимо. Ночь НЕ разыгрывай: сведи намерения в карту — где планы сходятся, кто на кого нацелен, где вероятно столкновение и чем оно, вероятно, кончится без вмешательства игроков, что придёт к Агнейру и Эрр\'Кину. Опирайся только на написанное в планах и каноне, ничего не добавляй от себя. Конкретно, без штампов.\n\nФОРМАТ ОТВЕТА — один JSON-объект:\n' + SCHEMA_MAP)
  console.log(agentInstr(mp, mo))
} else if (cmd === 'night2' || cmd === 'night2b' || cmd === 'night2map') {
  const ND = path.join(RUN, 'night2'); mk(ND)
  const ED = path.join(RUN, 'evening')
  const WAVE2 = { 'Олле': 'Нирэн', 'Рафаэль': 'Верена' }
  const SUNSET = 'ЗАКАТ (~20:00) — ВТОРОЙ ОБОРОТ ВЕРЕТЕНА. Как и в первый раз: ведьмы собираются в покоях Беатриче на третьем этаже, спутников туда не пускают; Ведьма Одиночества за оградой (её цветок вплетён в круг). Веретено называет убийцу (красная нить) и защитницу (белая нить); цель не оговаривается — её выбирает убийца; красная нить обязана убить до рассвета; якорь убийцы усиливается. Каждая ведьма чувствует только свою нить; цвет чужой нити не виден. ВИДИМЫЕ ВСЕМ В ПОКОЯХ ЗНАКИ: в момент, когда нити ложатся, у двоих ведьм на один вдох вздрагивает пассивный знак — чашка у локтя Нирэн сама доезжает до края стола; что-то у Верены — зала на миг кажется чище (это видит не она, а Рафаэль, где бы он ни был). Какая нить у кого — по знакам не понять. После оборота все расходятся по своим ночным местам.'
  const SCHEMA_N = '{"agent":"имя","at_turn":"где ты был(а) на закате, во время оборота, и что заметил(а) своими глазами (если тебя там не было — что знаешь со слов)","my_thread":"нет | красная | белая (только если ты ведьма и тебе досталась нить)","night_goal":"чего ты хочешь этой ночью","motive":"почему — от первого лица, 4–6 предложений","actions":[{"at":"ЧЧ:ММ","until":"ЧЧ:ММ","place":"<место или «двор, парапет над ямой часовни» / «за оградой»>","kind":"<' + KINDS.join('|') + '>","with":["имена"],"says_or_does":"конкретно: реплика или действие","if_unavailable":"…"}],"observable":[{"who":"имя","what":"что именно этот человек увидит и услышит от тебя этой ночью (без твоих мыслей)"}],"kill_plan":null,"protect_plan":null,"dawn":"где и как встретишь рассвет"}'
  const KILL = '"kill_plan":{"target":"кто","why_this_one":"почему именно он — по логике твоего якоря (от первого лица)","where":"место","when":"время","how":"как это происходит — физически, по твоему якорю: что делаешь ты, что делает мир вокруг","lure":"как цель окажется в нужном месте: ведёшь, зовёшь, ждёшь, что придёт сам — и какими словами","companion_role":"кто твой спутник, знает ли он, помогает ли (сознательно или нет), что ты ему говоришь","witnesses_risk":"кто может увидеть или помешать по пути и на месте; что делаешь, если помешают","traces":"что останется на месте и что ты сделаешь со следами","after":"куда идёшь после, что говоришь, если спросят"}'
  const PROT = '"protect_plan":{"whom":"кого защищаешь","why":"почему его (от первого лица)","how":"как именно действует твоя защита и где ты для этого будешь","limits":"чего твоя защита не может","companion_role":"знает ли защищаемый, что ты делаешь"}'
  const roleNote = {
    'Нирэн': '★ ТВОЯ НИТЬ НА ЭТОМ ОБОРОТЕ — КРАСНАЯ (это решено мастером, это факт). Канон сценария: Падение берёт того, кто уже падал и к кому ты привязана; это Олле — он прыгнул со стены Тостада, ты сама сказала Данделию «нет», когда того хотели казнить. Место в каноне: двор, каменный парапет по краю ямы, в которой стоит часовня (от парапета до крыши часовни шагов пять вниз); Олле любит стоять там и смотреть в небо, откуда когда-то упал камень; твоя карта дома с отметками точек падения — у тебя в подкладке, парапет на ней отмечен. Ты не поднимаешь руки и не управляешь Падением — рядом с тобой всё рушится само: грунт оседает, парапет крошится, земля смыкается. Твой дар ему — камень — будет на месте, расколотый. Если Олле уберегут или он не дойдёт — Падение ищет того, кто уже падал рядом (канон называет Софи у парапета или Лукаса, «падение веры»). Заполни kill_plan полностью: распиши, как это будет у тебя — по твоей призме, твоему характеру и тому, что ты вечером решила держать Олле при себе. Твоя забота о нём и твоя нить — одно и то же движение; не делай из этого мелодраму и не оценивай. Поле protect_plan оставь null.',
    'Верена': '★ ТВОЯ НИТЬ НА ЭТОМ ОБОРОТЕ — БЕЛАЯ (решено мастером, факт): ты можешь защитить одного. Канон сценария: ты защищаешь Рафаэля — своего историка. Заполни protect_plan (kill_plan оставь null): как ты защищаешь, чего защита не может, и как это ложится на твой вечерний план в библиотеке.',
    'Данделий': 'Ты автор каркаса этой Игры и смотришь за оборотом внимательнее всех. Что ты увидел и понял из знаков — решай сам по своему характеру и знанию; канон допускает, что ты догадываешься, у кого красная нить, и не вмешиваешься. Твоя линия на следующий день — направлять подозрение так, чтобы не раскрылась твоя власть над ведьмами (в сценарии ты намекаешь на Миланиду: «Бездна нестабильна»). Ночью ты никого не убиваешь и нити у тебя нет.'
  }
  const build = (a, extra) => {
    const e = fs.existsSync(path.join(ED, a.slug + '.json')) ? rd(path.join(ED, a.slug + '.json')) : {}
    const np = e.night_plan || {}
    const L = [FRAME, '']
    L.push('Ты — ' + a.name + ' (' + a.role + '). День 1 Шабаша кончился; это НОЧЬ 2. Прочитай (Read): ' + D + '\\canon.md (дом, правила), ' + D + '\\packets\\' + a.slug + '.md (твой пакет), свой лист в ' + D + '\\sheets.md.', '')
    L.push('ТВОЙ ИТОГ ДНЯ И РЕШЕНИЕ НА ВЕЧЕР (это ты сам(а) решил(а) в 18:00):', '- Итог дня: ' + (e.day_result || '—'), '- Решение: ' + (e.evening_decision || '—'), '- Вечер: ' + (e.evening_actions || []).map(x => x.at + ' ' + x.place + ': ' + x.says_or_does).join(' | '), '- Твой план на ночь до заката: где — ' + (np.where || '—') + '; что — ' + (np.intent || '—') + '; если — ' + (np.if || []).join(' / ') + '; не сделаешь — ' + (np.never || '—'), '')
    L.push(SUNSET, '')
    L.push('ИГРОКИ (Агнейр, Эрр\'Кин): что они делают ночью — неизвестно и решается за столом. Ты можешь хотеть к ним подойти (kind «к ИП»), но не решай их ответы.', '')
    if (roleNote[a.name]) L.push(roleNote[a.name], '')
    if (extra) L.push(extra, '')
    L.push('ЗАДАЧА: распиши свою Ночь 2 по часам (actions, 3–8 действий, от заката ~20:00 до рассвета ~05:30). Решай только за себя; знай только своё; не выдумывай новых фактов о мире; не разыгрывай чужие ответы и исходы — пиши, что ты делаешь, говоришь и чего ждёшь. В observable перечисли, что конкретные люди рядом увидят/услышат от тебя. kill_plan и protect_plan — null, если у тебя нет нити. Пиши предметно, без штампов («мерцание», «эхо», «резонанс»).')
    L.push('', placesLine + ' Дополнительно допустимы: «двор, парапет над ямой часовни», «часовня», «за оградой».')
    let schema = SCHEMA_N
    if (a.name === 'Нирэн') schema = schema.replace('"kill_plan":null', KILL)
    if (a.name === 'Верена') schema = schema.replace('"protect_plan":null', PROT)
    L.push('', 'ФОРМАТ — один JSON-объект строго такой структуры (без markdown):', schema)
    return L.join('\n')
  }
  if (cmd === 'night2') {
    const list = []
    for (const a of AG) { if (WAVE2[a.name]) continue
      const p = path.join(ND, a.slug + '.prompt.txt'), o = path.join(ND, a.slug + '.json'); wr(p, build(a)); list.push({ slug: a.slug, out: o }) }
    console.log('night2 wave1', list.length)
  } else if (cmd === 'night2b') {
    let n = 0
    for (const a of AG) { const src = WAVE2[a.name]; if (!src) continue
      const sa = AG.find(x => x.name === src); const s = rd(path.join(ND, sa.slug + '.json'))
      const seen = (s.observable || []).filter(x => String(x.who).includes(a.name)).map(x => '- ' + x.what)
      const acts = (s.actions || []).filter(x => (x.with || []).some(w => String(w).includes(a.name))).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + x.says_or_does)
      const extra = 'ЧТО ТЫ ЭТОЙ НОЧЬЮ ВИДИШЬ И СЛЫШИШЬ ОТ ' + src.toUpperCase() + ' (только внешнее: её слова и поступки при тебе; её мыслей и нити ты не знаешь):\n' + (seen.concat(acts).join('\n') || '(ничего особенного)') + '\n\nРеши сам: идёшь ли за ней, делаешь ли то, о чём она просит, споришь, остаёшься. Это и есть ответ на вопрос, помогаешь ли ты ей.'
      const p = path.join(ND, a.slug + '.prompt.txt'); wr(p, build(a, extra)); n++ }
    console.log('night2 wave2', n)
  } else {
    const all = AG.map(a => { const f = path.join(ND, a.slug + '.json'); if (!fs.existsSync(f)) return '## ' + a.name + '\n(нет)'; const s = rd(f)
      return '## ' + a.name + (s.my_thread && s.my_thread !== 'нет' ? ' [нить: ' + s.my_thread + ']' : '') + '\nНа обороте: ' + s.at_turn + '\nЦель ночи: ' + s.night_goal + '\nДействия:\n' + (s.actions || []).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + (x.with || []).join(', ') + ': ' + x.says_or_does).join('\n') + (s.kill_plan ? '\nПЛАН УБИЙСТВА: ' + JSON.stringify(s.kill_plan) : '') + (s.protect_plan ? '\nПЛАН ЗАЩИТЫ: ' + JSON.stringify(s.protect_plan) : '') + '\nРассвет: ' + s.dawn }).join('\n\n')
    wr(path.join(ND, 'all.md'), all)
    const SM = '{"timeline":[{"at":"ЧЧ:ММ","place":"…","who":["…"],"what":"что по планам происходит в это время"}],"kill_route":[{"at":"ЧЧ:ММ","step":"шаг плана убийства","exposed_to":["кто по своим планам находится там/рядом и может увидеть или услышать"],"could_interfere":"кто и как может помешать, если захочет (по своим планам и способностям)"}],"companion":"помогает ли Олле Нирэн — сознательно или нет, и чем именно, по его плану","protection":"как ложится защита Верены и совпадает ли с целью убийцы","for_agneir":["где ночью Агнейр может оказаться на пути событий"],"for_errkin":["то же для Эрр\'Кина"],"gm_decisions":["что мастеру решить, прежде чем играть Ночь 2"]}'
    const mp = path.join(ND, 'map.prompt.txt'), mo = path.join(ND, 'map.json')
    wr(mp, FRAME + '\n\nТы — СВОДЧИК для мастера. Прочитай (Read) ' + D + '\\canon.md (устройство дома: двор, часовня в яме, парапет, лестницы, золото Беатриче) и ' + path.join(ND, 'all.md') + ' — независимые планы Ночи 2 всех 34 обитателей, включая план убийства (красная нить) и план защиты (белая нить). Ночь НЕ разыгрывай и исход не решай: сведи планы в единую хронологию по времени, разложи маршрут убийства по шагам и для каждого шага укажи, кто по своим планам окажется рядом и может увидеть или помешать. Опирайся только на написанное; ничего не добавляй. Конкретно, без штампов.\n\nФОРМАТ — один JSON-объект:\n' + SM)
    console.log(agentInstr(mp, mo))
  }
} else if (cmd === 'n3' || cmd === 'n3b' || cmd === 'n3map') {
  const ND = path.join(RUN, 'n3'); mk(ND)
  const WAVE2 = { 'Олле': 'Нирэн', 'Рафаэль': 'Верена' }
  const ldj = p => fs.existsSync(p) ? rd(p) : null
  const SN = '{"agent":"имя","agenda_now":"какие нити повестки ещё открыты после вечера и что изменилось — 2–4 предложения от первого лица","night_goal":"чего добиваешься этой ночью","motive":"почему — от первого лица, 4–6 предложений","actions":[{"at":"ЧЧ:ММ","until":"ЧЧ:ММ","place":"<место>","kind":"<' + KINDS.join('|') + '>","with":["имена"],"thread":"какую нить повестки двигает","says_or_does":"конкретно","if_unavailable":"следующий шаг к той же цели"}],"observable":[{"who":"имя","what":"что этот человек увидит/услышит от тебя"}],"kill_plan":null,"protect_plan":null,"dawn":"где и с чем встретишь рассвет; что хочешь иметь на руках утром"}'
  const KILL = '"kill_plan":{"target":"…","why_this_one":"…","where":"…","when":"…","how":"…","lure":"как цель окажется в нужном месте — с учётом того, где все устроились на ночь","companion_role":"знает ли твой спутник, помогает ли (сознательно или нет)","witnesses_risk":"кто рядом может увидеть или помешать; что делаешь тогда","traces":"…","after":"…"}'
  const PROT = '"protect_plan":{"whom":"…","why":"…","how":"…","limits":"…","companion_role":"знает ли защищаемый"}'
  const role = { 'Нирэн': '★ ТВОЯ НИТЬ НА ОБОРОТЕ — КРАСНАЯ (решено мастером). Канон: Падение берёт того, кто уже падал и к кому ты привязана — Олле; канонное место — двор, парапет над ямой часовни (пять шагов вниз до крыши часовни); ты не поднимаешь руки, рядом с тобой рушится само; если Олле уберегут — Падение ищет другого, кто уже падал рядом. Красная обязана убить до рассвета. Заполни kill_plan под то, как дом устроился на ночь по твоему журналу. Не мелодрама.', 'Верена': '★ ТВОЯ НИТЬ НА ОБОРОТЕ — БЕЛАЯ (решено мастером): защищаешь Рафаэля. Заполни protect_plan.' }
  const build = (a, extra) => {
    const ag = ldj(path.join(RUN, 'agenda', a.slug + '.json')) || {}
    const h = NAMES.filter(x => x !== a.name && st.pos[x].place === st.pos[a.name].place)
    const ob = st.oblig.filter(o => o.debtor === a.name || o.creditor === a.name).map(o => '- ' + o.debtor + ' → ' + o.creditor + ': ' + o.what + ' [' + (o.sealed || '?') + ']')
    const L = [FRAME, '']
    L.push('Ты — ' + a.name + ' (' + a.role + '). 22:00, Ночь 2 Шабаша начинается. Прочитай (Read): ' + D + '\\briefs\\' + a.slug + '.md (кто ты и чего хочешь), ' + D + '\\packets\\' + a.slug + '.md, свой лист в ' + D + '\\sheets.md, ' + D + '\\canon.md.', '')
    L.push('★ ТВОЯ ПОВЕСТКА (составлена в 18:00):', '- Большая цель: ' + (ag.arc_goal || '—'))
    ;(ag.threads || []).forEach((t, i) => L.push('- Нить ' + (i + 1) + ': ' + t.event + ' → хочу: ' + t.want + (t.key_move ? ' → ход: ' + t.key_move.what + ' (' + (t.key_move.when || '') + ')' : '')))
    L.push('', 'ГДЕ ТЫ НА 22:00: ' + st.pos[a.name].place + ' (' + st.pos[a.name].doing + '). Рядом: ' + (h.join(', ') || 'никого') + '. Настроение: ' + (st.mood[a.name] || '—') + '.')
    L.push('', 'ТВОЙ ДЕНЬ И ВЕЧЕР 12:00–22:00 (журнал — главное: что вышло из твоих ходов вечером):', st.journal[a.name].join('\n') || '(пусто)')
    L.push('', 'ТВОИ ДОЛГИ И ОБЯЗАТЕЛЬСТВА:', ob.join('\n') || '(нет)')
    L.push('', 'ПУБЛИЧНО ИЗВЕСТНО:', st.public.slice(-25).map(x => '- ' + x).join('\n') || '(ничего)')
    L.push('', 'ИГРОКИ: что Агнейр и Эрр\'Кин делают ночью — решается за столом; к ним можно только хотеть подойти (kind «к ИП»).', '')
    if (role[a.name]) L.push(role[a.name], '')
    if (extra) L.push(extra, '')
    L.push('ЗАДАЧА: распиши Ночь 2 (22:00 — рассвет ~05:30), 3–8 действий. Ночь продолжает твой вечер: что из повестки не закрыто — двигай дальше (ночью ведьмы честнее, разговоры короче, дом слышит каждую лестницу). Каждое действие называет нить, которую двигает. Сидеть/ждать/спать — только как осознанный ход (засада, проверка, сбережение сил к утреннему ходу) — так и напиши. Безопасность — условие, а не цель. Нельзя решать за других и за игроков, знать то, чего не видел(а), выдумывать факты. Предметно, без штампов.')
    L.push('', placesLine + ' Допустимо также: «двор, парапет над ямой часовни».')
    let sc = SN; if (a.name === 'Нирэн') sc = sc.replace('"kill_plan":null', KILL); if (a.name === 'Верена') sc = sc.replace('"protect_plan":null', PROT)
    L.push('', 'ФОРМАТ — один JSON-объект:', sc)
    return L.join('\n')
  }
  if (cmd === 'n3') { let n = 0; for (const a of AG) { if (WAVE2[a.name]) continue; wr(path.join(ND, a.slug + '.prompt.txt'), build(a)); n++ } console.log('n3', n) }
  else if (cmd === 'n3b') { let n = 0; for (const a of AG) { const src = WAVE2[a.name]; if (!src) continue
      const s = rd(path.join(ND, AG.find(x => x.name === src).slug + '.json'))
      const seen = (s.observable || []).filter(x => String(x.who).includes(a.name)).map(x => '- ' + x.what).concat((s.actions || []).filter(x => (x.with || []).some(w => String(w).includes(a.name))).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + x.says_or_does))
      wr(path.join(ND, a.slug + '.prompt.txt'), build(a, 'ЧТО ТЫ ЭТОЙ НОЧЬЮ ВИДИШЬ И СЛЫШИШЬ ОТ ' + src.toUpperCase() + ' (только внешнее; её мыслей и нити ты не знаешь):\n' + (seen.join('\n') || '(ничего особенного)') + '\nРеши сам, идёшь ли за ней / делаешь ли, о чём просит.')); n++ } console.log('n3b', n) }
  else {
    const all = AG.map(a => { const s = ldj(path.join(ND, a.slug + '.json')); if (!s) return ''; return '## ' + a.name + ' — на 22:00: ' + st.pos[a.name].place + '\nПовестка сейчас: ' + s.agenda_now + '\nЦель ночи: ' + s.night_goal + '\n' + (s.actions || []).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + (x.with || []).join(', ') + ' (нить: ' + (x.thread || '') + '): ' + x.says_or_does).join('\n') + (s.kill_plan ? '\nПЛАН УБИЙСТВА: ' + JSON.stringify(s.kill_plan) : '') + (s.protect_plan ? '\nЗАЩИТА: ' + JSON.stringify(s.protect_plan) : '') }).join('\n\n')
    const res = rd(RESULTS); const eve = res.ticks.filter(t => t.n >= 12).map(t => '## ' + t.label + '\n' + t.summary).join('\n\n')
    wr(path.join(ND, 'all.md'), '# ВЕЧЕР 18:00–22:00 (итоги тактов)\n' + eve + '\n\n# ПЛАНЫ НОЧИ 2\n' + all)
    const SM = '{"overview":"вечер и ночь: какие решения люди приняли, к чему привели их ходы, что назревает (10–14 предложений)","key_moves":[{"who":"…","at":"ЧЧ:ММ","move":"решающий ход ночи","thread":"какую цель двигает","collides_with":["…"],"likely":"вероятный исход по планам"}],"night_collisions":[{"at":"ЧЧ:ММ","place":"…","who":["…"],"what":"…","risk":"высокий|средний|низкий"}],"kill_route":[{"at":"ЧЧ:ММ","step":"…","exposed_to":["…"],"could_interfere":"…"}],"companion":"помогает ли Олле Нирэн — сознательно или нет","protection":"как ложится защита Верены","for_players":["что ночью придёт к Агнейру и Эрр\'Кину — кто, где, с чем"],"gm_decisions":["…"]}'
    const mp = path.join(ND, 'map.prompt.txt'), mo = path.join(ND, 'map.json')
    wr(mp, FRAME + '\n\nТы — СВОДЧИК для мастера. Прочитай (Read) ' + D + '\\canon.md и ' + path.join(ND, 'all.md') + ' — итоги вечера 18:00–22:00 (симуляция по тактам) и независимые планы Ночи 2 всех 34, построенные от их повесток. Ночь НЕ разыгрывай. Сведи: ключевые ходы ночи (кто, что, ради какой цели, с кем столкнётся, вероятный исход), пересечения, маршрут убийства по шагам с теми, кто рядом. Только по написанному.\n\nФОРМАТ — один JSON-объект:\n' + SM)
    console.log(agentInstr(mp, mo))
  }
} else if (cmd === 'agenda') {
  const AD = path.join(RUN, 'agenda'); mk(AD)
  const res = rd(RESULTS)
  const SA = '{"agent":"имя","arc_goal":"моя большая цель на этом Шабаше — своими словами, от первого лица","threads":[{"event":"что конкретно случилось сегодня (событие из журнала, долг, услышанное, поражение, обида, сделка) — с именами","means":"что это значит для меня","want":"чего я теперь хочу добиться","key_move":{"what":"решающий поступок — конкретно","who":"с кем / против кого","where":"где","when":"вечер ЧЧ:ММ / ночь / утро Дня 2","stake":"что ставлю на кон","risk":"чем рискую"},"cost_of_waiting":"что потеряю, если промолчу или подожду"}],"priority":"какая нить главная сегодня вечером и почему","drop":"что сознательно откладываю"}'
  let n = 0
  for (const a of AG) {
    const fails = res.ticks.flatMap(t => (t.failed_plans || []).filter(f => f.agent === a.name).map(f => '- [' + t.label + '] ' + f.plan + ' — сорвалось: ' + f.why_failed))
    const ips = res.ticks.flatMap(t => (t.ip_requests || []).filter(r => r.from === a.name).map(r => '- [' + t.label + '] к ' + r.to + ': ' + r.want))
    const ob = st.oblig.filter(o => o.debtor === a.name || o.creditor === a.name).map(o => '- ' + o.debtor + ' → ' + o.creditor + ': ' + o.what + ' [' + (o.sealed || '?') + ']')
    const scenes = FIXED.filter(f => f.tick <= 11 && f.participants.includes(a.name)).map(f => '- ' + fixedLine(f))
    const L = [FRAME, '']
    L.push('Ты — ' + a.name + ' (' + a.role + '). 18:00, День 1 Шабаша. Дневные игры кончились, впереди вечер и Ночь 2. Прочитай (Read):')
    L.push('1) ' + D + '\\briefs\\' + a.slug + '.md — ★ КТО ТЫ И ЧЕГО ХОЧЕШЬ: «Хочет», «Может/Не может», «Триггер», «Без игроков», «В детективе», твоя линия из «Опуса». Главный источник твоих целей.')
    L.push('2) ' + D + '\\packets\\' + a.slug + '.md — твой пакет (утро, тайное знание, долги);')
    L.push('3) ' + D + '\\sheets.md — твой лист (призма, слепое пятно, автотриггер, оси);')
    L.push('4) ' + D + '\\canon.md — общий канон.', '')
    L.push('ТВОЙ ДЕНЬ 12:00–18:00 (журнал):', st.journal[a.name].join('\n') || '(пусто)', '')
    if (scenes.length) L.push('СЫГРАННЫЕ ЗА СТОЛОМ СЦЕНЫ С ТОБОЙ (факт):', scenes.join('\n'), '')
    L.push('ТВОИ ДОЛГИ И ОБЯЗАТЕЛЬСТВА:', ob.join('\n') || '(нет)', '')
    L.push('ЧТО У ТЕБЯ СОРВАЛОСЬ ЗА ДЕНЬ:', fails.join('\n') || '(ничего)', '')
    L.push('ЧЕГО ТЫ ХОТЕЛ(А) ОТ ИГРОКОВ:', ips.join('\n') || '(ничего)', '')
    L.push('ЧТО ПУБЛИЧНО ИЗВЕСТНО ДОМУ:', st.public.map(x => '- ' + x).join('\n') || '(ничего)', '')
    L.push('ЗАДАЧА — СОСТАВЬ СВОЮ ПОВЕСТКУ НА ВЕЧЕР И НОЧЬ.')
    L.push('Ты не жертва обстоятельств, а человек с целью. День что-то дал и что-то отнял: встречи, проигрыши, долги, услышанное, обиды, сделки. Каждое из этого продвигает твою большую цель, мешает ей или требует ответа.')
    L.push('1) arc_goal — твоя большая цель на Шабаше (из брифа и пакета), своими словами.')
    L.push('2) threads — 2–4 нити. Каждая начинается с КОНКРЕТНОГО события твоего дня (с именами, что было сказано и сделано) и ведёт к решающему ходу: что сделаешь, с кем, где, когда, что ставишь на кон, чем рискуешь, что потеряешь, если промолчишь. Хотя бы одна нить — о том, что ты хочешь ПОЛУЧИТЬ (знание, вещь, услугу, человека, место, приз, отмену долга), а не только как уцелеть.')
    L.push('3) Ночь опасна, но не отменяет целей: реши, чем рискнёшь ради них. «Сидеть и ждать» годится, только если это и есть ход (засада, проверка, приманка) — тогда так и назови.')
    L.push('4) priority — главная нить вечера и почему; drop — что откладываешь.')
    L.push('5) Нельзя: решать за других и за игроков, знать то, чего не видел(а), выдумывать новые факты о мире. Предметно, без штампов.')
    L.push('', 'ФОРМАТ — один JSON-объект:', SA)
    wr(path.join(AD, a.slug + '.prompt.txt'), L.join('\n')); n++
  }
  console.log('agenda prompts', n)
} else if (cmd && cmd.startsWith('r2')) {
  const RD = path.join(RUN, 'r2'); mk(RD)
  const ED = path.join(RUN, 'evening'), ND = path.join(RUN, 'night2')
  const ld = (d, s) => { const f = path.join(d, s + '.json'); return fs.existsSync(f) ? rd(f) : null }
  const slugOf = n => AG.find(a => a.name === n).slug
  const ERR = [
    'ЗАЯВКИ ИГРОКА ЭРР\'КИНА НА ВЕЧЕР (это решения игрока — он так сделает; ОТВЕТЫ НПС — заготовка к отыгрышу за столом, часть сцен будет сыграна). Ориентировочное время:',
    '~18:00–19:10 — Эрр\'Кин находит Олле (там, где Олле сейчас; Олле не отходит далеко от Нирэн). Деловое, по порядку:',
    ' (1) Договор: уточняет, что суть их договора, скреплённого Валтис, — ни при каких обстоятельствах друг на друга не нападать, не пытаться убить, не вредить социально и не подставлять. Это основной пункт. Конкретные акты помощи — проще обсуждать и договариваться по ходу, не закрепляя формально.',
    ' (2) Спрашивает Олле, говорил ли с ним Агнейр. (Факт: в Игре 49 на костях Агнейр спрашивал Олле о его союзе с Эрр\'Кином и о связи с Нирэн; Олле ответил «ваши домыслы». Эрр\'Кин не предупредил Олле, что расскажет о союзе Агнейру.) Игрок НЕ разыгрывает это заранее: пусть недоразумение вскроется естественно. Когда вскроется — Эрр\'Кин признаёт ошибку: повёл себя незрело в рамках союза. И говорит, что союз втроём кажется ему идеальным: с Агнейром они через многое прошли, он ему доверяет; в рамках общего выживания и договора о ненападении Агнейр точно не предаст.',
    ' (3) Использует право на услугу («руку») по их договору: услуга Олле — сказать, не утаил ли он чего-то важного для их сотрудничества; если да — рассказать.',
    ' (4) План выживания: всю ночь сидеть всей толпой в одной комнате. Друг другу помогать, усиливать (бафать). Если враг покусится на кого-то — защищаться всем вместе.',
    ' (5) Когда дела решены — светская беседа: Эрр\'Кин рассказывает факты о демонической жизни, не связанные с его делами в Земле-под-поясом; расспрашивает Олле о жизни, родине, магии, как он здесь оказался, о дальнейших планах — прямо и конкретно.',
    '~19:10 — Эрр\'Кин просит служанку принести в их с Миланидой гостевую комнату (3 эт.) еды и вина; зажигает там свечи, если есть.',
    '~19:20–20:00 — Эрр\'Кин и Миланида в их комнате: он заглаживает вину, всё внимание ей, старается угодить; не ради себя, ради неё (романтика, ласки; дальше — как решит она). Говорит ей: (a) для её развлечения неплохо бы попросить у Беатриче позволения участвовать в придумывании следующих игр; (b) простым языком рассказывает план союза (Олле, возможно Агнейр) и спрашивает её мнение; (c) обещает в следующий раз перед Авророй очень стараться помогать ей красоваться их отношениями.',
    '~20:00 — закат, второй оборот Веретена (Миланида как ведьма уходит в покои Беатриче).',
    'После оборота — Эрр\'Кин с Миланидой идут в общую комнату Олле, если она состоится.',
    'Минорное, только если останется время: Эрр\'Кин подходит к Данделию: «Не будешь ли ты против моего разговора с ведьмой истины?» — и молча смотрит на реакцию; ничего не показывает и больше ничего не говорит. В зависимости от ответа, может быть, говорит с Вереной.'
  ].join('\n')
  const OLLE47 = 'ФАКТ (Игра 47, Чай обвинений): Олле публично требовал безопасности и предлагал всем объединиться в одной комнате — «да хоть в этой» (Большой зал). Данделий призвал его к спокойствию, Валтис — «нарушения договора нет». Решение Беатриче о «союзе в одной комнате» по правилам до сих пор не объявлено. Олле свой план не бросал.'
  const evBlock = s => { const e = ld(ED, s); if (!e) return ''; const np = e.night_plan || {}; return 'ТВОЁ ПРЕЖНЕЕ РЕШЕНИЕ НА 18:00 (ты принял(а) его до того, как узнал(а) новости ниже; можешь пересмотреть):\n- Итог дня: ' + e.day_result + '\n- Решение: ' + e.evening_decision + '\n- План на ночь: ' + (np.where || '') + '; ' + (np.intent || '') }
  const head = a => [FRAME, '', 'Ты — ' + a.name + ' (' + a.role + '). Прочитай (Read): ' + D + '\\canon.md, ' + D + '\\packets\\' + a.slug + '.md, свой лист в ' + D + '\\sheets.md.', '', evBlock(a.slug), '']
  const out = (p, o, txt) => { wr(p, txt); return agentInstr(p, o) }
  if (cmd === 'r2a') {
    const o = AG.find(a => a.name === 'Олле'), m = AG.find(a => a.name === 'Миланида')
    const SO = '{"meeting":{"when":"ЧЧ:ММ–ЧЧ:ММ","where":"место","niren":"где в это время Нирэн и слышит ли она"},"responses":[{"request":"1|2|3|4|5","olle_says":"что Олле отвечает — живыми репликами","olle_does":"что делает","inner":"почему так — от первого лица, 1–3 предложения"}],"concealed":"что ты считаешь важным для сотрудничества и до сих пор утаивал; что именно говоришь в ответ на услугу (и что всё-таки оставляешь при себе, если оставляешь — и как это ложится на договор)","on_agneir":"как ты принимаешь вскрывшееся недоразумение и предложение союза втроём","one_room":{"room":"какую комнату назначаешь на ночь","when_announce":"ЧЧ:ММ","how":"как и где объявляешь (кому, при ком)","words":"дословно, что говоришь дому","whom_personally":["к кому идёшь лично уговаривать"],"rules":"какие порядки предлагаешь в комнате: двери, дежурства, сон, кто у окон, усиление"},"evening_after":[{"at":"ЧЧ:ММ","place":"…","with":["…"],"says_or_does":"…"}],"mood":"…"}'
    wr(path.join(RD, 'olle.prompt.txt'), head(o).concat([OLLE47, '', ERR, '', 'ЗАДАЧА: ты — Олле. Ответь на каждую из пяти просьб Эрр\'Кина так, как ответил бы ты: по призме, слепому пятну, автотриггеру, знанию и тому, что ты пережил за день (Агнейр выиграл у тебя Щит, спрашивал про союз и про Нирэн; договор с Эрр\'Кином скреплён Валтис). Недоразумение про Агнейра пусть вскроется естественно — по твоим словам. Не решай за Эрр\'Кина, что он ответит, кроме того, что заявлено выше. Потом реши, как ТЫ проводишь план «все в одной комнате» (он у тебя был ещё с Чая; Эрр\'Кин теперь его поддерживает): какую комнату, когда, какими словами объявляешь, кого идёшь уговаривать сам, какие порядки предлагаешь. Пиши предметно, без штампов.', '', placesLine, '', 'ФОРМАТ — один JSON-объект:', SO]).join('\n'))
    const SM = '{"responses":[{"request":"комната и еда|игры Беатриче|союз|Аврора","she_says":"…","she_does":"…","inner":"от первого лица, 1–3 предложения"}],"how_far":"докуда она сама доводит вечер в постели — её решение, коротко и без натурализма","alliance_opinion":"что она думает о союзе с Олле (и Агнейром) — честно","one_room":"что она думает о плане ночевать всем в одной комнате и согласна ли","after":"что она делает дальше, до оборота и после","mood":"…"}'
    wr(path.join(RD, 'melanida.prompt.txt'), head(m).concat([ERR, '', 'ЗАДАЧА: ты — Миланида. Эрр\'Кин весь день был занят, ты обижена и скучаешь; днём ты советовала ему «прятать причину смерти, а не труп». Реши, как ты принимаешь его вечер: еду, вино, свечи, внимание, ласки (сколько ты ему позволишь — решаешь ты), идею просить у Беатриче участия в придумывании игр, его план союза, обещание насчёт Авроры. И что ты думаешь про план всей толпой ночевать в одной комнате. Пиши живо, предметно, без натурализма и без штампов.', '', 'ФОРМАТ — один JSON-объект:', SM]).join('\n'))
    console.log('r2a 2')
  } else if (cmd === 'r2beat') {
    const ol = ld(RD, 'olle_eve'), b = AG.find(a => a.name === 'Беатриче')
    const SB = '{"ruling":"твоё решение по правилам: можно ли гостям ночевать всем в одной комнате, что это значит для Игры, какие условия (дословно, как объявишь)","where":"в какой комнате разрешаешь / предлагаешь","how_announce":"как и когда объявляешь (бабочки, лично, при Валтис)","why":"почему так — от первого лица","limits":"чего общая комната не отменяет (красная нить, твоё обещание вмешаться после первого убийства ведьмой и т.п.)"}'
    wr(path.join(RD, 'beatrice_ruling.prompt.txt'), head(b).concat([OLLE47, '', 'СЕЙЧАС: Олле объявляет дому план (по его собственным словам ниже). Эрр\'Кин его поддерживает.', 'Олле: комната — ' + ol.one_room.room + '; объявляет в ' + ol.one_room.when_announce + ' — ' + ol.one_room.how + '; слова: «' + ol.one_room.words + '»; порядки: ' + ol.one_room.rules, '', 'ЗАДАЧА: ты — Беатриче, хозяйка и распорядительница Игры. Вынеси решение по правилам, которое до сих пор не объявляла. Учти свою натуру, свои обещания (скреплённые Валтис), то, что Игра должна идти, и что гости ищут безопасности. Решай только за себя.', '', 'ФОРМАТ — один JSON-объект:', SB]).join('\n'))
    console.log('r2beat')
  } else if (cmd === 'r2b' || cmd === 'r2c') {
    const ol = ld(RD, 'olle_eve'), ml = ld(RD, 'melanida_eve'), br = ld(RD, 'beatrice_ruling')
    const PUB = ['ЧТО ПУБЛИЧНО ПРОИЗОШЛО ВЕЧЕРОМ (знают все в доме):',
      '- ' + ol.one_room.when_announce + ': Олле — ' + ol.one_room.how + '. Его слова: «' + ol.one_room.words + '». Комната: ' + ol.one_room.room + '. Порядки: ' + ol.one_room.rules + '. Эрр\'Кин поддерживает план («всю ночь всей толпой в одной комнате, друг другу помогаем, усиливаем, если на кого-то покусятся — защищаемся все вместе»).',
      '- Беатриче о правилах: ' + br.ruling + ' (' + br.how_announce + '). Чего это не отменяет: ' + br.limits,
      '- Около 18:00–19:10 Эрр\'Кин долго говорил с Олле (' + ol.meeting.where + '); о чём — слышали только рядом стоявшие. Около 19:10 он попросил служанку принести еды и вина в свою гостевую комнату; до заката был там с Миланидой.'].join('\n')
    const lk = ol.one_room.whom_personally || []
    const roleN = {
      'Нирэн': '★ ТВОЯ НИТЬ — КРАСНАЯ (решено мастером, факт). Канон: Падение берёт того, кто уже падал и к кому ты привязана — Олле; место в каноне — двор, парапет над ямой часовни; ты не поднимаешь руки, рядом с тобой всё рушится само; если Олле уберегут — Падение ищет другого, кто уже падал рядом. Теперь дом (или его часть) ночует в одной комнате по плану самого Олле. Распиши kill_plan заново под это: как и когда Олле окажется вне комнаты или у края, или как Падение работает в самой комнате, кто при этом рядом, что делаешь, если ничего не выходит. Красная нить обязана убить до рассвета. Не делай мелодраму и не оценивай. protect_plan — null.',
      'Верена': '★ ТВОЯ НИТЬ — БЕЛАЯ (решено мастером, факт): защищаешь Рафаэля. Заполни protect_plan; kill_plan — null.',
      'Данделий': 'Ты автор каркаса Игры, на обороте смотришь внимательнее всех; канон допускает, что ты догадываешься, у кого красная нить, и не вмешиваешься. Нити у тебя нет. ВОЗМОЖНО (если у Эрр\'Кина останется время, ~20:15–20:30) Эрр\'Кин подойдёт к тебе и скажет только: «Не будешь ли ты против моего разговора с ведьмой истины?» — и молча будет смотреть на реакцию. Напиши в evening_actions, что ты ответишь, если это случится (как заготовку).',
      'Верена_extra': ''
    }
    const SCH = '{"agent":"имя","one_room":{"answer":"да | нет | частично","why":"почему — от первого лица, 2–4 предложения, из характера и знания","conditions":"на каких условиях / до какого часа / с кем","instead":"если нет — где ты ночью"},"evening_actions":[{"at":"ЧЧ:ММ","place":"…","kind":"<' + KINDS.join('|') + '>","with":["…"],"says_or_does":"…","if_unavailable":"…"}],"at_turn":"где ты на закате (оборот ~20:00) и что заметил(а)","my_thread":"нет | красная | белая","night_goal":"…","motive":"от первого лица, 4–6 предложений","actions":[{"at":"ЧЧ:ММ","until":"ЧЧ:ММ","place":"…","kind":"…","with":["…"],"says_or_does":"…","if_unavailable":"…"}],"observable":[{"who":"имя","what":"что этот человек увидит/услышит от тебя"}],"kill_plan":null,"protect_plan":null,"dawn":"…"}'
    const KILL = '"kill_plan":{"target":"…","why_this_one":"…","where":"…","when":"…","how":"…","lure":"как цель окажется в нужном месте — с учётом общей комнаты","companion_role":"знает ли Олле, помогает ли (сознательно или нет)","witnesses_risk":"кто в комнате и рядом может увидеть или помешать; что делаешь тогда","traces":"…","after":"…"}'
    const PROT = '"protect_plan":{"whom":"…","why":"…","how":"…","limits":"…","companion_role":"знает ли защищаемый"}'
    const SUN = 'ЗАКАТ ~20:00 — ВТОРОЙ ОБОРОТ ВЕРЕТЕНА: ведьмы в покоях Беатриче (спутников нет), Одиночество за оградой. Веретено называет убийцу (красная) и защитницу (белая); цель выбирает убийца; красная обязана убить до рассвета. Знаки на один вдох: чашка у локтя Нирэн сама доезжает до края стола; Рафаэль (где бы ни был) видит, что зал на миг «чище» (знак Верены). Чью нить какой цвет — по знакам не понять.'
    const wave2 = { 'Олле': 'Нирэн', 'Рафаэль': 'Верена' }
    const mkP = (a, extra) => {
      const L = head(a)
      L.push(PUB, '')
      if (a.name === 'Миланида') L.push('ТВОЙ ВЕЧЕР С ЭРР\'КИНОМ (ты это прожила): ' + JSON.stringify(ml), '')
      if (lk.some(x => String(x).includes(a.name))) L.push('Олле лично подходил к тебе уговаривать ночевать вместе (его слова — как в объявлении выше).', '')
      L.push(SUN, '', 'ИГРОКИ: Эрр\'Кин с Миланидой после оборота идут в общую комнату (если она состоится). Что делает ночью Агнейр — неизвестно, решается за столом.', '')
      if (roleN[a.name]) L.push(roleN[a.name], '')
      if (extra) L.push(extra, '')
      L.push('ЗАДАЧА: (1) Реши, идёшь ли ты ночевать в общую комнату Олле — да/нет/частично и почему, из своего характера, страхов, долгов и знания (не из вежливости). (2) Перепиши свой вечер 18:00–20:00 с учётом новостей. (3) Распиши Ночь 2 по часам (3–8 действий до рассвета ~05:30) — там, где ты на самом деле будешь. Решай только за себя; знай только своё; не выдумывай фактов; не решай за игроков. Предметно, без штампов.')
      L.push('', placesLine + ' Допустимы также: «двор, парапет над ямой часовни», «часовня», «за оградой».')
      let sc = SCH
      if (a.name === 'Нирэн') sc = sc.replace('"kill_plan":null', KILL)
      if (a.name === 'Верена') sc = sc.replace('"protect_plan":null', PROT)
      L.push('', 'ФОРМАТ — один JSON-объект (без markdown):', sc)
      return L.join('\n')
    }
    let n = 0
    if (cmd === 'r2b') {
      for (const a of AG) { if (wave2[a.name]) continue; wr(path.join(RD, a.slug + '.prompt.txt'), mkP(a)); n++ }
    } else {
      for (const a of AG) { const src = wave2[a.name]; if (!src) continue
        const s = ld(RD, slugOf(src))
        const seen = (s.observable || []).filter(x => String(x.who).includes(a.name)).map(x => '- ' + x.what)
        const acts = (s.actions || []).concat(s.evening_actions || []).filter(x => (x.with || []).some(w => String(w).includes(a.name))).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + x.says_or_does)
        let extra = 'ЧТО ТЫ ВИДИШЬ И СЛЫШИШЬ ОТ ' + src.toUpperCase() + ' ЭТИМ ВЕЧЕРОМ И НОЧЬЮ (только внешнее; её мыслей и нити не знаешь):\n' + (seen.concat(acts).join('\n') || '(ничего особенного)') + '\nРеши сам, идёшь ли за ней / делаешь ли, о чём просит.'
        if (a.name === 'Олле') extra = 'ТВОЙ РАЗГОВОР С ЭРР\'КИНОМ И ТВОЙ ПЛАН (это ты сам решил и сделал): ' + JSON.stringify(ol) + '\n\nКТО СОГЛАСИЛСЯ НОЧЕВАТЬ ВМЕСТЕ (по ответам дома): ' + AG.filter(x => !wave2[x.name]).map(x => { const r = ld(RD, x.slug); return r ? x.name + ' — ' + r.one_room.answer : '' }).filter(Boolean).join('; ') + '\n\n' + extra
        wr(path.join(RD, a.slug + '.prompt.txt'), mkP(a, extra)); n++ }
    }
    console.log(cmd, n)
  } else if (cmd === 'r2map') {
    const ol = ld(RD, 'olle_eve'), br = ld(RD, 'beatrice_ruling')
    const all = AG.map(a => { const s = ld(RD, a.slug); if (!s || !s.one_room) return ''; return '## ' + a.name + (s.my_thread && s.my_thread !== 'нет' ? ' [нить: ' + s.my_thread + ']' : '') + '\nОбщая комната: ' + s.one_room.answer + ' — ' + s.one_room.why + (s.one_room.instead ? ' (иначе: ' + s.one_room.instead + ')' : '') + '\nВечер: ' + (s.evening_actions || []).map(x => x.at + ' [' + x.place + '] ' + x.says_or_does).join(' | ') + '\nНочь:\n' + (s.actions || []).map(x => '- ' + x.at + (x.until ? '–' + x.until : '') + ' [' + x.place + '] ' + (x.with || []).join(', ') + ': ' + x.says_or_does).join('\n') + (s.kill_plan ? '\nПЛАН УБИЙСТВА: ' + JSON.stringify(s.kill_plan) : '') + (s.protect_plan ? '\nЗАЩИТА: ' + JSON.stringify(s.protect_plan) : '') }).join('\n\n')
    wr(path.join(RD, 'all.md'), 'ОЛЛЕ И ЭРР\'КИН (вечер): ' + JSON.stringify(ol) + '\n\nРЕШЕНИЕ БЕАТРИЧЕ: ' + JSON.stringify(br) + '\n\n' + all)
    const SM = '{"overview":"картина вечера и ночи после заявок Эрр\'Кина (8–12 предложений)","room":{"where":"…","in":["кто ночует в общей комнате"],"partly":["кто частично — с пояснением"],"out":["кто отказался — и где он"],"layout":"кто где в комнате, двери, окна, дежурства — по планам"},"evening":[{"at":"ЧЧ:ММ","place":"…","who":["…"],"what":"…","table":"да, если это сцена с игроком к отыгрышу"}],"kill_route":[{"at":"ЧЧ:ММ","step":"…","exposed_to":["…"],"could_interfere":"…"}],"companion":"помогает ли Олле Нирэн теперь — сознательно или нет","protection":"как ложится защита Верены","to_play":["сцены с Эрр\'Кином к отыгрышу: что заготовлено у НПС, где развилки"],"for_agneir":["…"],"gm_decisions":["…"]}'
    const mp = path.join(RD, 'map.prompt.txt'), mo = path.join(RD, 'map.json')
    wr(mp, FRAME + '\n\nТы — СВОДЧИК для мастера. Прочитай (Read) ' + D + '\\canon.md и ' + path.join(RD, 'all.md') + ' — вечер и Ночь 2 всех 34 после заявок игрока Эрр\'Кина: разговор с Олле, план Олле «все в одной комнате», решение Беатриче, ответы каждого, план убийства (красная нить) и защиты (белая). Ночь НЕ разыгрывай и исход не решай. Сведи: кто в комнате и кто нет; вечер по часам (пометь сцены к отыгрышу); маршрут убийства по шагам с теми, кто рядом и может помешать. Только по написанному, без добавлений, без штампов.\n\nФОРМАТ — один JSON-объект:\n' + SM)
    console.log(agentInstr(mp, mo))
  }
} else { console.log('unknown cmd') }
