import { NextRequest, NextResponse } from "next/server";
import {
  MAX_GATEWAY_REQUEST_BYTES,
  validateGatewayBody,
  validateGatewayHeaders,
} from "@/lib/ai/gateway-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_GATEWAY_URL = "https://vocofloaigateway-i2vkb7nxrq-uc.a.run.app";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const headerCheck = validateGatewayHeaders({
    authorization: req.headers.get("authorization"),
    appCheckToken: req.headers.get("x-firebase-appcheck"),
  });
  if (!headerCheck.ok) {
    return NextResponse.json({ error: headerCheck.error }, { status: headerCheck.status });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_GATEWAY_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Audio/request payload exceeds the 3.5 MB web gateway limit." },
      { status: 413 }
    );
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return NextResponse.json({ error: "Unable to read request body." }, { status: 400 });
  }

  if (Buffer.byteLength(rawText, "utf8") > MAX_GATEWAY_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Audio/request payload exceeds the 3.5 MB web gateway limit." },
      { status: 413 }
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const bodyCheck = validateGatewayBody(parsedJson);
  if (!bodyCheck.ok) {
    return NextResponse.json({ error: bodyCheck.error }, { status: bodyCheck.status });
  }

  const upstreamUrl = (process.env.VOCOFLO_AI_GATEWAY_URL || DEFAULT_GATEWAY_URL).trim();
  if (!upstreamUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "VOCOFLO_AI_GATEWAY_URL is misconfigured on server." },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 58_000);

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: headerCheck.authorization,
        "X-Firebase-AppCheck": headerCheck.appCheckToken,
      },
      body: JSON.stringify(bodyCheck.value),
      signal: controller.signal,
    });

    const upstreamText = await upstreamRes.text();
    let upstreamJson: unknown;
    try {
      upstreamJson = JSON.parse(upstreamText);
    } catch {
      upstreamJson = {
        error: `Unexpected upstream response (HTTP ${upstreamRes.status}).`,
      };
    }

    return NextResponse.json(upstreamJson, { status: upstreamRes.status });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? "VocoFlo AI gateway request timed out."
          : "Could not reach VocoFlo AI gateway.",
      },
      { status: isAbort ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
