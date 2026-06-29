#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
bio_base_randomizer.py — рандомизатор «костей» для генератора персонажей
«Оттенки желаний».

Принцип: на скрипт — честные броски и распределения (входы), на модель —
выводы, синтез и гештальт. Скрипт бьёт три слабости модели: сглаживание
удачи, подкрутку к драме и якорение на клише/круглых числах.

Модули (всё, кроме расовой сигнатуры Слоя-2 — она остаётся за моделью/вольтом):
  Фаза 1 (данность, безопасно показывать сразу):
    • Слой-1 био-подтип (генетическая база темперамента: 5H+7F → 7 шкал §7)
    • темперамент-ярлык (из шкал)
    • таланты-потенциал (НЕ развитие)
    • семья-агент (достаток · способность действовать · давления на ребёнка)
    • глубина (статист/НПС/ключевой), если «случайно»
  Фаза 2 (по-этапно! не выкатывать вперёд — см. ниже):
    • дорожка удачи по этапам (1–2 чёрная · 3–4 обычно · 5–6 везучая; НЕ выравнивается)
  Фаза 3–4 (итог/вектор, в пошаговом режиме открывать только в конце):
    • эрос (ориентация · салиентность · драйв из либидо · конформизм/девиация
      к традиции расы/культуры · стыд/табу · что влечёт)
    • структура листа истины ГМа (сколько и какого типа самообманов)
    • вектор развития (плато/рост/застой/регресс/прорыв) + зазор самооценки

Источник нейромодели: E:\\Downloads\\SOUL_MIND_SYSTEM.md (§3 НЦ, §4 5H+7F, §7 шкалы).
Источник дисциплины тиров: 2026-06-28-...-операционный-промт.md
(Обыденно ~85% · Заметно ~12% · Выдающееся <2% · Граничное ≈0%; хвосты —
только через лайфпас-гейты, не назначать свободно).

ВАЖНО (изоляция «не видит финала», Правило 12): удачу/события БУДУЩИХ этапов
нельзя выкатывать пачкой — иначе модель увидит финал. Поэтому:
  • Фаза 1 — показывай сразу.
  • Дорожка удачи — режим `--stage K` (один этап за раз) для пошагового промта;
    `--luck` (вся дорожка) — только для однопроходного операционного промта.
  • Эрос/истина/вектор (`--present`) — в пошаговом режиме открывать в Фазе 3–4.

Запуск (на этой Windows-системе — именно `python`, не `python3`):
    python bio_base_randomizer.py                      # Фаза 1
    python bio_base_randomizer.py --all --age 34       # всё сразу (операционный)
    python bio_base_randomizer.py --stage 3 --seed 42  # удача только 3-го этапа
    python bio_base_randomizer.py --present            # эрос+истина+вектор
    python bio_base_randomizer.py --json --all
    python bio_base_randomizer.py --selftest
