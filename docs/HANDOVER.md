# Handover: LarvaLoop app (working name "WasteLess")

For whoever takes over UX and visual polish. The model, data and numbers are done and tested. Your job is to make the flow obvious and the screens look great **without changing what the numbers mean**.

## 1. Run it

```bash
npm install
npm run db:reset     # (re)load 90 days of simulated kopitiam data, relative to today
npm run dev          # http://localhost:3000
npm test             # model + backtest unit tests
npm run pitch        # regenerate the backtested headline numbers (lib/pitch/results.json, docs/pitch-numbers.md)
```

Run `npm run db:reset` right before every demo: logging waste and booking pickups change the data.

The app name is a placeholder: change `APP_NAME` in `lib/config.ts`. The landing page in `public/larvaloop/` calls the product **LarvaLoop**.

## 2. The story the app tells

Input → brain → output:

| Input | Where it comes from | In the app |
|---|---|---|
| Purchases, stock, expiry dates | ERP / supplier invoices, synced | Data sources strip on Home |
| Sales | POS, synced | Data sources strip on Home |
| Holidays, Ramadan, school holidays | Built in (`lib/calendar.ts`) | Forecast captions |
| **Waste** | **Staff, on a phone, 3 taps** | `/log` |

The brain has three parts:
- a forecast (same-weekday average, holiday adjusted)
- a buffer sized to each item's own forecast errors
- simulations: 1,000 futures per batch for expiry risk, and 200 four-week futures for the order comparison

Outputs:
- money lost
- use-first alerts
- the smart order
- BSF pickups
- the ESG report

All data is **simulated** (`lib/demo-data.ts`) and labelled as such. Keep the "Demo data" badges.

## 3. User flow (screens)

| Route | Purpose | Key pieces |
|---|---|---|
| `/` | Landing page (static, `public/larvaloop`) | LarvaLoop story; **Open the app** → `/log` |
| `/insights` Insights | "How much am I losing and what do I do today?" | Data sources strip → RM lost (30 days) → Waste forecast and net saving → **Use first** alerts with the animated *1,000 futures* chart (`UseFirst`, `FuturesChart`) → weekly chart → top wasted items → ESG/BSF tile |
| `/log` | Staff log waste in under 10 seconds | Item grid, amount, reason, auto cost, optional photo. After saving, the **What changed** card (`WhatChanged`) shows before → after for RM lost, the BSF pile, the item's risk and its next order |
| `/order` | What to buy | Net saving headline + "how it works" + savings by item chart; **Next deliveries** grouped by each item's real next delivery day (from its last delivery + schedule; the order is sized for that day), each group with a **Send order** WhatsApp-style chat preview (`WhatsAppOrder`, supplier reply is simulated); then **Change your standing order** with its own send button. Every item has a **Why this order?** button (`WhyOrder`). It opens a bottom sheet (phone) or dialog (laptop) with plain-English takeaways, the forecast band (`ForecastBand`), that item's 1,000-futures fan (`FuturesChart`) and the rotating **3D cost landscape** (`WasteLandscape`). The data comes from `/api/why/[id]` → `getWhy()` and loads on open. `/order?why=<id>` opens a panel directly |
| `/bsf` | BSF pickup loop | Pile vs 20 kg load, schedule a pickup (frass or credit), confirm collection, batch traceability |
| `/esg`, `/esg/report` | ESG summary + print-ready report (GRI 306 referenced) | KPIs, monthly chart, full A4 report with methodology |

## 4. Design system

- **Palette:** LarvaLoop "Forest Loop Bright" (from `public/larvaloop/style.css`). Tailwind tokens are in `app/globals.css`: `canvas surface line ink muted brand brand-strong brand-soft lime lime-deep cream larva larva-line loss warn`. Charts use `lib/palette.ts` (`PALETTE`, `alpha()`). Never hard-code hex in components.
- **Loss red:** LarvaLoop has no red, so `loss` (`#b4432f`, a muted brick) is used **only** for money lost. Amber (`warn`) is for expiry risk.
- **Type:** Fraunces (serif) for `h1`/display, DM Sans for everything else. Numbers use `.num` (tabular figures).
- **Primitives:** `components/ui.tsx` (`Card`, `CardHeader`, `PageTitle`, `Stat`, `Progress`). Cards are `rounded-2xl` on white with `border-line`.
- **Layout:** mobile-first (bottom tab bar: Log waste, Insights, Smart order, ESG; BSF has no tab and opens from the Insights tile); desktop uses the top nav and 2-column grids. Check every change at **390 px** and **1280 px**.

