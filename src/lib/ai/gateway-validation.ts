export const ALLOWED_GATEWAY_ACTIONS = [
  "coach_generate",
  "tts_synthesize",
  "speech_analysis",
] as const;

export type AllowedGatewayAction = (typeof ALLOWED_GATEWAY_ACTIONS)[number];

export const ALLOWED_GATEWAY_PURPOSES = [
  "coaching_debrief",
  "coco_qa",
  "coco_tts",
  "assessment_analysis",
  "lesson_analysis",
  "requested_inspection",
  "responsive_roleplay",
] as const;

export type AllowedGatewayPurpose = (typeof ALLOWED_GATEWAY_PURPOSES)[number];

// Keep safely beneath Vercel Serverless Function's 4.5 MB request body ceiling
export const MAX_GATEWAY_REQUEST_BYTES = 3_500_000;
export const MAX_PROMPT_CHARS = 24_000;
export const MAX_TTS_CHARS = 2_500;
export const OPERATION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export interface GatewayRequestBody {
  action: AllowedGatewayAction;
  operationId: string;
  purpose: AllowedGatewayPurpose;
  attemptOrSessionId: string;
  payload: Record<string, unknown>;
}

export interface ValidationResult {
  ok: true;
  value: GatewayRequestBody;
}

export interface ValidationFailure {
  ok: false;
  status: number;
  error: string;
}

export function validateGatewayHeaders(headers: {
  authorization?: string | null;
  appCheckToken?: string | null;
}): { ok: true; authorization: string; appCheckToken: string } | ValidationFailure {
  const authorization = (headers.authorization || "").trim();
  if (!authorization.startsWith("Bearer ") || authorization.slice(7).trim().length < 20) {
    return { ok: false, status: 401, error: "Missing or malformed Firebase ID token." };
  }
  const appCheckToken = (headers.appCheckToken || "").trim();
  if (appCheckToken.length < 10) {
    return {
      ok: false,
      status: 401,
      error: "Missing or malformed Firebase App Check token.",
    };
  }
  return { ok: true, authorization, appCheckToken };
}

export function validateGatewayBody(raw: unknown): ValidationResult | ValidationFailure {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }

  const record = raw as Record<string, unknown>;
  const action = record.action;
  if (
    typeof action !== "string" ||
    !(ALLOWED_GATEWAY_ACTIONS as readonly string[]).includes(action)
  ) {
    return { ok: false, status: 400, error: "Unsupported or missing gateway action." };
  }

  const operationId = record.operationId;
  if (typeof operationId !== "string" || !OPERATION_ID_REGEX.test(operationId)) {
    return { ok: false, status: 400, error: "Invalid operationId." };
  }

  const purpose = record.purpose;
  if (
    typeof purpose !== "string" ||
    !(ALLOWED_GATEWAY_PURPOSES as readonly string[]).includes(purpose)
  ) {
    return { ok: false, status: 400, error: "Unsupported or missing gateway purpose." };
  }

  const attemptOrSessionId =
    typeof record.attemptOrSessionId === "string" && record.attemptOrSessionId.trim().length > 0
      ? record.attemptOrSessionId.trim().slice(0, 128)
      : action;

  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "Missing payload object." };
  }
  const p = payload as Record<string, unknown>;

  if (action === "speech_analysis") {
    if (typeof p.audioBase64 !== "string" || p.audioBase64.length === 0) {
      return { ok: false, status: 400, error: "speech_analysis requires audioBase64." };
    }
    if (typeof p.mimeType !== "string" || !p.mimeType.startsWith("audio/")) {
      return { ok: false, status: 400, error: "speech_analysis requires an audio/* mimeType." };
    }
    if (typeof p.prompt !== "string" || p.prompt.length > MAX_PROMPT_CHARS) {
      return { ok: false, status: 400, error: "speech_analysis prompt is missing or too long." };
    }
  } else if (action === "tts_synthesize") {
    if (typeof p.text !== "string" || p.text.trim().length === 0 || p.text.length > MAX_TTS_CHARS) {
      return { ok: false, status: 400, error: "tts_synthesize requires text within bounds." };
    }
    if (p.role !== "COCO" && p.role !== "ROLEPLAY_PARTNER") {
      return { ok: false, status: 400, error: "tts_synthesize role must be COCO or ROLEPLAY_PARTNER." };
    }
  } else if (action === "coach_generate") {
    if (typeof p.prompt !== "string" || p.prompt.trim().length === 0 || p.prompt.length > MAX_PROMPT_CHARS) {
      return { ok: false, status: 400, error: "coach_generate prompt is missing or too long." };
    }
    if (p.audioBase64 !== undefined) {
      if (typeof p.audioBase64 !== "string" || p.audioBase64.length === 0) {
        return { ok: false, status: 400, error: "Invalid optional audioBase64 payload." };
      }
      if (typeof p.mimeType !== "string" || !p.mimeType.startsWith("audio/")) {
        return { ok: false, status: 400, error: "audioBase64 requires an audio/* mimeType." };
      }
    }
  }

  return {
    ok: true,
    value: {
      action: action as AllowedGatewayAction,
      operationId,
      purpose: purpose as AllowedGatewayPurpose,
      attemptOrSessionId,
      payload: p,
    },
  };
}
