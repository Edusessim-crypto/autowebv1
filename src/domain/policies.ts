export type Role = "ADMIN" | "MANAGER" | "SALESPERSON";
export type Permission =
  | "vehicles:read"
  | "vehicles:write"
  | "users:manage"
  | "crm:manage"
  | "reports:read"
  | "dealership:configure"
  | "site:manage";
const permissions: Record<Role, readonly Permission[]> = {
  ADMIN: [
    "vehicles:read",
    "vehicles:write",
    "users:manage",
    "crm:manage",
    "reports:read",
    "dealership:configure",
    "site:manage",
  ],
  MANAGER: [
    "vehicles:read",
    "vehicles:write",
    "crm:manage",
    "reports:read",
    "site:manage",
  ],
  SALESPERSON: ["vehicles:read", "crm:manage"],
};
export function can(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}
export function assertPermission(role: Role, permission: Permission) {
  if (!can(role, permission))
    throw new AppError("Seu perfil não tem permissão para esta ação.", 403);
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
