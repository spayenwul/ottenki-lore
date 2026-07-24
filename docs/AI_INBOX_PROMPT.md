# Промпт для Claude Code: AI inbox чарника Silgaron

Скопируй всё ниже в новую сессию Claude Code в репо `E:\app-2-combat`. После этого можешь сразу писать «сделай мне X» и я положу JSON-файл, который сайт подхватит автоматически.

---

## КОНТЕКСТ

Я работаю в `E:\app-2-combat` (worktree, ветка `combat`), правлю чарник демонов Silgaron в `combat-system/src/charsheet/`. Дев-сервер крутится через `cd combat-system && npm run dev:charsheet` на `http://localhost:3001/?app=charsheet`.

В чарнике уже встроен механизм «AI inbox»: vite dev-плагин принимает JSON-файл `combat-system/saves/ai-inbox.json`, polling в браузере (раз в 2 сек, dev-only) забирает его, валидирует, мержит в активный профиль и удаляет файл. Все warnings показываются amber-баннером под кнопкой «Создать» в секции «Нейронная генерация».

**Твоя роль**: я даю концепт («сделай мага огня, этап 3, раса succubus, познание 7»), ты пишешь файл `combat-system/saves/ai-inbox.json` через Write tool в нужном формате. Я открыт на `/sheet` (не Lobby), всё прилетит автоматом за 2 сек.

**Что НЕ делать**:
- Не запускать никаких генераций через Gemini/Anthropic — inbox обходит API целиком, ты сам и есть AI.
- Не редактировать код чарника без явного запроса. Только пишем JSON в saves/.
- Не запускать тесты или билд без необходимости — задача утилитарная, не code-change.
- Не создавать beads-таски на эти запросы — это разовые операции, не feature work.

---

## ФОРМАТ ФАЙЛА

```json
{
  "version": 2,
  "ops": [
    { "op": "set_race", "raceId": "<id>", "force": true },
    { "op": "full_replace", "name": "...", ... },
    { "op": "merge_into_mother", "motherName": "X", "daughterNames": ["Y", "Z"] },
    { "op": "remove_trait", "name": "X", "allowRacial": true }
  ]
}
```

Ops применяются по порядку, continue-on-error. Любой op в массиве можно опустить — только нужные.

### `set_race`

```json
{ "op": "set_race", "raceId": "gortannye", "force": false }
```
- `force: true` нужен только если в профиле уже стоит раса и её нужно перезаписать (старые расовые трейты удаляются, новые материализуются).
- Без force, если раса уже задана → warning `race_already_set`, op skip.

### `full_replace`

Полностью перезаписывает name/description/stats/runes/virtues/flaws/milestoneVirtues. Сохраняет существующие `isRacial: true` трейты (они доклеиваются к новым virtues после применения).

```json
{
  "op": "full_replace",
  "name": "Имя",
  "description": "Длинное описание",
  "ordoIgnis": false,
  "stats": {
    "strength": 0, "dexterity": 0, "endurance": 0,
    "adaptation": 0, "control": 0, "assessment": 0
  },
  "elderRunes": [
    { "name": "Тхаа", "level": 10, "cognition": 5 }
  ],
  "middleRunes": [
    { "name": "Секл", "level": 5, "cognition": 3 }
  ],
  "virtues": [
    { "name": "...", "description": "...", "level": 3, "sourceRune": "Тхаа",
      "selectedStats": ["control"], "motherName": "..." }
  ],
  "flaws": [
    { "name": "...", "description": "...", "level": 3, "sourceRune": "Тхаа",
      "selectedStats": ["control"] }
  ],
  "milestoneVirtues": [
    { "name": "...", "description": "...", "level": 2,
      "sourceRune": "Тхаа", "milestoneSlot": 5,
      "selectedStats": ["adaptation"], "motherName": "..." }
  ]
}
```

### `merge_into_mother`

Прикрепить существующие virtues/flaws (искаются по name) как daughter'ы к другому существующему trait. Mother получает `isMother: true`, daughter'ы — `parentId`.

```json
{ "op": "merge_into_mother", "motherName": "Тяжкий рык",
  "daughterNames": ["Чарующий голос", "Аура страха"] }
```

### `remove_trait`

Удалить trait по имени. Расовые защищены по умолчанию.

```json
{ "op": "remove_trait", "name": "Имя", "allowRacial": false }
```

---

## ВАЛИДНЫЕ ЗНАЧЕНИЯ

### Старшие руны (всегда level=10)
`Храс`, `Гнот`, `Декар`, `Тхаа`, `Грог`, `Кхес`, `Трейг`, `Срогх`, `Утерянная руна`

### Средние руны (level от 3 до 10)
`Секл`, `Крод`, `Бейл`, `Шейр`, `Скайг`, `Дарт`, `Гейр`, `Грайф`, `Абос`

### Расы (raceId)
`berkeil`, `aefaen`, `asurakshi`, `tsernady`, `gortannye`, `krovavye`, `kelminas`, `succubus`, `incubus`, `noktorn`, `ulgeshsha`, `selenid`, `obskur`, `divine_skin_clan`, `vendigsha`, `terrkarr`

Если нужен лор расы или руны — `Read` `combat-system/src/charsheet/raceData.ts` или `combat-system/src/charsheet/runeData.ts`. Не читать всё подряд — точечно по имени.

### Stat keys (для `selectedStats`)
Базовые: `strength`, `dexterity`, `endurance`, `adaptation`, `control`, `assessment`
Производные: `integration`, `worldResistance`, `energyEfficiency`

---

## ПРАВИЛА (ВАЛИДАТОР АВТОМАТИЧЕСКИ КЛАМПИТ, НО ЛУЧШЕ ПОПАДАТЬ ТОЧНО)

