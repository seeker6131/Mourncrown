---
name: mourncrown-dev
description: Fast, accurate bug-fixing and feature work on Mourncrown (Phaser 3 + TypeScript + Cloudflare Workers) — reproduce in the real game first, find the root cause, fix server + client, test, report in Thai, deploy only on "อัพ". Use for every player report, bug, balance change or new feature in this repo.
---

# Mourncrown — work fast, analyse right, change once

Read `HANDOFF.md` §0 first (rules + latest state). The director writes short Thai; answer in short Thai a non-coder understands, with risks, PixelLab balance and a Discord text in a code block.

## 1. Understand before touching (the step that saves re-dos)
1. Restate the ask in one line. If it can mean two things that lead to different code, ask ONE short question; otherwise pick the obvious reading and say so.
2. `git log --oneline -15` + grep the HANDOFF: maybe it is already done / half done / hidden (example: the "storage" a player asked for already existed behind the 👥 window).
3. Find who owns the behaviour: client `src/scenes/TopDownScene.ts`, `src/world/tdCombat.ts`, UI `src/ui/panels.ts`, rules `src/server/handlers.ts` (`act()` = server-checked), room `src/server/mapSim.ts` + `server/worker.ts`. Note `SOLO_MONSTERS = true`: common monsters run in each player's game, the room runs only roaming bosses / raid.

## 2. Reproduce in the real game (Playwright, offline-safe)
```js
// node script; chromium is preinstalled. Block the live server so no real accounts are touched.
await page.route(/workers\.dev|googleapis|accounts\.google/, r => r.abort());
await page.goto('http://localhost:5173/');   // npx vite --port 5173 (background)
await page.waitForTimeout(6000);
await page.evaluate(() => window.__game.scene.start('TopDown', { stage: 1 }));   // 0 village · 1-50 maps · 100 wild · 200-204 dungeon · 300 raid
// window.__tdS() = player state, scene 'TopDown' (hero, combat, portals…), scene 'TdUI' (.panels.open('bag'))
// before a new start: getScenes(true).forEach(s => s.scene.stop()), wait 300 ms · daily runs: delete __tdS().dng
```
Measure, do not guess: positions before/after, `isBlocked`, counts, screenshots (`deviceScaleFactor: 1`, look at them). Repeat a random case 5-10 times (a dungeon spawn bug showed in 5 of 6 runs from map 1, never from the village).

## 3. Fix the cause, both sides
- Valuables / anything cheatable → server (`handlers.ts` / `mapSim.ts`) and client; never trust the client.
- New Thai text → English in `src/core/i18n.ts` (no duplicate keys: tsc fails on them).
- Settings that must sync go in an existing synced field (`pot`, `uiOpt`, `lootOpt`…) — the server keeps only `CLIENT_KEYS` (server/worker.ts).
- Scene objects stored on the scene must be reset in `create` (the scene instance survives `restart`).
- Keep diffs small; follow the file's comment style (a short reason in brackets, "director:" / "player feedback").

## 4. Prove it
`npx tsc --noEmit -p .` · server types `npx tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --resolveJsonModule server/worker.ts` (6 old errors are normal) · `npm test` (add a test in `tests/` for server rules) · `npm run build` · re-run the Playwright repro: before vs after numbers.

## 5. Ship only on "อัพ"
- Until then: `git commit … [skip ci]` + push to the work branch (`ccr-dcfcac78-b3qj60`).
- On "อัพ": server first if server code changed — `python3 -I tools/deploy_server.py` (check `curl https://mourncrown.egowenit.workers.dev/online` and the raid hours 12:00/18:00/21:00 Bangkok first); then push without `[skip ci]` (or run the workflow `deploy.yml` on the branch if the last commit was `[skip ci]`); confirm the run succeeded and the live bundle changed.
- Update news popup `src/core/changelog.ts` (new id on top, + i18n) only with what the director allows — never the secret tweaks.
- Update `HANDOFF.md` §0 after each piece of work.

## 6. Report (every answer)
What changed (player words) · what was tested and how · what was NOT tested · risks · PixelLab balance · Discord text in a code block.
