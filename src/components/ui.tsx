import Link from "next/link";
import Image from "next/image";
import {
  CarFront,
  LayoutDashboard,
  Layers3,
  Send,
  PanelsTopLeft,
  Users,
  Globe2,
  UsersRound,
  ChartNoAxesCombined,
  Settings2,
  Plus,
  ArrowUpRight,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { statusLabels } from "@/domain/validation";
export const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  car: CarFront,
  studio: Layers3,
  send: Send,
  crm: PanelsTopLeft,
  users: Users,
  globe: Globe2,
  team: UsersRound,
  chart: ChartNoAxesCombined,
  settings: Settings2,
};
export function AutoWebLogo({ large = false }: { large?: boolean }) {
  return (
    <Image
      className={large ? "brand-logo large" : "brand-logo"}
      src="/brand/autoweb.png"
      alt="AutoWeb"
      width={1536}
      height={1024}
      priority
    />
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function NewVehicleButton() {
  return (
    <Link className="button primary" href="/estoque/novo">
      <Plus size={18} />
      Novo veículo
    </Link>
  );
}
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Badge({ status }: { status: keyof typeof statusLabels }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Panel({
  title,
  link,
  children,
  className = "",
}: {
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {link && (
          <Link href={link.href}>
            {link.label}
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const number = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
export function CarPhoto({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return src ? (
    <Image
      src={src}
      alt={alt}
      width={560}
      height={420}
      unoptimized
      className={`car-photo ${className}`}
    />
  ) : (
    <div className={`car-placeholder ${className}`}>
      <CarFront size={42} strokeWidth={1} />
      <span>Sem foto</span>
    </div>
  );
}