"""

import sys
import json
import math
import random
import argparse

# На Windows консоль часто cp1251 — принудительно UTF-8, иначе кириллица падает.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


# ─────────────────────────────────────────────────────────────────────────
# 0. ОБЩИЕ ХЕЛПЕРЫ
# ─────────────────────────────────────────────────────────────────────────
def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))

def wchoice(rng, pairs):
    """Взвешенный выбор. pairs = [(item, weight), ...]."""
    total = sum(w for _, w in pairs)
    r = rng.random() * total
    upto = 0.0
    for item, w in pairs:
        upto += w
        if r <= upto:
            return item
    return pairs[-1][0]


# ─────────────────────────────────────────────────────────────────────────
# 1. КОНФИГ КАНАЛОВ: норма-бэнд → центр (mu) и σ.
#    σ подобрана так, что |z|<1.44 (≈85% = тир «обыденно») накрывает «норму».
# ─────────────────────────────────────────────────────────────────────────
Z_OBYDENNO = 1.44   # ~85%
Z_ZAMETNO  = 2.50   # ~+11.6%
Z_VYDAY    = 3.30   # ~+1.7%
                    # дальше — «граничное» (≈0.1%)

def _mu_sigma(lo, hi):
    mu = (lo + hi) / 2.0
    sigma = (hi - lo) / 2.0 / Z_OBYDENNO
    return mu, sigma

_NORM = {  # (norm_lo, norm_hi, scale_max). H5 — особый (гендерный), ниже.
    "H1": (41, 70, 200), "H2": (11, 40, 200), "H3": (41, 70, 200),
    "H4": (41, 70, 200),
    "F1": (31, 60, 100), "F2": (31, 60, 100), "F3": (31, 60, 100),
    "F4": (31, 60, 100), "F5": (31, 60, 100), "F6": (41, 60, 100),
    "F7": (31, 60, 100),
}
CHANNELS = {}
for _k, (_lo, _hi, _max) in _NORM.items():
    _mu, _sg = _mu_sigma(_lo, _hi)
    CHANNELS[_k] = {"mu": _mu, "sigma": _sg, "max": _max}
# H5 — тестостерон: base гендерно-зависим; эффект — от ОТКЛОНЕНИЯ от своей базы.
CHANNELS["H5"] = {"mu_m": 70.0, "mu_f": 30.0, "sigma": 12.0, "max": 200}

ORDER_H = ["H1", "H2", "H3", "H4", "H5"]
ORDER_F = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]
NAMES = {
    "H1": "Адреналин/НА", "H2": "Кортизол", "H3": "Эндорфины",
    "H4": "Окситоцин", "H5": "Тестостерон",
    "F1": "Страх/тревога", "F2": "Reward/мотивация", "F3": "Бодрость",
    "F4": "Когнит. контроль", "F5": "Память", "F6": "Моторика",
    "F7": "Торможение импульсов",
}

# ─────────────────────────────────────────────────────────────────────────
# 2. БЭНДЫ СОСТОЯНИЙ (дословно из SOUL_MIND) — готовый текст интерпретации.
# ─────────────────────────────────────────────────────────────────────────
BANDS = {
    "H1": [(0,15,"глубокий покой/истощение","вялость, замедленные реакции"),
           (16,40,"спокойствие","расслабленное состояние"),
           (41,70,"умеренная активация","бодрость, повышенное внимание"),
           (71,120,"fight-or-flight","мобилизация, болевой порог↑, ЧСС↑"),
           (121,170,"перегрузка","тремор, туннельное зрение, потеря мелкой моторики"),
           (171,200,"критическая","аритмия, риск остановки сердца")],
    "H2": [(0,10,"гипокортицизм","низкая энергия, слабый иммунитет, усталость"),
           (11,40,"норма","нормальный суточный ритм"),
           (41,80,"повышенный стресс","нарушения сна, раздражительность, аппетит↑"),
           (81,130,"хронический стресс","когн. снижение, иммунодепрессия"),
           (131,200,"кушингоидный","психотические эпизоды, атрофия")],
    "H3": [(0,15,"дефицит","гиперчувствительность к боли, дисфория"),
           (16,40,"пониженный","повышенная болевая чувствительность"),
           (41,70,"норма","нормальный болевой порог"),
           (71,120,"повышенный","анальгезия, лёгкая эйфория"),
           (121,170,"высокий","сильная анальгезия — не чувствует повреждений"),
           (171,200,"экстремальный","нечувствительность к боли, угнетение дыхания")],
    "H4": [(0,15,"дефицит","паранойя, антисоциальность, не доверяет"),
           (16,40,"пониженный","настороженность, социальная дистанция"),
           (41,70,"норма","нормальное социальное поведение"),
           (71,120,"повышенный","доверие, эмпатия, ↓критики к «своим»"),
           (121,170,"высокий","доверчивость, ин-групповой фаворитизм, внушаемость"),
           (171,200,"экстремальный","патологическая привязанность, обсессия")],
    "F1": [(0,10,"патологическое бесстрашие","не оценивает опасность, суицидальность"),
           (11,30,"хладнокровие","устойчивость к угрозам, спокойствие под огнём"),
           (31,60,"норма","адекватная реакция на угрозы"),
           (61,80,"тревога","бдительность, нервозность, плохой сон"),
           (81,95,"страх","избегание, затруднённое мышление"),
           (96,100,"паника","ужас, бегство/ступор, потеря контроля")],
    "F2": [(0,10,"глубокая ангедония","апатия, «зачем жить»"),
           (11,30,"ангедония","сниженная мотивация, безразличие"),
           (31,60,"норма","нормальная мотивация"),
           (61,80,"повышенная мотивация","энтузиазм, гиперфокус, риск"),
           (81,95,"эйфория","нереалистичный оптимизм, игнор рисков"),
           (96,100,"маниакальная","потеря критичности, одержимость")],
    "F3": [(0,5,"кома","нет сознания"),
           (6,15,"глубокий сон","пробуждение затруднено"),
           (16,30,"сонливость","замедленные реакции, микросон"),
           (31,60,"норма","нормальное бодрствование"),
           (61,80,"повышенная бдительность","обострённое внимание, сложно заснуть"),
           (81,95,"гиперактивация","бессонница, тремор, ажитация"),
           (96,100,"истощающая активация","делирий, конвульсии")],
    "F4": [(0,10,"feeblemind","нет связного мышления"),
           (11,30,"confusion","дезориентация, случайные действия"),
           (31,60,"норма","нормальное мышление и решения"),
           (61,80,"повышенный","обострённая аналитика"),
           (81,95,"гиперфокус","туннельное мышление"),
           (96,100,"зацикленность","обсессивные петли")],
    "F5": [(0,10,"тотальная амнезия","новые воспоминания не формируются"),
           (11,30,"выраженная амнезия","провалы, конфабуляции"),
           (31,60,"норма","нормальная память"),
           (61,80,"обострённая","быстрое запоминание, яркие воспоминания"),
           (81,100,"гипермнезия","навязчиво детальная память (ПТСР-риск)")],
    "F6": [(0,5,"полный паралич","нет движения"),
           (6,20,"тяжёлые нарушения","парез, не держит оружие"),
           (21,40,"нарушение координации","тремор, пошатывание, слабый хват"),
           (41,60,"норма","нормальная моторика"),
           (61,80,"повышенный тонус","скованность, ригидность"),
           (81,95,"спастичность","непроизвольные сокращения, клонус"),
           (96,100,"конвульсии","судороги")],
    "F7": [(0,10,"полная расторможенность","действия без раздумий, несдержанность"),
           (11,30,"импульсивность","снижен самоконтроль, рискованность"),
           (31,60,"норма","баланс импульса и контроля"),
           (61,80,"повышенный контроль","сдержанность, осторожность"),
           (81,95,"скованность","нерешительность, перфекционизм"),
           (96,100,"кататония (частичная)","блокада произвольных действий")],
}
H5_DEV = [  # H5 — по отклонению от базы пола (тиры z), не по абсолюту
    (-99, -2.5, "глубокий дефицит для пола", "апатия, слабость, депрессия"),
    (-2.5, -1.44, "пониженный для пола", "пассивность, низкая уверенность"),
    (-1.44, 1.44, "норма для пола", "нормальная ассертивность и мотивация"),
    (1.44, 2.5, "повышенный", "уверенность, склонность к доминированию, ↓страха"),
    (2.5, 3.3, "высокий", "агрессия, импульсивность, ↓эмпатии"),
    (3.3, 99, "экстремальный", "неконтролируемая агрессия, параноидная доминантность"),
]

# ─────────────────────────────────────────────────────────────────────────
# 3. ДЕРИВАТИВНЫЕ ШКАЛЫ (§7 SOUL_MIND, v0.1 — веса калибруемы; Σ=1.0).
#    Контекст базы: НЦ=100, SI=100, Will_ratio=1.0.
# ─────────────────────────────────────────────────────────────────────────
NC, SI, WILL = 100.0, 100.0, 1.0

def _ip_h1(h1):
    return clamp(100.0 * (1.0 - ((h1 - 70.0) / 70.0) ** 2))

def derived_scales(c):
    H1, H2, H3, H4 = c["H1"], c["H2"], c["H3"], c["H4"]
    F1, F2, F3, F4 = c["F1"], c["F2"], c["F3"], c["F4"]
    F5, F6, F7 = c["F5"], c["F6"], c["F7"]
    sero = clamp((F7 + (100 - F1)) / 2.0)
    return {
        "Самообладание": clamp(0.30*(100-F1) + 0.25*F7 + 0.15*(100-H2) + 0.15*(WILL*100) + 0.15*SI),
        "Болевой порог": clamp(0.50*H3 + 0.30*H1 + 0.20*(WILL*100)),
        "Ясность":       clamp(0.35*F4 + 0.25*F5 + 0.25*NC + 0.15*(100-H2)),
        "Внушаемость":   clamp(0.40*H4 + 0.35*(100-F7) + 0.25*((1-WILL)*100)),
        "Настроение":    clamp(0.30*(100-F1) + 0.30*F2 + 0.20*(100-H2) + 0.20*sero),
        "Драйв":         clamp(0.40*F2 + 0.35*F3 + 0.25*H1),
        "Координация":   clamp(0.50*F6 + 0.30*NC + 0.20*_ip_h1(H1)),
    }

def _norm_channels(sex):
    out = {}
    for k in ORDER_H + ORDER_F:
        if k == "H5":
            out[k] = CHANNELS["H5"]["mu_m"] if sex == "m" else CHANNELS["H5"]["mu_f"]
        else:
            out[k] = CHANNELS[k]["mu"]
    return out


# ─────────────────────────────────────────────────────────────────────────
# 4. СЛОЙ-1 БИО-ПОДТИП (ядро)
# ─────────────────────────────────────────────────────────────────────────
SPREAD = {"tight": 0.7, "normal": 1.0, "wide": 1.4}

def _band_lookup(key, v):
    for lo, hi, state, eff in BANDS[key]:
        if lo <= v <= hi:
            return state, eff
    return "вне шкалы", ""

def _tier(z):
    a = abs(z)
    if a < Z_OBYDENNO: return "обыденно"
    if a < Z_ZAMETNO:  return "заметно"
    if a < Z_VYDAY:    return "выдающееся"
    return "граничное"

def _dir(z):
    return "выше" if z > 0 else "ниже"

def _h5_descr(z):
    for zl, zh, state, eff in H5_DEV:
        if zl <= z < zh:
            return state, eff
    return "норма для пола", "нормальная ассертивность"

def roll_profile(rng, sex, spread="normal", couple=True):
    sf = SPREAD[spread]
    raw, mus, sgs = {}, {}, {}
    for k in ORDER_H + ORDER_F:
        if k == "H5":
            mu = CHANNELS["H5"]["mu_m"] if sex == "m" else CHANNELS["H5"]["mu_f"]
            sg = CHANNELS["H5"]["sigma"] * sf
        else:
            mu, sg = CHANNELS[k]["mu"], CHANNELS[k]["sigma"] * sf
        mus[k], sgs[k] = mu, sg
        raw[k] = rng.gauss(mu, sg)
    if couple:  # документированное сцепление (SOUL_MIND §4.3)
        K = 0.15
        dH5 = raw["H5"] - mus["H5"]; dH1 = raw["H1"] - mus["H1"]; dH3 = raw["H3"] - mus["H3"]
        raw["F1"] += -K * dH5 + 0.5 * K * dH1
        raw["F7"] += -K * dH5
        raw["F3"] += K * dH1
        raw["F2"] += K * dH3
    chan, chan_meta = {}, {}
    for k in ORDER_H + ORDER_F:
        v = round(clamp(raw[k], 0, CHANNELS[k]["max"]))
        chan[k] = v
        z = (v - mus[k]) / sgs[k] if sgs[k] else 0.0
        state, eff = (_h5_descr(z) if k == "H5" else _band_lookup(k, v))
        chan_meta[k] = {"value": v, "z": z, "tier": _tier(z), "dir": _dir(z),
                        "state": state, "effect": eff, "name": NAMES[k]}
    scales = derived_scales(chan)
    norm_scales = derived_scales(_norm_channels(sex))
    involvement = clamp(0.40*scales["Драйв"] + 0.30*(100-chan["F1"]) + 0.30*(100-chan["F7"]))
    return {"sex": sex, "spread": spread, "coupled": couple, "channels": chan_meta,
            "scales": scales, "norm_scales": norm_scales, "involvement": involvement}

def _involvement_label(v):
    if v < 35:  return "сторонится — события проходят как факт, без отпечатка"
    if v < 45:  return "сдержанно-избирательная — вовлекается редко и выборочно"
    if v < 55:  return "умеренная — вовлекается ситуативно"
    if v < 65:  return "активная — вовлекается охотно"
    return "лезет везде — насыщенная вовлечённость, всё оставляет след"

def _scale_delta_label(v, norm):
    d = v - norm; a = abs(d)
    if a < 8:  return "около нормы"
    word = "выше" if d > 0 else "ниже"
    return ("заметно " if a < 18 else "сильно ") + word + " нормы"

def temperament_label(profile):
    """Короткий ярлык характера из самых отклонившихся шкал."""
    sc, nm = profile["scales"], profile["norm_scales"]
    words = {
        "Самообладание": ("хладнокровный", "вспыльчивый"),
        "Драйв":         ("деятельный", "вялый"),
        "Внушаемость":   ("податливый", "кремень"),
        "Настроение":    ("светлый", "мрачный"),
        "Ясность":       ("сметливый", "тугодум"),
    }
    deltas = sorted(words, key=lambda k: abs(sc[k] - nm[k]), reverse=True)
    picked = [k for k in deltas if abs(sc[k] - nm[k]) >= 8][:2]
    if not picked:
        return "уравновешенный, обыденный"
    out = []
    for k in picked:
        out.append(words[k][0] if sc[k] >= nm[k] else words[k][1])
    return ", ".join(out)


# ─────────────────────────────────────────────────────────────────────────
# 5. ТАЛАНТЫ-ПОТЕНЦИАЛ (Фаза 1) — задатки, НЕ развитие.
# ─────────────────────────────────────────────────────────────────────────
TALENTS = ["руки/ремесло", "тело/атлетика", "слово/убеждение", "счёт/логика",
           "чутьё/наблюдательность", "воля/выдержка", "образ/искусство",
           "эмпатия/связь", "магический потенциал"]

def roll_talents(rng):
    out = []
    for t in TALENTS:
        v = round(clamp(rng.gauss(45.5, 10.1)))
        z = (v - 45.5) / 10.1
        out.append({"talent": t, "value": v, "tier": _tier(z), "dir": _dir(z)})
    out.sort(key=lambda d: d["value"], reverse=True)
    return out


# ─────────────────────────────────────────────────────────────────────────
# 6. СЕМЬЯ-АГЕНТ (Фаза 1)
# ─────────────────────────────────────────────────────────────────────────
PRESSURES = ["выживание/прокорм", "наследование ремесла", "удачный брак/союз",
             "образование/возвышение", "служение (вера/долг/корона)",
             "продолжение рода и имени", "искупление семейного пятна",
             "безопасность/незаметность"]

def _wealth_tier(v):
    if v < 15:  return "нищета"
    if v < 32:  return "бедно"
    if v < 68:  return "средне"
    if v < 85:  return "зажиточно"
    return "богато"

def _capability_tier(v):
    if v < 20:  return "не может (бессильна помочь)"
    if v < 40:  return "со скрипом (только в крайности)"
    if v < 65:  return "по мелочи (бытовые вопросы)"
    if v < 85:  return "открывает двери (связи/средства есть)"
    return "почти всё (рычаги и капитал)"

def roll_family(rng):
    w = clamp(rng.gauss(50, 18))
    cap_score = clamp(0.7 * w + 0.3 * rng.gauss(50, 15))
    wz = (w - 50) / 18.0
    n_press = wchoice(rng, [(1, 55), (2, 35), (0, 10)])
    pressures = rng.sample(PRESSURES, n_press) if n_press else []
    return {"wealth_value": round(w), "wealth_tier": _wealth_tier(w),
            "wealth_outlier": _tier(wz) != "обыденно",
            "capability": _capability_tier(cap_score),
            "pressures": pressures}


# ─────────────────────────────────────────────────────────────────────────
# 7. ГЛУБИНА (Фаза 1, если «случайно») + ВЕКТОР РАЗВИТИЯ (Фаза 4)
# ─────────────────────────────────────────────────────────────────────────
def roll_depth(rng):
    return wchoice(rng, [("статист", 70), ("НПС", 25), ("ключевой", 5)])

def _gap_tier(v):
    if v < -18: return "сильно недооценивает себя"
    if v < -6:  return "недооценивает себя"
    if v < 10:  return "оценивает трезво"
    if v < 24:  return "переоценивает себя"
    return "сильно переоценивает (эффект Даннинга-Крюгера)"

def roll_vector(rng, age):
    if age < 25:
        table = [("рост", 45), ("прорыв", 12), ("плато", 30), ("застой", 10), ("регресс", 3)]
    elif age < 45:
        table = [("плато", 50), ("рост", 22), ("застой", 15), ("регресс", 8), ("прорыв", 5)]
    else:
        table = [("плато", 45), ("застой", 28), ("регресс", 15), ("рост", 9), ("прорыв", 3)]
    level = wchoice(rng, table)
    gap = rng.gauss(8, 18)  # люди слегка переоценивают себя
    return {"level": level, "gap_value": round(gap), "gap_tier": _gap_tier(gap),
            "rare": level in ("прорыв",)}


# ─────────────────────────────────────────────────────────────────────────
# 8. ДОРОЖКА УДАЧИ (Фаза 2) — НЕ выравнивается между этапами!
# ─────────────────────────────────────────────────────────────────────────
def life_stages(age):
    bounds = [(0, 6), (7, 12), (13, 17), (18, 23)]
    s = 24
    while s <= age:
        bounds.append((s, min(s + 4, age)))
        s += 5
    out = [(a, min(b, age)) for (a, b) in bounds if a <= age]
    return out

def _luck_band(die):
    if die <= 2: return ("чёрная полоса", "≈ 2:1 в сторону беды")
    if die <= 4: return ("обычно", "≈ 1:1 благо/беда")
    return ("везучая", "≈ 2:1 в сторону блага")

def roll_luck_die(rng):
    die = rng.randint(1, 6)
    band, tilt = _luck_band(die)
    return {"die": die, "band": band, "tilt": tilt}

def roll_luck_track(rng, age):
    """Независимые броски по этапам (НЕ выравниваются — везение неравномерно)."""
    stages = life_stages(age)
    return [{"stage": "{}–{}".format(a, b), **roll_luck_die(rng)} for (a, b) in stages]

def roll_one_stage(rng, age, k):
    """Удача только k-го этапа (1-based), для пошаговой изоляции «не видя финала»."""
    stages = life_stages(age)
    if not (1 <= k <= len(stages)):
        return None
    # детерминированно от seed+индекс: одинаковый порядок при повторных вызовах
    for _ in range(k - 1):
        rng.randint(1, 6)
    a, b = stages[k - 1]
    return {"stage": "{}–{}".format(a, b), "index": k, "of": len(stages),
            **roll_luck_die(rng)}


# ─────────────────────────────────────────────────────────────────────────
# 9. ЭРОС (Фаза 3) — ориентация · салиентность · конформизм/девиация к традиции
# ─────────────────────────────────────────────────────────────────────────
# Дефолтное распределение ориентации (мир-плагин может переопределить).
ORIENTATIONS = [("гетеро", 80), ("би", 10), ("гомо", 6), ("асекс./деми", 4)]

# ПЛЕЙСХОЛДЕРЫ традиций. Это НЕ лор твоих рас — это нейтральные архетипы.
# Подставь реальную традицию расы/культуры через --eros-tradition или впиши сюда.
EROS_TRADITIONS = {
    "нейтральная": "(плейсхолдер) умеренная норма — ЗАМЕНИ реальной традицией расы/культуры",
    "моногамная": "пожизненная парность; ухаживание→союз; измена — стыд; роли по полу выражены",
    "клановая": "союзы как договор семей/клана; личное влечение вторично; верность роду",
    "пермиссивная": "свободные связи нормальны; ревность слабо табуирована; парность по выбору",
    "ритуализированная": "влечение вписано в обряд/сезон/иерархию; вне ритуала — сдержанность",
}
# Типы девиаций — клинико-структурные, НЕ графика и НЕ лор. Отыгрыш — за моделью.
DEV_CATEGORIES = [
    "объект влечения вне культурной нормы",
    "интенсивность вне нормы (гипер- или гиполибидо)",
    "инверсия ожидаемой роли относительно традиции",
    "табуированная направленность (запретный по культуре объект/связь)",
    "фиксация на конкретике (фетишизация признака/предмета)",
    "связка влечения с властью (доминирование↔подчинение)",
]
ATTRACTIONS = ["статус/власть", "забота/опека", "новизна/риск", "надёжность/защита",
               "ум/мастерство", "телесность/витальность", "уязвимость/хрупкость",
               "сила/доминирование", "преданность/служение"]

def _salience_tier(v):
    if v < 30:  return "низкая (при причинах — описывать кратко)"
    if v < 60:  return "средняя"
    if v < 82:  return "высокая"
    return "очень высокая (несущая ось личности)"

def _libido_drive(profile):
    """Драйв из либидо: из H5 (отклонение) и шкалы Драйв (Слой-1), не пере-катываем."""
    h5z = profile["channels"]["H5"]["z"]
    drv = profile["scales"]["Драйв"]
    score = clamp(50 + 12 * h5z + 0.4 * (drv - 50))
    if score < 35:  band = "низкое"
    elif score < 65: band = "среднее"
    else: band = "высокое"
    return {"value": round(score), "band": band}

def roll_eros(rng, profile, tradition_key):
    orientation = wchoice(rng, ORIENTATIONS)
    salience = clamp(rng.gauss(50, 17))
    libido = _libido_drive(profile)

    # Конформизм vs девиация к традиции (колокол; девиация — хвост, гейтить).
    cz = rng.gauss(0, 1)
    if abs(cz) < Z_OBYDENNO:
        conformity = {"mode": "в русле традиции", "tier": "обыденно",
                      "deviation": None, "intensity": None}
    else:
        intensity = ("мягкая" if abs(cz) < Z_ZAMETNO else
                     "выраженная" if abs(cz) < Z_VYDAY else "сильная")
        conformity = {"mode": "девиация от традиции", "tier": _tier(cz),
                      "deviation": rng.choice(DEV_CATEGORIES), "intensity": intensity}

    # Стыд/табу: чаще при девиации.
    if conformity["deviation"]:
        locus = wchoice(rng, [("внутренний стыд", 35), ("внешнее табу", 25),
                              ("и стыд, и табу", 30), ("ни стыда, ни табу", 10)])
    else:
        locus = wchoice(rng, [("ни стыда, ни табу", 70), ("внутренний стыд", 15),
                              ("внешнее табу", 15)])

    attractions = rng.sample(ATTRACTIONS, wchoice(rng, [(1, 45), (2, 45), (3, 10)]))
    return {
        "tradition_key": tradition_key,
        "tradition_desc": EROS_TRADITIONS.get(tradition_key, EROS_TRADITIONS["нейтральная"]),
        "orientation": orientation,
        "salience_value": round(salience), "salience_tier": _salience_tier(salience),
        "libido_drive": libido,
        "conformity": conformity,
        "shame_taboo": locus,
        "attractions": attractions,
    }


# ─────────────────────────────────────────────────────────────────────────
# 10. СТРУКТУРА ЛИСТА ИСТИНЫ ГМа (Фаза 3) — сколько и какого типа самообманов.
# ─────────────────────────────────────────────────────────────────────────
DISTORTIONS = ["искажение (искренне видит криво)", "ложь себе (знает, но прячет)",
               "слепое пятно (не знает, что не знает)"]

def roll_truth_sheet(rng):
    n = wchoice(rng, [(1, 45), (2, 35), (0, 8), (3, 12)])
    slots = [rng.choice(DISTORTIONS) for _ in range(n)]
    return {"count": n, "types": slots}


# ─────────────────────────────────────────────────────────────────────────
# 11. СБОРКА ПЕРСОНАЖА
# ─────────────────────────────────────────────────────────────────────────
def generate(rng, sex, age, spread, couple, depth, tradition_key):
    profile = roll_profile(rng, sex, spread, couple)
    return {
        "sex": sex, "age": age, "spread": spread, "coupled": couple,
        "profile": profile,
        "temperament": temperament_label(profile),
        "talents": roll_talents(rng),
        "family": roll_family(rng),
        "depth": depth if depth != "random" else roll_depth(rng),
        "luck_track": roll_luck_track(rng, age),
        "eros": roll_eros(rng, profile, tradition_key),
        "truth_sheet": roll_truth_sheet(rng),
        "vector": roll_vector(rng, age),
    }


# ─────────────────────────────────────────────────────────────────────────
# 12. РЕНДЕР (текст, лицом к модели)
# ─────────────────────────────────────────────────────────────────────────
PREAMBLE = (
    "// БРОСКИ для прогона персонажа. Кости брошены честно по колоколу — НЕ\n"
    "// перекатывай и НЕ подкручивай. Хвосты (заметно/выдающееся/граничное)\n"
    "// вводи в характер ТОЛЬКО оправдав лайфпас-гейтами (≥2 причины).\n"
    "// Фаза-1 — данность. Удачу/эрос/вектор в ПОШАГОВОМ режиме открывай по\n"
    "// мере прогона (не читай финал вперёд); в однопроходном — можно сразу.\n"
)

def _flag(meta):
    return "" if meta["tier"] == "обыденно" else "  ◀ {} {}".format(meta["tier"], meta["dir"])

def render_phase1(ch):
    p = ch["profile"]
    sex_ru = "М" if ch["sex"] == "m" else "Ж"
    L = ["─" * 64,
         "ФАЗА 1 — ДАННОСТЬ  ·  пол {}  ·  возраст {}  ·  глубина {}".format(
             sex_ru, ch["age"], ch["depth"]),
         "─" * 64,
         "\nСЛОЙ-1 БИО-ПОДТИП (генетическая база; НЦ=SI=100, воля отдохнувшая):",
         "  Темперамент-ярлык: {}".format(ch["temperament"]),
         "  H · гормональные каналы (0–200):"]
    for k in ORDER_H:
        m = p["channels"][k]
        L.append("    {:<3} {:<18} {:>3}  [{} — {}]{}".format(
            k, m["name"], m["value"], m["state"], m["effect"], _flag(m)))
    L.append("  F · функциональные системы (0–100):")
    for k in ORDER_F:
        m = p["channels"][k]
        L.append("    {:<3} {:<18} {:>3}  [{} — {}]{}".format(
            k, m["name"], m["value"], m["state"], m["effect"], _flag(m)))
    L.append("\n  Деривативные шкалы темперамента (§7):")
    inv = "  (обратная: ниже = устойчивее)"
    for name in ["Самообладание", "Болевой порог", "Ясность", "Внушаемость",
                 "Настроение", "Драйв", "Координация"]:
        v = round(p["scales"][name]); nrm = p["norm_scales"][name]
        tail = inv if name == "Внушаемость" else ""
        L.append("    {:<14} {:>3}/100 — {}{}".format(name, v, _scale_delta_label(v, nrm), tail))
    L.append("  Диспозиция вовлечённости (P16): {} [{}]".format(
        _involvement_label(p["involvement"]), round(p["involvement"])))

    L.append("\nТАЛАНТЫ-ПОТЕНЦИАЛ (задатки, НЕ развитие — растить через прогон):")
    top = [t for t in ch["talents"] if t["tier"] != "обыденно"]
    if top:
        for t in top:
            L.append("    ⚑ {:<24} {:>3}  ({} {})".format(t["talent"], t["value"], t["tier"], t["dir"]))
    else:
        L.append("    без ярких задатков — ровный профиль (1 умеренный максимум: {})".format(
            ch["talents"][0]["talent"]))

    f = ch["family"]
    L.append("\nСЕМЬЯ-АГЕНТ:")
    L.append("    Достаток: {} [{}]{}".format(
        f["wealth_tier"], f["wealth_value"], "  ◀ выброс" if f["wealth_outlier"] else ""))
    L.append("    Способность действовать: {}".format(f["capability"]))
    L.append("    Давит на ребёнка: {}".format(", ".join(f["pressures"]) if f["pressures"] else "ничего особо"))
    return "\n".join(L)

def render_luck(ch):
    L = ["\nДОРОЖКА УДАЧИ (Фаза 2 · НЕ выравнивается · ⚠ в пошаговом режиме открывай по одному):"]
    for s in ch["luck_track"]:
        L.append("    этап {:<7} куб {} → {:<15} ({})".format(
            s["stage"], s["die"], s["band"], s["tilt"]))
    return "\n".join(L)

def render_one_stage(s):
    return ("─" * 64 + "\nУДАЧА ЭТАПА {}/{}  ·  возраст {}\n".format(s["index"], s["of"], s["stage"])
            + "─" * 64 + "\n    куб {} → {} ({})".format(s["die"], s["band"], s["tilt"]))

def render_present(ch):
    e, t, v = ch["eros"], ch["truth_sheet"], ch["vector"]
    L = ["\nЭРОС (Фаза 3):",
         "    Традиция расы/культуры [{}]: {}".format(e["tradition_key"], e["tradition_desc"]),
         "    Ориентация: {}".format(e["orientation"]),
         "    Салиентность: {} [{}]".format(e["salience_tier"], e["salience_value"]),
         "    Драйв из либидо: {} [{}]".format(e["libido_drive"]["band"], e["libido_drive"]["value"])]
    c = e["conformity"]
    if c["deviation"]:
        L.append("    ⚑ Девиация от традиции [{}, {}]: {}  (вводить через лайфпас-гейты!)".format(
            c["tier"], c["intensity"], c["deviation"]))
    else:
        L.append("    В русле традиции (без девиаций)")
    L.append("    Стыд/табу: {}".format(e["shame_taboo"]))
    L.append("    Что влечёт: {}".format(", ".join(e["attractions"])))

    L.append("\nЛИСТ ИСТИНЫ ГМа — структура (содержание дописывает модель):")
    if t["count"] == 0:
        L.append("    0 несущих самообманов — редкая самопрозрачность")
    else:
        for i, ty in enumerate(t["types"], 1):
            L.append("    {}) {}".format(i, ty))

    L.append("\nВЕКТОР РАЗВИТИЯ (Фаза 4):")
    L.append("    Уровень: {}{}".format(v["level"], "  ◀ редкое" if v["rare"] else ""))
    L.append("    Зазор самооценка↔реальность: {} [{}]".format(v["gap_tier"], v["gap_value"]))
    return "\n".join(L)


# ─────────────────────────────────────────────────────────────────────────
# 13. JSON
# ─────────────────────────────────────────────────────────────────────────
def to_jsonable(ch, idx, sections):
    p = ch["profile"]
    out = {"index": idx, "sex": ch["sex"], "age": ch["age"], "depth": ch["depth"],
           "spread": ch["spread"], "coupled": ch["coupled"]}
    if "phase1" in sections:
        out["context"] = {"NC": NC, "SI": SI, "Will_ratio": WILL}
        out["temperament"] = ch["temperament"]
        out["channels"] = {k: {kk: (round(vv, 3) if isinstance(vv, float) else vv)
                               for kk, vv in m.items()} for k, m in p["channels"].items()}
        out["scales"] = {k: round(v, 1) for k, v in p["scales"].items()}
        out["involvement"] = round(p["involvement"], 1)
        out["involvement_label"] = _involvement_label(p["involvement"])
        out["talents"] = ch["talents"]
        out["family"] = ch["family"]
    if "luck" in sections:
        out["luck_track"] = ch["luck_track"]
    if "present" in sections:
        out["eros"] = ch["eros"]
        out["truth_sheet"] = ch["truth_sheet"]
        out["vector"] = ch["vector"]
    return out


# ─────────────────────────────────────────────────────────────────────────
# 14. SELFTEST
# ─────────────────────────────────────────────────────────────────────────
def selftest():
    ok = True
    def check(cond, msg):
        nonlocal ok
        if not cond: ok = False
        print("  [{}] {}".format("OK " if cond else "FAIL", msg))

    check(_band_lookup("F1", 5)[0] == "патологическое бесстрашие", "F1=5 → бесстрашие")
    check(_band_lookup("F1", 45)[0] == "норма", "F1=45 → норма")
    check(_band_lookup("F7", 20)[0] == "импульсивность", "F7=20 → импульсивность")
    check(_tier(0.0) == "обыденно" and _tier(2.0) == "заметно"
          and _tier(3.0) == "выдающееся" and _tier(4.0) == "граничное", "тиры по z")
    check(clamp(250) == 100 and clamp(-5) == 0, "clamp границы")
    check(round(_ip_h1(70)) == 100, "ip(H1=70)=100")
    check(CHANNELS["H5"]["mu_m"] > CHANNELS["H5"]["mu_f"], "H5 муж>жен центр")

    # новые модули
    check(_wealth_tier(8) == "нищета" and _wealth_tier(50) == "средне"
          and _wealth_tier(95) == "богато", "тиры достатка")
    check(_luck_band(1)[0] == "чёрная полоса" and _luck_band(3)[0] == "обычно"
          and _luck_band(6)[0] == "везучая", "полосы удачи")
    check(len(life_stages(34)) == 7 and life_stages(34)[-1] == (34, 34), "этапы жизни до 34")
    check(_salience_tier(20).startswith("низкая") and _salience_tier(90).startswith("очень"),
          "тиры салиентности")
    # дорожка удачи НЕ выравнивается: допускаем серии одной полосы
    rngL = random.Random(0)
    track = roll_luck_track(rngL, 60)
    check(all(1 <= s["die"] <= 6 for s in track), "кубы удачи в 1..6")
    # детерминизм всей сборки по seed
    a = generate(random.Random(11), "m", 30, "normal", True, "статист", "нейтральная")
    b = generate(random.Random(11), "m", 30, "normal", True, "статист", "нейтральная")
    check(json.dumps(a, ensure_ascii=False, sort_keys=True, default=str)
          == json.dumps(b, ensure_ascii=False, sort_keys=True, default=str),
          "детерминизм сборки при seed")
    # per-stage: повторный вызов того же k даёт тот же бросок
    s1 = roll_one_stage(random.Random(5), 40, 3)
    s2 = roll_one_stage(random.Random(5), 40, 3)
    check(s1 == s2, "per-stage детерминизм по seed+индекс")
    check(roll_one_stage(random.Random(5), 40, 99) is None, "per-stage вне диапазона → None")
    # эрос: девиация несёт интенсивность и стыд/табу-локус
    eros = roll_eros(random.Random(2), a["profile"], "моногамная")
    check("orientation" in eros and "conformity" in eros and "shame_taboo" in eros,
          "эрос: поля на месте")

    print("\nSELFTEST:", "ВСЁ OK" if ok else "ЕСТЬ ПРОВАЛЫ")
    return 0 if ok else 1


# ─────────────────────────────────────────────────────────────────────────
# 15. CLI
# ─────────────────────────────────────────────────────────────────────────
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Рандомизатор бросков для генератора «Оттенки желаний».")
    ap.add_argument("--count", type=int, default=1, help="сколько персонажей")
    ap.add_argument("--sex", choices=["m", "f", "random"], default="random")
    ap.add_argument("--age", type=int, default=None, help="возраст (по умолч. случайный взрослый)")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--spread", choices=list(SPREAD), default="normal")
    ap.add_argument("--no-couple", action="store_true", help="отключить сцепление каналов")
    ap.add_argument("--depth", choices=["random", "статист", "нпс", "ключевой"], default="random")
    ap.add_argument("--eros-tradition", default="нейтральная",
                    help="ключ традиции эроса ({} или впиши свой)".format("/".join(EROS_TRADITIONS)))
    ap.add_argument("--luck", action="store_true", help="показать всю дорожку удачи (однопроходный режим)")
    ap.add_argument("--stage", type=int, default=None, help="показать удачу только K-го этапа (пошагово)")
    ap.add_argument("--present", action="store_true", help="показать эрос+истину+вектор (Фаза 3–4)")
    ap.add_argument("--all", action="store_true", help="всё сразу (для однопроходного промта)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    rng = random.Random(args.seed)
    couple = not args.no_couple

    # --stage: только один этап удачи (пошаговая изоляция), без остального.
    if args.stage is not None:
        age = args.age if args.age is not None else 40
        s = roll_one_stage(rng, age, args.stage)
        if s is None:
            print("Этап {} вне диапазона (возраст {} → {} этапов).".format(
                args.stage, age, len(life_stages(age))))
            return 1
        print(json.dumps(s, ensure_ascii=False) if args.json else render_one_stage(s))
        return 0

    sections = {"phase1"}
    if args.luck or args.all: sections.add("luck")
    if args.present or args.all: sections.add("present")

    chars = []
    for _ in range(max(1, args.count)):
        sex = args.sex if args.sex != "random" else rng.choice(["m", "f"])
        age = args.age if args.age is not None else wchoice(
            rng, [(rng.randint(16, 24), 30), (rng.randint(25, 39), 40),
                  (rng.randint(40, 59), 22), (rng.randint(60, 80), 8)])
        chars.append(generate(rng, sex, age, args.spread, couple, args.depth, args.eros_tradition))

    if args.json:
        print(json.dumps([to_jsonable(c, i + 1, sections) for i, c in enumerate(chars)],
                         ensure_ascii=False, indent=2))
    else:
        print(PREAMBLE)
        for i, ch in enumerate(chars, 1):
            print("═" * 64)
            print("ПЕРСОНАЖ #{}".format(i))
            print(render_phase1(ch))
            if "luck" in sections: print(render_luck(ch))
            if "present" in sections: print(render_present(ch))
            print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
