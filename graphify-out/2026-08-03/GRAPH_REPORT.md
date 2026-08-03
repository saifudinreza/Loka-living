# Graph Report - C:\CODINGAN\full stack\Loka-Living  (2026-08-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 460 nodes · 722 edges · 50 communities (43 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.8)
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
- Marquee.tsx
- graphify.js
- next.config.mjs
- postcss.config.mjs
- tailwind.config.ts

## God Nodes (most connected - your core abstractions)
1. `Order` - 17 edges
2. `formatPrice()` - 15 edges
3. `useToastStore` - 15 edges
4. `compilerOptions` - 15 edges
5. `useCartStore` - 13 edges
6. `Product` - 11 edges
7. `CheckoutController` - 9 edges
8. `StockReservationService` - 9 edges
9. `scripts` - 9 edges
10. `shadow()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `CheckoutPage()` --calls--> `formatPrice()`  [EXTRACTED]
  frontend/src/app/checkout/page.tsx → frontend/src/lib/products.ts
- `CollectionsPage()` --indirect_call--> `mapApiProduct()`  [INFERRED]
  frontend/src/app/collections/page.tsx → frontend/src/lib/api.ts
- `Home()` --indirect_call--> `mapApiProduct()`  [INFERRED]
  frontend/src/app/page.tsx → frontend/src/lib/api.ts
- `CheckoutController` --inherits--> `Controller`  [EXTRACTED]
  backend/app/Http/Controllers/Api/CheckoutController.php → backend/app/Http/Controllers/Controller.php
- `CheckoutController` --references--> `MidtransService`  [EXTRACTED]
  backend/app/Http/Controllers/Api/CheckoutController.php → backend/app/Services/Payment/MidtransService.php

## Import Cycles
- None detected.

## Communities (50 total, 7 thin omitted)

### Community 0 - "Illuminate\Database\Eloquent\Model"
Cohesion: 0.06
Nodes (25): CheckoutController, PaymentWebhookController, ProductController, Controller, ReleaseExpiredReservations, ReleaseOrderReservation, Address, Order (+17 more)

### Community 1 - "HomeClient.tsx"
Cohesion: 0.08
Nodes (52): CollectionsPage(), HomeClient(), Home(), EASE, ProductDetailPage(), BaruTiba(), Footer(), Hero() (+44 more)

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
Nodes (23): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, postcss, @types/node, @types/react (+15 more)

### Community 6 - "gen-images.js"
Cohesion: 0.14
Nodes (16): bench(), cabinet(), chairDining(), chairLounge(), fs, OUT, path, PRODUCTS (+8 more)

### Community 7 - "devDependencies"
Cohesion: 0.11
Nodes (18): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, private (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @google/model-viewer, @hookform/resolvers, motion, next, react, react-dom, react-hook-form (+11 more)

### Community 9 - "User.php"
Cohesion: 0.16
Nodes (10): User, UserFactory, DatabaseSeeder, Illuminate\Database\Console\Seeds\WithoutModelEvents, Illuminate\Database\Eloquent\Factories\Factory, Illuminate\Database\Eloquent\Factories\HasFactory, Illuminate\Database\Seeder, Illuminate\Foundation\Auth\User (+2 more)

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

## Knowledge Gaps
- **141 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `scripts` to `composer.json`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `devDependencies`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Order` (e.g. with `.confirm()` and `.shippingRate()`) actually correct?**
  _`Order` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Illuminate\Database\Eloquent\Model` be split into smaller, more focused modules?**
  _Cohesion score 0.05647517039922103 - nodes in this community are weakly interconnected._
- **Should `HomeClient.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08407382091592618 - nodes in this community are weakly interconnected._