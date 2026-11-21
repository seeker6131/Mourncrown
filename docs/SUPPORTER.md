# 👑 Supporter tiers ("ผู้ร่วมสร้างตำนาน"), for the OBT launch. Plan only, not built yet (director 18 Nov)

The idea, in a players' words: "a program that pulls in people who top up". Reference: another game's "first founders" window
(cumulative spend → tiers, a top-up bonus %, cosmetic-only rewards, a supporters' wall). **We make our own design, names and art
— never copy that game's names, layout or pictures.**

## Rules (keep)
- **Cosmetic and comfort only, no power.** Our own rule: the diamond wheel has no pay-to-win. Diamonds buy only looks /
  comfort, so a diamond bonus % is not power either.
- Counted from **real payments only**: D1 `payments` rows with `status = 'ok'` (the slip check passed). Never from diamonds
  given by the admin, never from the wheel.
- **Counted per account** (all its characters). Reaching a tier unlocks it and every tier below. Tiers never go back down.
- **OBT season only:** the count runs from OBT day to a closing date the director picks (e.g. 30 days). The items stay after it
  closes; a later season can start a new count.
- Shown in the game: the tiers, what each gives, how much more to the next one. **No odds** (nothing is random here).

## Tiers (draft numbers, the director sets the final ones)
| Tier | Paid in total | Top-up bonus 💎 | Rewards (all cosmetic) |
|---|---|---|---|
| 1 | 99 ฿ | +5% | Title "ผู้ร่วมสร้างตำนาน" • name on the supporters' wall • a Discord role (by hand) |
| 2 | 299 ฿ | +10% | A small crown badge before the name • the "light trail" walk effect |
| 3 | 699 ฿ | +15% | A supporter aura • a gold frame on the market stall / chat name • **supporter wing** (needs art) |
| 4 | 1,500 ฿ | +20% | Name carved on a monument in the village (the art can be made from what we have) |
| 5 | 3,000 ฿ | +25% | Gold-coloured mount glow • gold name frame |
| 6 | 5,000 ฿ | +30% | **Supporter wing, higher tier** (needs art) • choose the title's colour |
| 7 | 10,000 ฿ | +35% | Title "ผู้ค้ำจุนแห่ง Mourncrown" • **name one NPC** (the admin approves the name) |

The bonus % applies to the diamonds of every **diamond pack** bought after reaching the tier (not VIP cards). The pack's own
bonus stays; this one is added on top.

## Build plan (files)
- `src/systems/supporter.ts`: `SUP_TIERS` (thb, bonus, rewards), `supTier(paidThb)`, `supBonus(tier)`, `SUP_OPEN`, `SUP_FROM / SUP_TO` (season dates).
- Server (`server/worker.ts`):
  - On a successful slip (`/pay/slip` → payment ok): add `thb` to the account's `supPaid` (in the Player save, server-owned, not a
    client key) when the time is inside the season. Then apply the tier's bonus to that pack's diamonds and grant any newly
    reached tier's rewards (titles, badges, aura flags). Write a `flag` row `support:tierN`.
  - A public read `/supporters` (names that opted in + tier) for the wall page. Opt-in only (`supWall: true`).
- Game UI: a "👑 ผู้ร่วมสร้างตำนาน" window (menu + the top-up window): a progress bar, the tier list, opt-in switches (show on the
  wall, hide the badge), the title-colour choice, and the NPC-name request box (goes to the back office).
- Web page `public/supporters.html`: the wall (names by tier, our own style).
- Back office: a "👑 ผู้สนับสนุน" tab listing each account's total, tier and NPC-name requests to approve.
- Art (talk to the director first, PixelLab balance $5.68): 2 supporter wings, a crown badge icon, an aura colour (the aura can
  reuse the existing aura with a new tint, at no cost).
- Tests: tiers from totals, bonus applied once per payment, nothing counted outside the season, admin-given diamonds not counted.

## Risks
- Money law / store rules: rewards must be described exactly (no hidden odds, no "power"). Cosmetic only keeps this simple.
- Refund or charge-back disputes: the slip check is final. If a payment is reversed by hand, the admin lowers `supPaid` (add a
  back-office button).
- Do not promise things we cannot make on time (the NPC naming needs the admin to rename an NPC in code: a small job).

---
# 🖥 A game client that keeps playing in the background (player ask, 18 Nov; "a future offline mode")
Browsers pause a hidden tab: when another window covers the game it stops. Options:
1. **Desktop app (Windows), Electron or Tauri** around the same web game with background throttling switched off. It keeps running when
   covered or minimised. About 1-2 days of work, plus code-signing (without it Windows shows a warning).
2. **Android app** (Capacitor) with a foreground service: keeps running with the screen off. More work, and a Play Store listing.
3. **Nothing in the browser can do it** (a PWA on a phone also pauses).
Risk: 24-hour AFK farming → more gold / items in the economy. The daily energy already caps gathering, but monster farming is not
capped. If we build it, add an AFK limit first (e.g. auto-hunt rewards drop after N hours a day).
