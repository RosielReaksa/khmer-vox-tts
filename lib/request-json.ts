import "server-only";

export class JsonRequestError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 415,
    public readonly code: "INVALID_JSON" | "UNSUPPORTED_MEDIA_TYPE",
  ) {
    super(message);
    this.name = "JsonRequestError";
  }
}

export function isJsonRequestError(error: unknown): error is JsonRequestError {
  return error instanceof JsonRequestError;
}

export function jsonRequestErrorBody(error: JsonRequestError) {
  return {
    error: error.message,
    code: error.code,
  };
}

export function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  if (!hasJsonContentType(request)) {
    throw new JsonRequestError(
      "Content-Type must be application/json.",
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }

  try {
    return await request.json();
  } catch {
    throw new JsonRequestError("Malformed JSON request body.", 400, "INVALID_JSON");
  }
}
