# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian vault containing worldbuilding materials for a tabletop RPG setting called "Земля-под-поясом" (Land Under the Belt). The project is entirely in Russian and contains lore, game sessions, NPCs, game mechanics, and plot materials.

## Vault Structure

- **Root markdown files** - Core world lore documents:
  - `Космология.md` - Cosmology and fundamental laws (dual suns, asteroid belt as souls, gas giant Ferryn)
  - `Боги и высшие сущности.md` - Gods and higher beings (Lian, Seraphiel, Divine Beasts)
  - `История и мифология.md` - Timeline and historical epochs
  - `Геополитика.md` - Nations, races, and factions
  - `Магия и её традиции.md` - Magic systems and traditions by nation
  - `Экономика мира.md` - Economy, resources (metal scarcity), and technologies

- **`0 Алирн/`**, **`0 Виника/`**, **`0 Сильгаррон/`** - Different campaign/game arcs with session notes (`Игра XX` files)

- **`0_Промты/`** - AI prompts and scene systems (including English translations like `Scenes_eng.md`)

- **`Игромеханика/`** - Game mechanics:
  - `Ритуалистика фулл.md` - Full ritual system
  - `Владыки.md` - Demon lords
  - `Металлы.md` - Metals system
  - `Гадальные карты.md` - Divination cards
  - `Сила (формулы).md` - Power formulas

- **`Персонажи/`** - All named entities:
  - `Игроки/` - Player characters (Агнейр, Эрр'Кин, Дракх'Мегас, Софина и Соннет)
  - `НПС/` - NPCs from gods to villagers
  - `Ведьмы/` - 18 witches anchored to concepts
  - `Демоны/` - 18 individual demons + subfolders Дом Ра, Семья Венрас
  - `Демоническая база легиона/` - Legion base "Яркий серпентарий" in the Rift
  - `Расы/` - 11 races (Еналы, Мелеефаты, Айни, etc.)
  - `Мифы/` - Mythology collections

- **`Сюжет/`** - Plot materials, story arcs, and scenario concepts

## Key World Concepts

- **Dual Suns (Phobos & Deimos)** - Binary star system with eschatological implications
- **Asteroid Belt** - Physical manifestation of souls; each sentient being has a corresponding asteroid
- **Lian** - Imprisoned goddess of darkness beneath the surface, source of Creation Energy
- **Provál Karii (Karia Rift)** - Breach leading to Lian's prison, center of magical research
- **Metal Scarcity** - No ore deposits; metals extracted from fish bones and ice
- **Plétenie (Weaving)** - Primary magic system using soul-thread manipulation

## Working with This Vault

- All content is written in Russian
- Uses Obsidian wiki-links syntax: `[[Page Name]]` and `[[Page Name|Display Text]]`
- Many files contain YAML frontmatter for Obsidian metadata
- Images are stored as `Pasted image YYYYMMDDHHMMSS.png` in root
- The `.obsidian/` folder contains Obsidian configuration (do not modify)

## TL;DR Files

Every folder (except `0`-prefixed and hidden) contains a `TL;DR.md` — concise summary of that folder's unique content. Root `TL;DR.md` is the main entry point.

Rules for working with TL;DR files:
- **Before working with a folder** — read its `TL;DR.md` first to get context and understand what's unique/atypical there
- **After modifying folder content** (adding, removing, or significantly changing files) — update the corresponding `TL;DR.md` to reflect the changes
- **When creating a new folder** — create a `TL;DR.md` in it following the same format (one-line summary in `>` quote, "Уникальное" section, optional "Учитывать" section)
- **When deleting a folder** — delete its `TL;DR.md` as well
- **Format**: keep TL;DRs maximally concise; use wiki-links to reference key files; use tables for navigation in overview-level TL;DRs
- **Do not** treat TL;DR files as source-of-truth for lore — they are navigational aids; always read the actual files for authoritative content

## Content Guidelines

When assisting with this project:
- Maintain consistency with established lore (cosmology, races, magic systems)
- Respect the Russian language and naming conventions
- Follow Obsidian markdown conventions (wiki-links, callouts)
- Reference existing documents when expanding lore to avoid contradictions
