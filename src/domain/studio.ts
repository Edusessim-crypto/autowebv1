// Regras do Studio. Sem HTTP, banco, storage ou motor de render aqui.
import type { Role } from "./policies";
import type { Subscription } from "./plans";

export const projectStatuses = [
  "DRAFT",
  "QUEUED",
  "PROCESSING",
  "REVIEW",
  "COMPLETED",
  "FAILED",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const projectStatusLabels: Record<ProjectStatus, string> = {
  DRAFT: "Rascunho",
  QUEUED: "Na fila",
  PROCESSING: "Processando",
  REVIEW: "Em revisão",
  COMPLETED: "Concluído",
  FAILED: "Falhou",
};

export const jobStatuses = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const assetStatuses = ["OK", "NEEDS_REVIEW", "MANUAL"] as const;
export type AssetStatus = (typeof assetStatuses)[number];

export const templateVariants = ["STANDARD", "PRICE_DROP"] as const;
export type TemplateVariant = (typeof templateVariants)[number];

export const renderErrorCodes = [
  "INVALID_INPUT",
  "INPUT_DOWNLOAD_FAILED",
  "MODEL_LOAD_FAILED",
  "RENDER_FAILED",
  "UPLOAD_FAILED",
  "TIMEOUT",
  "INTERNAL_ERROR",
] as const;
export type RenderErrorCode = (typeof renderErrorCodes)[number];

// Mensagens que o usuário lê. O detalhe técnico fica no log e no banco.
export const renderErrorMessages: Record<RenderErrorCode, string> = {
  INVALID_INPUT: "Confira as fotos e os dados do veículo.",
  INPUT_DOWNLOAD_FAILED: "Não foi possível ler as fotos do veículo.",
  MODEL_LOAD_FAILED: "O gerador de conteúdo está indisponível no momento.",
  RENDER_FAILED: "Não foi possível gerar as peças desta vez.",
  UPLOAD_FAILED: "As peças foram geradas, mas não puderam ser salvas.",
  TIMEOUT: "A geração demorou mais do que o esperado.",
  INTERNAL_ERROR: "Não foi possível concluir. Tente novamente.",
};

export const DEFAULT_TEMPLATE_KEY = "autoweb-feed";
export const DEFAULT_TEMPLATE_VERSION = 1;

// Quantas fotos entram numa peça. O motor leva dezenas de segundos por lote.
export const MAX_PHOTOS_PER_PROJECT = 15;
export const MIN_PHOTOS_PER_PROJECT = 1;

export function canUseStudio(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

// Gerar conteúdo não consome cota de veículo: o veículo já foi contabilizado
// no cadastro. O que o plano governa é a personalização da marca.
export function canUseCustomBrandColors(subscription: Subscription) {
  return subscription.plan === "PRO" || subscription.plan === "PERFORMANCE";
}

export function canUseAdvancedTemplates(subscription: Subscription) {
  return subscription.plan === "PERFORMANCE";
}

export function isTerminal(status: ProjectStatus) {
  return status === "COMPLETED" || status === "FAILED" || status === "REVIEW";
}
