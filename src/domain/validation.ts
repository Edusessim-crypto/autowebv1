import { z } from "zod";
import { leadSources, leadStages, activityTypes, normalizePhone } from "./crm";
export const statuses = [
  "AVAILABLE",
  "RESERVED",
  "PREPARING",
  "SOLD",
  "UNAVAILABLE",
] as const;
export const statusLabels: Record<(typeof statuses)[number], string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  PREPARING: "Em preparação",
  SOLD: "Vendido",
  UNAVAILABLE: "Indisponível",
};
const text = (max: number) => z.string().trim().max(max);
export const registerSchema = z.object({
  name: text(100).min(2),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12, "Use pelo menos 12 caracteres.").max(128),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export function validCnpj(value: string) {
  const n = value.replace(/\D/g, "");
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const digit = (len: number) => {
    let w = len - 7;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(n[i]) * w--;
      if (w < 2) w = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(n[12]) && digit(13) === Number(n[13]);
}
export const dealershipSchema = z.object({
  tradeName: text(100).min(2),
  cnpj: text(18)
    .refine(validCnpj, "Informe um CNPJ válido.")
    .transform((v) => v.replace(/\D/g, "")),
  phone: text(20).refine(
    (v) => v.replace(/\D/g, "").length >= 10,
    "Informe um telefone válido.",
  ),
  city: text(100).min(2),
  state: z
    .string()
    .regex(
      /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
    ),
});
const year = z.coerce
  .number()
  .int()
  .min(1900)
  .max(new Date().getFullYear() + 2);
export const vehicleSchema = z
  .object({
    brand: text(60).min(1),
    model: text(100).min(1),
    version: text(150).default(""),
    yearManufacture: year,
    yearModel: year,
    mileage: z.coerce.number().int().min(0).max(9999999),
    transmission: z.enum(["Automático", "Manual", "Automatizado", "CVT"]),
    fuel: z.enum([
      "Flex",
      "Gasolina",
      "Diesel",
      "Elétrico",
      "Híbrido",
      "Etanol",
      "GNV",
    ]),
    color: text(40).min(1),
    price: z.coerce.number().positive().max(99999999),
    plate: text(8)
      .transform((v) => v.toUpperCase())
      .refine(
        (v) => !v || /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(v),
        "Placa inválida.",
      ),
    description: text(4000).default(""),
    options: z.array(text(60)).max(40).default([]),
    status: z.enum(statuses).default("AVAILABLE"),
  })
  .refine(
    (v) =>
      v.yearModel >= v.yearManufacture && v.yearModel <= v.yearManufacture + 2,
    "Confira o ano de fabricação e o ano do modelo.",
  );
export type VehicleInput = z.infer<typeof vehicleSchema>;
const phone = text(20).transform(normalizePhone);
export const customerSchema = z
  .object({
    name: text(120).min(2, "Informe o nome do cliente."),
    phone: phone.default(""),
    whatsapp: phone.default(""),
    email: z
      .union([z.literal(""), z.email().max(254)])
      .default("")
      .transform((v) => v.toLowerCase()),
    notes: text(4000).default(""),
  })
  // A customer nobody can reach is not usable commercially.
  .refine(
    (v) => Boolean(v.phone || v.whatsapp || v.email),
    "Informe ao menos um contato: telefone, WhatsApp ou e-mail.",
  );
export type CustomerInput = z.infer<typeof customerSchema>;
const optionalId = z
  .union([z.literal(""), z.uuid()])
  .default("")
  .transform((v) => v || null);
export const leadSchema = z.object({
  customerId: z.uuid("Selecione um cliente."),
  vehicleId: optionalId,
  assignedToUserId: optionalId,
  source: z.enum(leadSources).default("OTHER"),
  stage: z.enum(leadStages).default("NEW"),
  notes: text(4000).default(""),
  nextActionAt: z.coerce.date().nullable().default(null),
});
export type LeadInput = z.infer<typeof leadSchema>;
export const stageChangeSchema = z
  .object({
    stage: z.enum(leadStages),
    lostReason: text(300).default(""),
  })
  // Knowing why deals are lost is the point of tracking the stage.
  .refine(
    (v) => v.stage !== "LOST" || v.lostReason.length > 0,
    "Informe o motivo da perda.",
  );
export const activitySchema = z.object({
  type: z.enum(activityTypes).default("NOTE"),
  content: text(2000).min(1, "Escreva o conteúdo da atividade."),
});
