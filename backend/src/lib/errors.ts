import { Elysia } from "elysia";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function errorBody(error: string, code: string) {
  return { error, code };
}

function validationMessage(error: unknown): string {
  const first = (error as { all?: { path?: string; summary?: string; message?: string }[] }).all?.[0];
  const field = first?.path?.replace(/^\//, "").replaceAll("/", ".");
  if (field) return `Data tidak valid pada field "${field}".`;
  return "Data yang dikirim tidak valid.";
}

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return errorBody(error.message, error.code);
    }

    if (code === "VALIDATION") {
      set.status = 422;
      return errorBody(validationMessage(error), "VALIDATION_FAILED");
    }

    if (code === "PARSE") {
      set.status = 400;
      return errorBody("Body request bukan JSON yang valid.", "BAD_REQUEST");
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return errorBody("Endpoint tidak ditemukan.", "NOT_FOUND");
    }

    console.error("[unhandled error]", error);
    set.status = 500;
    return errorBody("Terjadi kesalahan di server.", "INTERNAL_ERROR");
  },
);
