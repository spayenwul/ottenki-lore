import json, os, re, glob, sys
R5 = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = sys.argv[1], sys.argv[2]
h = open(SRC, encoding='utf-8').read()
m = re.search(r'(<script id="data" type="application/json">)(.*?)(</script>)', h, re.S)
D = json.loads(m.group(2))
ld = lambda p: json.load(open(p, encoding='utf-8'))
key = lambda n: n.split(' — ')[0].strip()
S1 = {key(ld(f)['name']): ld(f) for f in glob.glob(os.path.join(R5, 's1', '*.json'))}
S3 = {key(ld(f)['name']): ld(f) for f in glob.glob(os.path.join(R5, 's3', '*.json'))}
RS = ld(os.path.join(R5, 's2', 'resolve.json'))
M = ld(os.path.join(R5, 's4', 'map.json'))
names = [a['name'] for a in D['agents']]
assert set(names) <= set(S1) and set(names) <= set(S3), (set(names) - set(S1), set(names) - set(S3))

# --- вечер: такты 12–14 из резолвера
def tick_of(at):
    hh, mm = map(int, re.match(r'(\d+):(\d+)', at).groups()); t = hh * 60 + mm
    return 12 if t < 19 * 60 else 13 if t <= 20 * 60 + 5 else 14
D['events'] = [e for e in D['events'] if e['tick'] < 12]
nid = max(e['id'] for e in D['events']) + 1
for i, e in enumerate(RS['events']):
    who = [w for w in (e.get('who') or []) if w]
    D['events'].append({'group': 'А', 'at': e['at'], 'until': '', 'place': e.get('place', ''),
        'weight': 'major' if (e.get('roll') or 'Виттор' in e.get('what', '') or 'Веретен' in e.get('what', '')) else 'minor',
        'participants': who, 'witnesses': [], 'initiator': who[0] if who else '', 'reason_initiator': '', 'reason_other': '',
        'discussion': e.get('what', ''), 'outcome': e.get('roll') or '', 'consequence': '', 'ip_hook': '', 'dice': e.get('roll') or '',
        'tick': tick_of(e['at']), 'id': nid + i, 'key': 'r5-%d' % i})
seg = {s['title'][:5]: s['text'] for s in RS['segments']}
pos = [{'agent': n, 'place': p['place'], 'doing': ''} for p in RS['positions_22'] for n in p['who']]
for t, k in ((12, '18:00'), (13, '19:00'), (14, '20:05')):
    D['tickinfo'][str(t)] = {'label': D['tickinfo'][str(t)]['label'], 'done': True, 'summary': seg.get(k, ''),
        'public': [], 'obligations': [], 'positions': pos if t == 14 else [], 'conflicts': [], 'dropped': [], 'failed': [], 'ip': [], 'knowledge': []}
D['ticks'][11]['label'] = '18:00–19:00'
D['ticks'][12]['label'] = D['tickinfo']['13']['label'] = '19:00–20:05 (закат: проводы Виттора, второй оборот Веретена)'

# --- повестки, ночь, где кто
D['agenda'] = {n: {'agent': n, 'arc_goal': S1[n].get('agenda', ''), 'priority': S1[n].get('main', ''), 'drop': '',
    'threads': [{'event': t.get('state', ''), 'want': t.get('want', ''), 'key_move': {'what': t.get('move', ''), 'when': t.get('when', ''), 'stake': t.get('stake', '')}} for t in S1[n].get('threads', [])]} for n in names}
D['night_pos'] = {}
for p in RS['positions_22']:
    for n in p['who']:
        if n in names: D['night_pos'][n] = {'place': p['place'], 'doing': ''}
def acts(s):
    return [{'at': x.get('at', ''), 'until': '', 'place': x.get('place', ''), 'kind': '', 'with': x.get('with') or [], 'thread': x.get('thread', ''),
             'says_or_does': x.get('does', '') + ((' Если: ' + x['if']) if x.get('if') else '') + ((' — сила: ' + x['power']) if x.get('power') else ''), 'if_unavailable': ''} for x in s.get('night', [])]