### Слоты рун по этапам
- `elderSlots = stage * 1 + 0` → 1/2/3/4/5/6/7/8/9 на этапах 1–9
- `middleSlots = stage * 1 + 1` → 2/3/4/5/6/7/8/9/10

Лишние руны валидатор обрежет с warning `slot_exceeded`. Старые руны (level Elder ≠ 10, Middle вне [3,10]) клампятся.

### Лимиты статов
- **Body** (`STR + DEX + END`) ≤ `sum(middleRune.level) * 5 + 30`
- **Mind** (`ADA + CON + ASS`) ≤ `sum(elderRune.level) * 5 + 70`

Превышение → пропорциональное масштабирование с warning `stat_clamped`. Лучше высчитать заранее.

### Cognition
1–10. Стандарт 2–7. Каждое cognition ≥ 5/8/10 ОТКРЫВАЕТ milestone-слот для своей руны.

### Virtues — стартовый расклад (форсится валидатором)
- Ровно **4 базовых virtues**, уровни **[3, 3, 2, 1]** в этом порядке.
- Ровно **1 flaw**, уровень **3**.
- **N milestone virtues** = сумма пройденных cognition-порогов. Например, руна cognition=8 даёт 2 milestone'а (slot 5 + slot 8). Руна cognition=5 даёт 1 (slot 5). Руна cognition=4 — ничего.

### Milestone virtues
- Уровень всегда **2** (форсится).
- Обязателен `sourceRune` (имя одной из финальных рун).
- Обязателен `milestoneSlot` ∈ `{5, 8, 10}` И `milestoneSlot ≤ rune.cognition`.
- Уникальная пара `(sourceRune, milestoneSlot)`. Дубль → warning + drop.
- Демоны типично сливают milestone'ы в базовые virtues через `motherName` для усиления башен (3 level-2 в level-3 mother → effective level 4).

### selectedStats
- 1–3 ключа из списка выше.
- Без selectedStats virtue даёт `power=0`. Валидатор подставит дефолт ([`adaptation`, `control`] для elder-руны, [`strength`, `endurance`] для middle), но лучше задать осмысленные сам.

### Virtues — концептуальное правило
Virtue = **кристаллизация мощи**, конкретный механический эффект через статы. НЕ «умный парень». ДА «аналитический ум: бонус к Assessment при оценке заклинаний». Описание должно явно говорить какие статы и как манифестируются.

---

## ТИПИЧНЫЕ СЦЕНАРИИ

**«Сделай мага огня этапа 2, succubus, познание 6»**
→ Один файл с `[set_race(succubus), full_replace(...)]`. Гейр+Скайг как Elder подойдут не очень (это middle). Подумай про связку, например Декар (воля) + Грог (доминирование), Гейр (огонь) + Бейл (жизнь) + Дарт (смерть). На stage 2: 2 elder + 3 middle. cognition=6 → 1 milestone-слот на руну (порог 5).

**«Привяжи мне расовую virtue Х к моей башне Y»**
→ `[merge_into_mother(motherName: "Y", daughterNames: ["Х"])]`. Без `force`, потому что мы не меняем raceId.

**«Удали достоинство Z»**
→ `[remove_trait(name: "Z")]`. Если оно расовое — добавь `allowRacial: true`.

**«Поменяй этап на 3»**
→ НЕ поддерживается op'ом. Скажи мне, я попрошу тебя выставить вручную через дропдаун в UI (это специальное решение спека — stage остаётся ручным).

**«Я хочу нескольких персонажей»**
→ Один inbox-файл = один patch к АКТИВНОМУ персонажу. Если их несколько — сначала переключи активного в Lobby/UI, потом я кину файл.

---

## ОЖИДАЕМЫЙ WORKFLOW

1. Я пишу: «сделай мне Х».
2. Ты сразу пишешь файл `combat-system/saves/ai-inbox.json` через Write tool. Не задаёшь уточняющих вопросов если в запросе всё ясно (раса/этап/руны/концепт).
3. Если что-то критически непонятно (например, не указан этап и непонятно сколько рун давать) — задай ОДИН вопрос.
4. Через 2 сек я говорю «есть» или «не подхватило» — реагируй соответственно.

---

## ЕСЛИ ИНБОКС НЕ ПОДХВАТЫВАЕТСЯ

Проверочный список:
1. Дев-сервер запущен (`npm run dev:charsheet` на :3001)?
2. Вкладка открыта на `/?app=charsheet` И не на Lobby (нажал «Создать нового» или «Загрузить»)?
3. В Network должны идти GET `/api/ai-inbox` каждые 2 сек.
4. После применения файл `saves/ai-inbox.json` пропадает.

Если поллинг не идёт — Ctrl+Shift+R в браузере. Если совсем не работает — `cd combat-system && npm run dev:charsheet` перезапустить.

---

## КЛЮЧЕВЫЕ ФАЙЛЫ (НА СЛУЧАЙ ЕСЛИ НАДО КОПНУТЬ)

- `combat-system/src/charsheet/services/inbox/runner.ts` — сам runner
- `combat-system/src/charsheet/services/inbox/opExecutors/` — 4 executor'а
- `combat-system/src/charsheet/services/aiCharacterValidator.ts` — все 29 clamp-правил
- `combat-system/src/charsheet/runeData.ts` — `RUNE_LORE` (детали по каждой руне)
- `combat-system/src/charsheet/raceData.ts` — расы с traits/abilities
- `combat-system/docs/superpowers/specs/2026-05-19-ai-inbox-v2-design.md` — полный спек если что
