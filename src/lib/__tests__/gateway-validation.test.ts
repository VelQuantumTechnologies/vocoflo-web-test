import { describe, expect, it } from "vitest";
import {
  validateGatewayBody,
  validateGatewayHeaders,
} from "@/lib/ai/gateway-validation";

describe("gateway-validation", () => {
  it("rejects missing Authorization or X-Firebase-AppCheck headers", () => {
    expect(
      validateGatewayHeaders({ authorization: null, appCheckToken: "valid_token_12345" }).ok
    ).toBe(false);
    expect(
      validateGatewayHeaders({
        authorization: "Bearer valid_firebase_id_token_12345",
        appCheckToken: "",
      }).ok
    ).toBe(false);
    expect(
      validateGatewayHeaders({
        authorization: "Bearer valid_firebase_id_token_12345",
        appCheckToken: "valid_appcheck_token_12345",
      }).ok
    ).toBe(true);
  });

  it("rejects non-allowlisted actions and purposes", () => {
    const badAction = validateGatewayBody({
      action: "admin_delete_all",
      operationId: "op_123",
      purpose: "coaching_debrief",
      payload: { prompt: "hi" },
    });
    expect(badAction.ok).toBe(false);

    const badPurpose = validateGatewayBody({
      action: "coach_generate",
      operationId: "op_123",
      purpose: "arbitrary_purpose",
      payload: { prompt: "hi" },
    });
    expect(badPurpose.ok).toBe(false);
  });

  it("validates speech_analysis, tts_synthesize, and coach_generate payloads", () => {
    expect(
      validateGatewayBody({
        action: "speech_analysis",
        operationId: "op_speech_1",
        purpose: "assessment_analysis",
        attemptOrSessionId: "att_1",
        payload: {
          audioBase64: "AAAA",
          mimeType: "audio/webm",
          prompt: "Listen carefully",
        },
      }).ok
    ).toBe(true);

    expect(
      validateGatewayBody({
        action: "tts_synthesize",
        operationId: "op_tts_1",
        purpose: "coco_tts",
        payload: {
          role: "COCO",
          text: "Hello there.",
        },
      }).ok
    ).toBe(true);

    expect(
      validateGatewayBody({
        action: "tts_synthesize",
        operationId: "op_tts_bad",
        purpose: "coco_tts",
        payload: {
          role: "UNKNOWN_VOICE",
          text: "Hello there.",
        },
      }).ok
    ).toBe(false);
  });
});
