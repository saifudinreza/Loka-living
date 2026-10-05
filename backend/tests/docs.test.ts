import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";

const get = (app: ReturnType<typeof createApp>, path: string) => app.handle(new Request(`http://localhost${path}`));

describe("dokumentasi API (development)", () => {
  const app = createApp({ enableJobs: false });

  test("/swagger menampilkan Swagger UI", async () => {
    const res = await get(app, "/swagger");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("spesifikasi OpenAPI memuat semua endpoint auth", async () => {
    const res = await get(app, "/swagger/json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { tags?: string[]; summary?: string; security?: unknown[] }>>;
      components: { securitySchemes: Record<string, unknown> };
    };

    const expected: [string, string][] = [
      ["/api/auth/register", "post"],
      ["/api/auth/login", "post"],
      ["/api/auth/refresh", "post"],
      ["/api/auth/logout", "post"],
      ["/api/auth/me", "get"],
      ["/api/auth/google", "get"],
      ["/api/auth/google/callback", "get"],
    ];
    for (const [path, method] of expected) {
      const op = spec.paths[path]?.[method];
      expect(op, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(op!.tags).toContain("Auth");
      expect(op!.summary).toBeString();
    }

    // /me bisa dicoba lewat tombol Authorize (Bearer)
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.paths["/api/auth/me"]!.get!.security).toEqual([{ bearerAuth: [] }]);
  });

  test("halaman diagram memuat tiga alur", async () => {
    const res = await get(app, "/docs/auth-flows");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.match(/class="mermaid"/g)).toHaveLength(3);
    for (const heading of ["Register &amp; login", "Refresh token &amp; logout", "Login dengan Google"]) {
      expect(html).toContain(heading);
    }
  });

  test("halaman diagram tidak ikut tercantum di spesifikasi OpenAPI", async () => {
    const spec = (await (await get(app, "/swagger/json")).json()) as { paths: Record<string, unknown> };
    expect(spec.paths["/docs/auth-flows"]).toBeUndefined();
  });
});

describe("dokumentasi API (production)", () => {
  test("/swagger, /swagger/json, dan /docs/auth-flows tidak tersedia", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const app = createApp({ enableJobs: false });
      for (const path of ["/swagger", "/swagger/json", "/docs/auth-flows"]) {
        expect((await get(app, path)).status, path).toBe(404);
      }
      // API tetap jalan normal
      expect((await get(app, "/health")).status).toBe(200);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
