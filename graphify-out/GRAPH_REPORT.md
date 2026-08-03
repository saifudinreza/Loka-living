# Graph Report - Loka-Living  (2026-08-03)

## Corpus Check
- 108 files · ~34,561 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 586 nodes · 838 edges · 60 communities (53 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3600d7f9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Illuminate\Database\Eloquent\Model
- HomeClient.tsx
- composer.json
- scripts
- compilerOptions
- devDependencies
- gen-images.js
- devDependencies
- dependencies
- User.php
- checkout/page.tsx
- AppServiceProvider
- TestCase
- layout.tsx
- ExampleTest
- extends
- dependencies
- PRD — Loka Living E-Commerce Platform
- graphify.js
- next.config.mjs
- postcss.config.mjs
- tailwind.config.ts
- Technical Document — Loka Living
- 3. Spesifikasi Animasi
- api.ts
- Planning Document — Loka Living
- ReleaseOrderReservation.php
- CLAUDE.md — Loka Living
- backend/README.md
- frontend/README.md
- opencode.json
- AGENTS.md

## God Nodes (most connected - your core abstractions)
1. `Order` - 17 edges
2. `formatPrice()` - 15 edges
3. `useToastStore` - 15 edges
4. `compilerOptions` - 15 edges
5. `useCartStore` - 13 edges
6. `PRD — Loka Living E-Commerce Platform` - 12 edges
7. `Product` - 11 edges
8. `CheckoutController` - 9 edges
9. `StockReservationService` - 9 edges
10. `scripts` - 9 edges

## Surprising Connections (you probably didn't know these)
- `CheckoutPage()` --calls--> `formatPrice()`  [EXTRACTED]
  frontend/src/app/checkout/page.tsx → frontend/src/lib/products.ts
- `CollectionsPage()` --indirect_call--> `mapApiProduct()`  [INFERRED]
  frontend/src/app/collections/page.tsx → frontend/src/lib/api.ts
- `Home()` --indirect_call--> `mapApiProduct()`  [INFERRED]
  frontend/src/app/page.tsx → frontend/src/lib/api.ts
- `ProductDetailPage()` --calls--> `fetchProductBySlug()`  [EXTRACTED]
  frontend/src/app/products/[slug]/page.tsx → frontend/src/lib/api.ts
- `ProductDetailPage()` --calls--> `mapApiProduct()`  [EXTRACTED]
  frontend/src/app/products/[slug]/page.tsx → frontend/src/lib/api.ts

## Import Cycles
- None detected.

## Communities (60 total, 7 thin omitted)

### Community 0 - "Illuminate\Database\Eloquent\Model"
Cohesion: 0.07
Nodes (20): CheckoutController, PaymentWebhookController, ProductController, Controller, Address, Order, OrderItem, OrderStatusLog (+12 more)

### Community 1 - "HomeClient.tsx"
Cohesion: 0.10
Nodes (43): EASE, ProductDetailPage(), BaruTiba(), Footer(), Hero(), ImageSlot(), ImageSlotProps, Koleksi() (+35 more)

### Community 2 - "composer.json"
Cohesion: 0.05
Nodes (41): pestphp/pest-plugin, php-http/discovery, autoload, autoload-dev, psr-4, psr-4, config, allow-plugins (+33 more)

### Community 3 - "scripts"
Cohesion: 0.08
Nodes (26): scripts, dev, post-autoload-dump, post-create-project-cmd, post-root-package-install, post-update-cmd, pre-package-uninstall, setup (+18 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+17 more)

### Community 5 - "devDependencies"
Cohesion: 0.08
Nodes (25): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, postcss, tailwindcss, @types/node (+17 more)

### Community 6 - "gen-images.js"
Cohesion: 0.14
Nodes (16): bench(), cabinet(), chairDining(), chairLounge(), fs, OUT, path, PRODUCTS (+8 more)

### Community 7 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, private (+9 more)

### Community 8 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @google/model-viewer, @hookform/resolvers, motion, next, react, react-dom, react-hook-form (+11 more)

### Community 9 - "User.php"
Cohesion: 0.14
Nodes (11): User, UserFactory, DatabaseSeeder, ProductSeeder, Illuminate\Database\Console\Seeds\WithoutModelEvents, Illuminate\Database\Eloquent\Factories\Factory, Illuminate\Database\Eloquent\Factories\HasFactory, Illuminate\Database\Seeder (+3 more)

### Community 10 - "checkout/page.tsx"
Cohesion: 0.20
Nodes (14): CheckoutPage(), confirmCheckout(), ConfirmContact, ConfirmResponse, ConfirmShipping, getShippingRate(), initCheckout(), InitItem (+6 more)

### Community 12 - "TestCase"
Cohesion: 0.40
Nodes (3): ExampleTest, TestCase, Illuminate\Foundation\Testing\TestCase

### Community 13 - "layout.tsx"
Cohesion: 0.40
Nodes (3): bodyFont, displayFont, metadata

### Community 15 - "extends"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 16 - "dependencies"
Cohesion: 0.50
Nodes (3): dependencies, motion, motion

### Community 29 - "PRD — Loka Living E-Commerce Platform"
Cohesion: 0.05
Nodes (41): 10.1 Frontend, 10.2 Backend, 10.3 Infrastruktur & Deployment, 10. Tech Stack Rekomendasi, 11.1 Keamanan Pembayaran, 11.2 Autentikasi & Otorisasi, 11.3 Perlindungan Data Pengguna, 11.4 Keamanan Aplikasi Umum (OWASP-aligned) (+33 more)

### Community 50 - "Technical Document — Loka Living"
Cohesion: 0.09
Nodes (22): 1. Arsitektur Sistem, 2.1 Frontend (`loka-living-web/`), 2.2 Backend (`loka-living-api/`), 2. Struktur Project, 3. Skema Database (DDL Ringkas), 4.1 `POST /api/checkout/init`, 4.2 `POST /api/checkout/shipping-rate`, 4.3 `POST /api/checkout/confirm` (+14 more)

### Community 51 - "3. Spesifikasi Animasi"
Cohesion: 0.11
Nodes (18): 1. Prinsip Desain, 2.1 Warna, 2.2 Tipografi, 2.3 Layout & Spacing, 2.4 Komponen Kunci, 2. Design Tokens, 3.1 Navbar Shrink on Scroll, 3.2 Hover Zoom — Product Card (+10 more)

### Community 52 - "api.ts"
Cohesion: 0.26
Nodes (11): CollectionsPage(), HomeClient(), Home(), ApiProduct, ApiVariant, CATEGORY_MAP, fetchApi(), fetchProductBySlug() (+3 more)

### Community 53 - "Planning Document — Loka Living"
Cohesion: 0.17
Nodes (11): 1. Prinsip Perencanaan, 2. Roadmap Fase (Ringkas), 3. Breakdown Tugas per Fase, 4. Daftar Risiko & Rencana Mitigasi (dengan Dampak Timeline), 5. Urutan Prioritas Kalau Waktu Terbatas, 6. Checklist Kesiapan Sebelum Fase 1 Dimulai, Fase 0 — Validasi & Setup (sebelum coding fitur), Fase 1 — MVP (fokus: alur beli inti berfungsi end-to-end) (+3 more)

### Community 54 - "ReleaseOrderReservation.php"
Cohesion: 0.29
Nodes (4): ReleaseExpiredReservations, ReleaseOrderReservation, Illuminate\Contracts\Queue\ShouldQueue, Illuminate\Foundation\Queue\Queueable

### Community 55 - "CLAUDE.md — Loka Living"
Cohesion: 0.18
Nodes (10): 1. Apa Proyek Ini, 2. Arsitektur, 3. Status Sekarang (per 2026-07-27), 4. Yang TIDAK BOLEH Dipangkas / Dilonggarkan, 5. Prinsip Desain (ringkas, detail penuh di `design.md`), 6. Cara Kerja dengan Claude Code, Batch 1: ✅ Homepage → API (selesai), Batch 2: Checkout Single-Screen UI (+2 more)

### Community 56 - "backend/README.md"
Cohesion: 0.25
Nodes (7): About Laravel, Agentic Development, Code of Conduct, Contributing, Learning Laravel, License, Security Vulnerabilities

### Community 57 - "frontend/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 58 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

## Knowledge Gaps
- **239 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `$schema`, `name`, `type` (+234 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `scripts` to `composer.json`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Order` connect `Illuminate\Database\Eloquent\Model` to `ReleaseOrderReservation.php`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Order` (e.g. with `.confirm()` and `.shippingRate()`) actually correct?**
  _`Order` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `$schema` to the rest of the system?**
  _239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Illuminate\Database\Eloquent\Model` be split into smaller, more focused modules?**
  _Cohesion score 0.068997668997669 - nodes in this community are weakly interconnected._
- **Should `HomeClient.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09769335142469471 - nodes in this community are weakly interconnected._
- **Should `composer.json` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._