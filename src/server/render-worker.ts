// Cliente do worker de renderização. Só o servidor fala com ele: o
// navegador nunca alcança o Python, e o segredo nunca sai daqui.
import type { RenderErrorCode } from "@/domain/studio";

export type RenderPhoto = {
  mediaId: string;
  order: number;
  sourceUrl: string;
  isCover: boolean;
};

export type RenderCard = {
  sourceMediaId: string;
  position: number;
  storageKey: string;
  width: number;
  height: number;
  group: string;
  detectedVehicleType: string;
  status: "OK" | "NEEDS_REVIEW" | "MANUAL";
  framing: {
    zoom: number;
    horizontalAnchor: number;
    verticalAnchor: number;
  };
  metrics: Record<string, number> | null;
  issues: string[];
  manuallyAdjusted: boolean;
};

export type RenderResult = {
  jobId: string;
  status: "COMPLETED" | "REVIEW" | "FAILED";
  engineVersion: string;
  templateKey: string;
  templateVersion: number;
  resolvedVehicleType: string;
  cards: RenderCard[];
  stats: {
    totalPhotos: number;
    generatedCards: number;
    reviewCards: number;
    durationMs: number;
  } | null;
  errorCode: RenderErrorCode | null;
  errorMessage: string | null;
};

export class WorkerUnavailable extends Error {}

function settings() {
  const url = process.env.RENDER_WORKER_URL;
  const secret = process.env.RENDER_WORKER_SECRET;
  if (!url || !secret)
    throw new WorkerUnavailable(
      "RENDER_WORKER_URL e RENDER_WORKER_SECRET são obrigatórias.",
    );
  return { url: url.replace(/\/$/, ""), secret };
}

export function isWorkerConfigured() {
  return Boolean(
    process.env.RENDER_WORKER_URL && process.env.RENDER_WORKER_SECRET,
  );
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, secret } = settings();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "content-type": "application/json",
      "x-worker-token": secret,
    },
    // O lote leva dezenas de segundos; o accept é imediato.
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 202)
    throw new WorkerUnavailable("Ainda processando.");
  if (!response.ok)
    throw new WorkerUnavailable(`Worker respondeu ${response.status}.`);
  return (await response.json()) as T;
}

export async function health() {
  return call<{
    status: string;
    engineVersion: string;
    workerVersion: string;
    modelLoaded: boolean;
  }>("/health");
}

export async function submitRender(payload: unknown) {
  return call<{ jobId: string; status: string }>("/v1/render", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchResult(jobId: string) {
  return call<RenderResult>(`/v1/jobs/${jobId}`);
}

export async function rerenderCard(payload: unknown) {
  return call<RenderResult>("/v1/render/card", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
