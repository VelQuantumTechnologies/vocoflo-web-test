"use client";

import { getFirebaseClientAuth, getWebAppCheckToken } from "@/lib/firebase/client";
import type { AllowedGatewayAction, AllowedGatewayPurpose } from "./gateway-validation";

export interface GatewayCallResult {
  ok: boolean;
  httpStatus: number;
  model: string;
  text: string;
  audioBase64: string | null;
  audioMimeType: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  errorMessage?: string;
}

export async function callTrustedAiGateway(params: {
  action: AllowedGatewayAction;
  purpose: AllowedGatewayPurpose;
  attemptOrSessionId: string;
  payload: Record<string, unknown>;
  operationId?: string;
  onLog?: (entry: {
    kind: "gateway_call" | "error";
    summary: string;
    model?: string;
    latencyMs?: number;
    httpStatus?: number;
    errorMessage?: string;
  }) => void;
}): Promise<GatewayCallResult> {
  const auth = getFirebaseClientAuth();
  const user = auth?.currentUser;
  if (!user) {
    return {
      ok: false,
      httpStatus: 401,
      model: "",
      text: "",
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      errorMessage: "Sign in with Google before calling VocoFlo AI services.",
    };
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken(false);
  } catch (err) {
    return {
      ok: false,
      httpStatus: 401,
      model: "",
      text: "",
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      errorMessage:
        err instanceof Error ? err.message : "Could not obtain Firebase ID token.",
    };
  }

  const appCheckToken = await getWebAppCheckToken();
  if (!appCheckToken) {
    const msg =
      "Web Firebase App Check token unavailable. Configure NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY (or local dev debug token) for the registered Web App.";
    params.onLog?.({
      kind: "error",
      summary: `Blocked ${params.action}: missing Web App Check token`,
      httpStatus: 401,
      errorMessage: msg,
    });
    return {
      ok: false,
      httpStatus: 401,
      model: "",
      text: "",
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      errorMessage: msg,
    };
  }

  const opId =
    params.operationId ||
    `op_web_${params.action.slice(0, 6)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const startedAt = performance.now();
  try {
    const res = await fetch("/api/ai-gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Firebase-AppCheck": appCheckToken,
      },
      body: JSON.stringify({
        action: params.action,
        operationId: opId,
        purpose: params.purpose,
        attemptOrSessionId: params.attemptOrSessionId,
        payload: params.payload,
      }),
    });

    const elapsedMs = Math.round(performance.now() - startedAt);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg =
        typeof data.error === "string"
          ? data.error
          : `Gateway returned HTTP ${res.status}`;
      params.onLog?.({
        kind: "gateway_call",
        summary: `${params.action} (${params.purpose}) failed`,
        latencyMs: elapsedMs,
        httpStatus: res.status,
        errorMessage: errMsg,
      });
      return {
        ok: false,
        httpStatus: res.status,
        model: typeof data.model === "string" ? data.model : "",
        text: "",
        audioBase64: null,
        audioMimeType: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs: elapsedMs,
        errorMessage: errMsg,
      };
    }

    const model = typeof data.model === "string" ? data.model : "";
    const latencyMs =
      typeof data.latencyMs === "number" ? data.latencyMs : elapsedMs;

    params.onLog?.({
      kind: "gateway_call",
      summary: `${params.action} (${params.purpose}) succeeded`,
      model,
      latencyMs,
      httpStatus: res.status,
    });

    return {
      ok: true,
      httpStatus: res.status,
      model,
      text: typeof data.text === "string" ? data.text : "",
      audioBase64: typeof data.audioBase64 === "string" ? data.audioBase64 : null,
      audioMimeType: typeof data.audioMimeType === "string" ? data.audioMimeType : null,
      inputTokens: typeof data.inputTokens === "number" ? data.inputTokens : null,
      outputTokens: typeof data.outputTokens === "number" ? data.outputTokens : null,
      latencyMs,
    };
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const msg = err instanceof Error ? err.message : "Network error calling gateway";
    params.onLog?.({
      kind: "gateway_call",
      summary: `${params.action} network failure`,
      latencyMs: elapsedMs,
      httpStatus: 0,
      errorMessage: msg,
    });
    return {
      ok: false,
      httpStatus: 0,
      model: "",
      text: "",
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: elapsedMs,
      errorMessage: msg,
    };
  }
}