## 5. Where the numbers come from (do not break)

- `lib/queries.ts` is the single source of numbers for the screens: `getItemInsights`, `getDashboard`, `useFirstAlerts`, `getLandscape`, `getChangeSnapshot`, `getDataSources`. The UI should only format them.
- Weekly forecast figures are **averages over the next 4 weeks**. The saving is **net** (waste saved minus extra missed sales, with a missed sale costing 3× the ingredient, `LOST_SALE_MULT`). Keep those labels.
- "Enough stock in N of 10 likely delivery cycles" is the service level. Don't reword it as "% of demand".
- Assumptions to keep visible:
  - CO₂e factor of 0.5 kg per kg (`CO2E_PER_KG_DIVERTED`)
  - frass yield of 20%
  - lost sale = 3× ingredient cost
  - all data is simulated
- The heavy simulations are cached until the data changes. The first load after a change takes about 0.7 s, and Order with a new 3D item about 0.4 s.

## 6. Open UX work and ideas

**Must-do polish**
- [x] On phones the 3D chart waits for a "Tap to rotate" tap, so swiping scrolls (done).
- [ ] On Home, the first "Use first" alert is often a batch expiring *today* at 100% risk, so its fan chart is solid red. For the demo, tap **Tofu** or **Fresh milk** for a more interesting fan, or default-select the most interesting alert.
- [ ] The seed has no waste photos, so the ESG "photo evidence" rate is 0%. Attach sample photos to some logs in `lib/demo-data.ts` if this matters.
- [ ] Rename to LarvaLoop (`APP_NAME`) and swap the "W" logo tile for the LarvaLoop mark.

**"3D-in-2D" visual ideas** (depth without WebGL, cheap and readable)
- **Isometric stock shelf** on Use first: each batch as an isometric crate whose fill level shows stock left, and whose colour (forest → amber → brick) shows expiry risk. Tapping a crate opens the 1,000-futures fan.
- **Layered "loop" diagram** for the BSF flow (bin → larvae → feed/frass → farm), using the LarvaLoop loop disc style from `public/larvaloop/` with a soft `--shadow-card` and lime highlights.
- **Pseudo-3D bar pairs** for usual vs smart orders: two stacked translucent blocks per item, with a CSS `transform: skew` side face, so the gap between them is the saving.
- **Depth on hero numbers:** a large Fraunces figure on a mint card with a subtle offset shadow layer, like LarvaLoop's `stat-big`.
- Keep the real 3D chart (Plotly) only in the "Why this order?" panel, where the "valley" shape carries meaning.

## 7. Demo guide

**60 seconds (main pitch)**

| Time | Screen | Say / do |
|---|---|---|
| 0–10 s | Home, data sources strip | "Kopitiam Ah Seng's ERP and POS are connected: 90 days of purchases, stock and sales synced automatically. That's how we know they lost **RM628** in the last 30 days." |
| 10–25 s | Phone → **+ Log** | "The only manual part: staff log waste. Tomatoes, 2 kg, expired, three taps." Submit. |
| 25–40 s | What changed card | "Instantly: money lost goes up by RM13, the expired batch drops out of the risk list, the next tomato order is re-sized for the stock that's left, and 2 kg joins the BSF pickup pile." |
| 40–55 s | Home → Use first → tap **Tofu**; then Order | "1,000 simulated futures: 97% chance this tofu expires by Thursday, so make it today's special." On Order: "Following the smart order saves about **RM137 a week**, net of extra sell-outs." |
| 55–60 s | (say) | "The same logs feed BSF pickups and an ESG report a bank can read." |

**If there's time / Q&A**
- Order → Chicken card → **Why this order?**: read the first two takeaways out loud ("skip this delivery: your shelf already covers 3 days; then 4 kg instead of 5 kg; in a normal week that's ~RM13 lost instead of ~RM35"), then rotate the 3D landscape ("your usual order sits on the slope, the smart order in the valley, even in busy weeks"). Every item has its own panel, and all of them are computed live.
- BSF → Schedule pickup → Confirm collected → ESG updates.
- The slides: backtested evidence (numbers and tables in `docs/pitch-numbers.md`, regenerate with `npm run pitch`).

**Before presenting**
- Run `npm run db:reset`, then open each page once to warm the caches.
- Show 3D on the laptop, not the phone.
- Have a screen recording as a backup.
