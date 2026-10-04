# Loka Living

D2C e-commerce platform for eco-friendly wood and rattan furniture. Furniture is a high-involvement purchase, so the product is built around two goals: help buyers feel sure before buying (detailed visuals, dimensions, materials) and make checkout fast (single-screen flow, target under 2 minutes).

**Status:** in active development, not deployed yet.

## Planned Highlights

- **Instant "Buy Now"** that skips the cart and goes straight to a single-screen checkout
- **3D / 360° product viewer** using glTF models via `<model-viewer>`
- **Dimension guide and material swatches** that swap product images in real time
- **Guest checkout** with address autofill and a draggable map pin
- **Real-time cargo shipping rates** and a scheduled delivery calendar
- **Dual payment gateways**: Midtrans for local buyers (QRIS, VA, e-wallets), Stripe for global buyers, chosen automatically by country or currency
- **Warm, eco-inspired UI** with FLIP card-to-detail transitions and scroll reveals

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Motion, Zustand, React Hook Form, Zod, model-viewer |
| Backend | Bun, Elysia, JWT auth, OAuth (Arctic), scheduled jobs (cron) |
| Database | PostgreSQL with Drizzle ORM (migrations, seed, constraints, triggers) |
| Testing | `bun test` |

## Project Structure

```
Loka-living/
├── frontend/              Next.js storefront
│   └── src/{app,components,lib}
├── backend/               Elysia API
│   ├── src/
│   │   ├── config/
│   │   ├── db/            schema, migrations, seed
│   │   ├── jobs/
│   │   ├── lib/
│   │   └── modules/
│   └── tests/
├── PRD-LokaLiving.md      product requirements
├── TECHNICAL-LokaLiving.md
├── PLANNING-LokaLiving.md
└── design.md              design tokens and animation specs
```

## Engineering Notes

- **Spec-first workflow.** The PRD, technical spec, planning doc, and design spec were written before implementation and double as context for AI coding agents (`AGENTS.md`, `CLAUDE.md`).
- **Backend migration.** The backend started on Laravel and was moved to Bun + Elysia + Drizzle to keep the whole stack in TypeScript.
- **Database safety.** Schema constraints, restricted user deletion, triggers, a seed script with a production guard and safe upserts, and tests covering the seed.
- **Payment security by design.** The PRD requires webhook signature verification, idempotent webhook handling, server-side price recalculation, and row locking to prevent overselling the last item in stock.

## Roadmap

1. **MVP:** Home, Collections, product detail, cart and Buy Now, single-screen checkout with guest flow, Midtrans (QRIS and VA), one cargo carrier
2. **Phase 2:** 3D viewer, dimension diagrams, Stripe, PayLater, scheduled delivery
3. **Phase 3:** installation add-on, reviews, product recommendations, multi-carrier comparison

## Run Locally

**Backend**

```bash
cd backend
cp .env.example .env
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

**Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Author

Built by [Saifudin Reza](https://github.com/saifudinreza). Open to Junior Software Engineer roles: [portfolio](https://zare-world-portofolio.vercel.app/) · [LinkedIn](https://linkedin.com/in/saifudin-reza-y2003)
