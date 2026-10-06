# LarvaLoop app (working name "WasteLess")

Inventory and waste platform for F&B SMEs: predicts waste before you buy, recommends order quantities, and routes BSF-eligible waste to black soldier fly farms.

## Run

```bash
npm install          # also generates the Prisma client
npm run db:reset     # create SQLite DB + seed 90 days of mock kopitiam data
npm run dev          # http://localhost:3000
```

`npm test` runs the model and backtest unit tests. Re-run `npm run db:reset` before a demo to restore clean data (the seed is relative to today's date). `npm run pitch` re-runs the backtests behind the slide numbers (`docs/pitch-numbers.md`).

**Start here:** [docs/HANDOVER.md](docs/HANDOVER.md) has the user flow, design system, demo guide and open UX work.

## Where things are

- `lib/forecast/`: demand (day-of-week moving average + holiday multiplier), forecast errors and buffers (`uncertainty.ts`), Monte Carlo expiry risk (`expiry.ts`), ordering-policy simulation (`waste.ts`)
- `lib/queries.ts`: every number the screens show; `lib/demo-data.ts`: the simulated kopitiam; `scripts/pitch-analysis.ts`: backtests
- `lib/calendar.ts`: Malaysian public holidays, Ramadan and school holidays (approximate dates)
- `lib/config.ts`: app name, BSF threshold, CO₂e factor (an assumption to be verified)
- `prisma/seed.ts`: loads the simulated kopitiam (over-orders perishables by ~20%)
- `app/`: Dashboard `/`, Log waste `/log`, Smart order `/order`, BSF pickup `/bsf`, ESG `/esg` and printable report `/esg/report`

SQLite is for local demos; switch the Prisma datasource to Postgres to deploy on Vercel.