D['night2'] = {}
for n in names:
    s, a = S3[n], S1[n]
    D['night2'][n] = {'agent': n, 'my_thread': 'красная' if n == 'Нирэн' else 'белая' if n == 'Верена' else 'нет',
        'changed': a.get('changed', ''), 'agenda_now': s.get('evening_outcome', ''), 'night_goal': s.get('night_goal', ''), 'motive': s.get('why', ''),
        'evening_actions': [{'at': x.get('at', ''), 'place': x.get('place', ''), 'with': x.get('with') or [], 'says_or_does': x.get('does', x.get('says_or_does', ''))} for x in a.get('evening_actions', [])],
        'actions': acts(s), 'observable': s.get('observable', []), 'kill_plan': s.get('kill_plan'), 'protect_plan': s.get('protect_plan'),
        'to_companion': s.get('to_companion', ''), 'powers': s.get('powers', ''), 'dawn': s.get('dawn', '')}
spl = lambda x: [w.strip() for w in re.split(r',\s*', x)] if isinstance(x, str) else (x or [])
D['night2map'] = {'overview': M['overview'], 'segments': RS['segments'], 'farewell': RS.get('farewell', ''),
    'key_moves': [{'who': k['who'], 'at': k['at'], 'move': k['does'], 'thread': k.get('thread', ''), 'collides_with': spl(k.get('collides', '')), 'likely': k.get('likely', '')} for k in M['key_moves']],
    'night_collisions': [{'risk': x['level'], 'at': x['at'], 'place': x['place'], 'who': spl(x['who']), 'what': x['what']} for x in M['intersections']],
    'kill_route': [{'at': x['at'], 'step': x['step'], 'exposed_to': spl(x.get('near', '')), 'could_interfere': x.get('could_interfere', '')} for x in M['kill_route']],
    'powers_clash': M.get('powers_clash', []), 'companion': M['companion'], 'if_not_alone': M.get('if_not_alone', ''), 'protection': M['protection'], 'to_play': RS.get('ip_prep', []), 'for_players': M['to_players'],
    'gm_decisions': RS.get('gm', []) + M['gm']}
D['r2'] = {}

js = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
h = h[:m.start(2)] + js + h[m.end(2):]

def rep(old, new):
    global h
    assert h.count(old) == 1, ('not unique', old[:60], h.count(old))
    h = h.replace(old, new)
rep("view.append(h('p', 'muted', 'Вечер 18:00–22:00 просчитан тактами от повесток: в 18:00 каждый назвал свою цель, незакрытые нити дня и решающий ход; вечером эти ходы сталкивались в событиях (хроника, такты 12–14). Ночь 2 — план каждого от того, что вышло вечером; у каждого действия указано, какую нить оно двигает. Жребий по канону: красная нить у Нирэн (цель — Олле), белая у Верены (Рафаэль). Сцены Эрр\\'Кина — заготовки к отыгрышу. Исход ночи не разыгран.'));",
    "view.append(h('p', 'draft', 'Ред. 6 — ночь с силами: каждый действует своим даром, достоинствами и заклинаниями по листам. Ред. 5 (21.10) — пересчитано после Игры 50: игры шли 12:00–14:00, дальше свободные часы; час проводов Виттора назвал Агнейр — закат Дня 1, без тела, на месте смерти; сцена Эрр\\'Кина с Олле — 16:30–17:05, с Миланидой — 19:25–19:50 (заготовки к отыгрышу). Каждый знает только то из Игры 50, что мог знать.'));\n    view.append(h('p', 'muted', 'Каждый из 34 по своему журналу дня собрал повестку на 18:00 → резолвер столкнул намерения вечера (спорное — d20) → каждый по итогу вечера расписал ночь → карта свела планы. Жребий по канону: красная нить у Нирэн (цель — Олле), белая у Верены (Рафаэль). Броски ночи — «вероятно», окончательный исход за мастером.'));\n    if (M && M.segments) { view.append(h('h2', 'sec', 'Вечер 18:00–22:00 — что вышло')); M.segments.forEach(function (s) { var it = h('div', 'item'); it.append(h('div', 'h', s.title), h('p', '', s.text)); view.append(it); }); }\n    if (M && M.farewell) { view.append(h('h2', 'sec', 'Проводы Виттора на закате')); view.append(h('p', '', M.farewell)); }")
