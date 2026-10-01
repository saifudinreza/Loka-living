function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabel environment wajib belum diisi: ${name} (lihat backend/.env.example)`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Variabel environment ${name} harus bilangan bulat positif, dapat: "${raw}"`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

const jwtAccessSecret = required("JWT_ACCESS_SECRET");
if (jwtAccessSecret.length < 32) {
  throw new Error("JWT_ACCESS_SECRET minimal 32 karakter.");
}

export const env = {
  PORT: int("PORT", 8000),
  DATABASE_URL: required("DATABASE_URL"),
  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:3000"),

  JWT_ACCESS_SECRET: jwtAccessSecret,
  ACCESS_TOKEN_TTL_SECONDS: int("ACCESS_TOKEN_TTL_SECONDS", 900),
  REFRESH_TOKEN_TTL_DAYS: int("REFRESH_TOKEN_TTL_DAYS", 30),
  COOKIE_SECURE: bool("COOKIE_SECURE", false),

  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: optional("GOOGLE_REDIRECT_URI"),

  MIDTRANS_SERVER_KEY: optional("MIDTRANS_SERVER_KEY"),
  MIDTRANS_CLIENT_KEY: optional("MIDTRANS_CLIENT_KEY"),
  MIDTRANS_IS_PRODUCTION: bool("MIDTRANS_IS_PRODUCTION", false),
} as const;
