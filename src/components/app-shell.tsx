"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
  UserRound,
  Building2,
  CreditCard,
  Settings2,
} from "lucide-react";
import { AutoWebLogo, icons } from "./ui";
import { navigation } from "@/config/navigation";
export function AppShell({
  children,
  name,
  dealership,
  trialDays,
  isDemo,
}: {
  children: React.ReactNode;
  name: string;
  dealership: string;
  trialDays: number;
  isDemo: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const current = navigation
    .flatMap((g) => g.items)
    .find((i) => pathname.startsWith(i.href));
  async function logout() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (res.ok) {
      router.push("/entrar");
      router.refresh();
    } else setError("Não foi possível sair. Tente novamente.");
  }
  const sidebar = (
    <>
      <Link href="/painel" className="brand" aria-label="AutoWeb · Painel">
        <AutoWebLogo />
        <span>GESTÃO DE REVENDAS</span>
      </Link>
      <nav aria-label="Navegação principal">
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon = icons[item.icon];
              return (
                <Link
                  onClick={() => setOpen(false)}
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                  aria-current={
                    pathname.startsWith(item.href) ? "page" : undefined
                  }
                >
                  <Icon size={19} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {pathname.startsWith(item.href) && <ChevronRight size={14} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="trial-small">
          <span>
            {isDemo ? "AMBIENTE DEMONSTRATIVO" : "SEU PERÍODO DE TESTE"}
          </span>
          <div>
            {isDemo
              ? "Dados fictícios"
              : trialDays > 0
                ? `${trialDays} dias para explorar`
                : "Período encerrado"}
            <Link href="/configuracoes?tab=plano" aria-label="Ver plano">
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
        <Dropdown.Root>
          <Dropdown.Trigger className="profile">
            <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
            <span>
              <strong>{name}</strong>
              <small>{dealership}</small>
            </span>
            <ChevronDown size={15} />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="dropdown" sideOffset={8} align="start">
              {[
                {
                  text: "Minha conta",
                  href: "/configuracoes?tab=seguranca",
                  icon: UserRound,
                },
                {
                  text: "Minha revenda",
                  href: "/configuracoes",
                  icon: Building2,
                },
                {
                  text: "Plano e cobrança",
                  href: "/configuracoes?tab=plano",
                  icon: CreditCard,
                },
                {
                  text: "Configurações",
                  href: "/configuracoes",
                  icon: Settings2,
                },
              ].map((i) => (
                <Dropdown.Item asChild key={i.text}>
                  <Link href={i.href}>
                    <i.icon size={16} />
                    {i.text}
                  </Link>
                </Dropdown.Item>
              ))}
              <Dropdown.Separator className="separator" />
              <Dropdown.Item onSelect={logout}>
                <LogOut size={16} />
                Sair
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar desktop-sidebar">{sidebar}</aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="sidebar mobile-sidebar">
            <Dialog.Title className="sr-only">Navegação AutoWeb</Dialog.Title>
            <Dialog.Description className="sr-only">
              Acesse os módulos da sua revenda.
            </Dialog.Description>
            <Dialog.Close className="drawer-close" aria-label="Fechar menu">
              <X size={20} />
            </Dialog.Close>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <Dialog.Trigger
                className="icon-button menu-trigger"
                aria-label="Abrir menu"
              >
                <Menu size={21} />
              </Dialog.Trigger>
              <span className="desktop-breadcrumb">
                Sua revenda
                <ChevronRight size={14} />
              </span>
              <strong>{current?.label || "AutoWeb"}</strong>
            </div>
            <div className="topbar-right">
              <span className="dealership-label">
                <Building2 size={15} />
                {dealership}
              </span>
              <span className="environment-badge">
                {isDemo ? "DEMONSTRAÇÃO" : "TRIAL"}
              </span>
              <span className="avatar small">
                {name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </header>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <main id="main">{children}</main>
          <footer className="workspace-footer">
            <span>
              AutoWeb <span className="footer-divider">/</span> A infraestrutura
              digital da revenda.
            </span>
            <span>Feito para movimentar seu negócio.</span>
          </footer>
        </div>
      </Dialog.Root>
    </div>
  );
}
