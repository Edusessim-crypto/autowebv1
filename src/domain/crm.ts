// Business rules for the commercial funnel. No HTTP, database or storage here.
import type { Role } from "./policies";

export const leadSources = [
  "WEBSITE",
  "INSTAGRAM",
  "WHATSAPP",
  "PHONE",
  "WALK_IN",
  "REFERRAL",
  "OTHER",
] as const;
export type LeadSource = (typeof leadSources)[number];
export const leadSourceLabels: Record<LeadSource, string> = {
  WEBSITE: "Site",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  PHONE: "Telefone",
  WALK_IN: "Visita à loja",
  REFERRAL: "Indicação",
  OTHER: "Outro",
};

export const leadStages = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VISIT",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type LeadStage = (typeof leadStages)[number];
export const leadStageLabels: Record<LeadStage, string> = {
  NEW: "Novo lead",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  VISIT: "Visita",
  PROPOSAL: "Proposta",
  WON: "Venda",
  LOST: "Perdido",
};

export const closedStages = ["WON", "LOST"] as const;
export function isClosed(stage: LeadStage) {
  return (closedStages as readonly string[]).includes(stage);
}

export const activityTypes = [
  "NOTE",
  "CALL",
  "WHATSAPP",
  "STAGE_CHANGE",
  "ASSIGNMENT",
  "FOLLOW_UP",
] as const;
export type ActivityType = (typeof activityTypes)[number];
export const activityTypeLabels: Record<ActivityType, string> = {
  NOTE: "Anotação",
  CALL: "Ligação",
  WHATSAPP: "WhatsApp",
  STAGE_CHANGE: "Mudança de etapa",
  ASSIGNMENT: "Atribuição",
  FOLLOW_UP: "Próxima ação",
};

// Salespeople work their own pipeline; managers and admins see the whole one.
export function seesEveryLead(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canReadLead(
  role: Role,
  userId: string,
  lead: { assignedToUserId: string | null },
) {
  return seesEveryLead(role) || lead.assignedToUserId === userId;
}

// A salesperson may only hand a lead to themselves, so they cannot move work
// out of their own pipeline or park it on a colleague.
export function canAssign(role: Role, userId: string, targetUserId: string) {
  return seesEveryLead(role) || targetUserId === userId;
}

// Brazilian numbers: 10 digits (landline) or 11 (mobile), optionally carrying
// the 55 country code. Stored digits-only so search and dedupe agree.
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11
    ? digits.slice(2)
    : digits;
  return local.length === 10 || local.length === 11 ? local : "";
}

export function formatPhone(digits: string) {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export function whatsappLink(digits: string, message?: string) {
  if (!digits) return "";
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/55${digits}${query}`;
}