rep("      it.append(labeled('На закате, на обороте', s.at_turn), labeled('Цель ночи', s.night_goal), labeled('Почему', s.motive));",
    "      if (s.changed) it.append(labeled('Что изменила Игра 50', s.changed));\n      if (s.powers) it.append(labeled('Силы за ночь', s.powers));\n      if (s.at_turn) it.append(labeled('На закате, на обороте', s.at_turn));\n      it.append(labeled('Цель ночи', s.night_goal), labeled('Почему', s.motive));\n      if (s.to_companion) it.append(labeled('Что услышит спутник', s.to_companion));")
rep("labeled('Кто может увидеть или помешать', k.witnesses_risk), labeled('Следы', k.traces)", "labeled('Кто может увидеть или помешать', k.witnesses_risk)); if (k.if_not_alone) kb.append(labeled('Если наедине не выйдет', k.if_not_alone)); if (k.fallbacks) kb.append(labeled('Запасные ходы', k.fallbacks)); kb.append(labeled('Следы', k.traces)")
rep("    if (M && M.for_players) lst('Что ночью придёт к игрокам', M.for_players);", "    if (M && M.powers_clash) lst('Столкновения сил', M.powers_clash);\n    if (M && M.for_players) lst('Что ночью придёт к игрокам', M.for_players);")
rep("    if (M && M.overview) view.append(h('p', '', M.overview));", "    if (M && M.overview) { view.append(h('h2', 'sec', 'Сводка ночи')); view.append(h('p', '', M.overview)); }")
rep("      lst('Решить мастеру перед Ночью 2', M.gm_decisions);", "      lst('⚖️ Решить мастеру', M.gm_decisions);")
rep("    var why = h('div', 'why');\n    why.append(labeled('Причина · ' + e.initiator, e.reason_initiator), labeled('В это время у другого', e.reason_other));\n    body.append(why);\n    body.append(labeled('О чём говорили', e.discussion));\n    body.append(labeled('Итог', e.outcome, 'res'));",
    "    if (e.reason_initiator || e.reason_other) { var why = h('div', 'why');\n    why.append(labeled('Причина · ' + e.initiator, e.reason_initiator), labeled('В это время у другого', e.reason_other));\n    body.append(why); }\n    body.append(labeled(e.key && e.key.indexOf('r5-') === 0 ? 'Что вышло' : 'О чём говорили', e.discussion));\n    if (e.outcome) body.append(labeled(e.key && e.key.indexOf('r5-') === 0 ? 'Бросок' : 'Итог', e.outcome, 'res'));")
h = re.sub(r'(<p class="lede">)(.*?)(</p>)', lambda x: x.group(1) + x.group(2).replace('Ночь 2 — планы каждого, исход не разыгран.', 'С 14:00 по Игре 50 — свободные часы; вечер и Ночь 2 пересчитаны после неё (ред. 5): проводы Виттора на закате, оборот Веретена, планы ночи каждого и вероятный исход — решение за мастером.') + x.group(3), h, count=1, flags=re.S)
rep("      view.append(labeled('Помогает ли Олле Нирэн', M.companion), labeled('Защита Верены', M.protection));", "      if (M.if_not_alone) view.append(labeled('Если Олле не дадут уйти с ней наедине', M.if_not_alone));\n      view.append(labeled('Помогает ли Олле Нирэн', M.companion), labeled('Защита Верены', M.protection));")
open(OUT, 'w', encoding='utf-8').write(h)
print('ok', len(h), 'events', len(D['events']), 'ticks12-14', sum(1 for e in D['events'] if e['tick'] >= 12))
