import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import {
  ShieldCheck,
  Instagram,
  Check,
  CarFront,
  ArrowLeft,
  Clock3,
} from "lucide-react";
import { requireTenant } from "@/server/auth";
import { getDb } from "@/server/db";
import { users, memberships } from "@/server/schema";
import { PageHeader, Panel, EmptyState, icons, money } from "@/components/ui";
import { BrandingUpload } from "@/components/branding-upload";
import { navigation } from "@/config/navigation";
import { dashboard, getVehicle } from "@/services/vehicles";
import { plans, getLimit, canWrite } from "@/domain/plans";
import { can } from "@/domain/policies";
const subtitles: Record<string, string> = {
  studio: "Crie conteúdos para seus veículos.",
  publicacoes: "Gerencie e agende suas publicações.",
  crm: "Acompanhe seus leads e oportunidades.",
  clientes: "Organize sua base de clientes.",
  site: "Gerencie a presença online da sua revenda.",
  equipe: "Gerencie acessos e permissões.",
  relatorios: "Acompanhe os resultados da sua operação.",
  configuracoes: "Sua revenda, suas preferências.",
};
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { module } = await params;
  const p = await searchParams;
  const ctx = await requireTenant();
  const nav = navigation
    .flatMap((g) => g.items)
    .find((i) => i.href === `/${module}`);
  if (!nav || !subtitles[module]) notFound();
  const Icon = icons[nav.icon];
  let contextVehicle;
  if (p.vehicleId) {
    try {
      contextVehicle = await getVehicle(ctx, p.vehicleId);
    } catch {
      notFound();
    }
  }
  if (module === "configuracoes") {
    const tab = p.tab || "geral";
    const stats = await dashboard(ctx);
    const allowed = can(ctx.membership.role, "dealership:configure");
    return (
      <>
        <PageHeader title="Configurações" description={subtitles[module]} />
        <nav className="tabs" aria-label="Configurações">
          {[
            ["geral", "Geral"],
            ["identidade", "Identidade"],
            ["integracoes", "Integrações"],
            ["plano", "Plano e cobrança"],
            ["seguranca", "Segurança"],
          ].map(([k, v]) => (
            <Link
              href={`/configuracoes?tab=${k}`}
              className={tab === k ? "active" : ""}
              key={k}
            >
              {v}
            </Link>
          ))}
        </nav>
        {!allowed && tab !== "seguranca" ? (
          <EmptyState
            title="Acesso restrito"
            description="Somente o administrador pode configurar a revenda."
          />
        ) : tab === "geral" ? (
          <Panel title="Informações da revenda">
            <dl className="settings-facts">
              {[
                ["Nome da revenda", ctx.dealership.tradeName],
                ["CNPJ", ctx.dealership.cnpj],
                ["Telefone", ctx.dealership.phone],
                ["Cidade", `${ctx.dealership.city} / ${ctx.dealership.state}`],
                ["Responsável", ctx.user.name],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ) : tab === "identidade" ? (
          <Panel title="Identidade da revenda">
            <div className="branding-content">
              {ctx.dealership.logoUrl ? (
                <Image
                  src="/api/branding"
                  alt="Logo da revenda"
                  width={160}
                  height={110}
                  unoptimized
                  className="dealership-logo"
                />
              ) : (
                <div className="branding-placeholder">
                  <CarFront size={40} />
                </div>
              )}
              <div>
                <h3>Sua marca acompanha seus veículos.</h3>
                <p>
                  Adicione a logo que será utilizada nos materiais da sua
                  revenda.
                </p>
                <BrandingUpload />
              </div>
            </div>
          </Panel>
        ) : tab === "integracoes" ? (
          <Panel title="Conexões da revenda">
            <div className="integration-row">
              <Instagram size={27} />
              <div>
                <h3>Instagram</h3>
                <p>Instagram ainda não conectado.</p>
              </div>
              <span className="small-tag">EM BREVE</span>
            </div>
            <div className="subtle-note">
              A conexão oficial e as publicações serão disponibilizadas em uma
              próxima etapa.
            </div>
          </Panel>
        ) : tab === "seguranca" ? (
          <Panel title="Minha conta">
            <div className="settings-facts">
              <div>
                <span>Nome</span>
                <strong>{ctx.user.name}</strong>
              </div>
              <div>
                <span>E-mail</span>
                <strong>{ctx.user.email}</strong>
              </div>
              <div>
                <span>Perfil nesta revenda</span>
                <strong>
                  {
                    {
                      ADMIN: "Administrador",
                      MANAGER: "Gerente",
                      SALESPERSON: "Vendedor",
                    }[ctx.membership.role]
                  }
                </strong>
              </div>
            </div>
            <div className="info-strip">
              <ShieldCheck size={19} />
              Seu acesso utiliza uma sessão protegida com validade de 7 dias.
            </div>
          </Panel>
        ) : (
          <>
            <div className="plan-overview panel">
              <div>
                <span className="eyebrow">SEU PLANO ATUAL</span>
                <h2>
                  {ctx.dealership.subscriptionStatus === "TRIAL"
                    ? "Período de teste"
                    : plans[ctx.dealership.plan].name}
                </h2>
                <p>
                  {canWrite(ctx.dealership)
                    ? `Teste até ${ctx.dealership.trialEndsAt.toLocaleDateString("pt-BR")}`
                    : "Período encerrado. Seus dados continuam salvos."}
                </p>
              </div>
              <div>
                <span>Veículos cadastrados</span>
                <h3>
                  {stats.used} <small>/ {stats.limit}</small>
                </h3>
                <progress value={stats.used} max={stats.limit} />
              </div>
              <div>
                <span>Limite de usuários</span>
                <h3>{getLimit(ctx.dealership, "users")}</h3>
                <p>Por revenda</p>
              </div>
            </div>
            <div className="plan-grid">
              {Object.entries(plans).map(([k, plan]) => (
                <section
                  key={k}
                  className={`panel plan-card ${k === "PRO" ? "highlight" : ""}`}
                >
                  <div className="eyebrow">
                    {k === "PRO"
                      ? "PLANO PRO"
                      : `PLANO ${plan.name.toUpperCase()}`}
                  </div>
                  <h2>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(plan.monthly / 100)}
                    <small>/mês</small>
                  </h2>
                  <p>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(plan.annual / 100)}{" "}
                    no anual · 30% de desconto
                  </p>
                  <ul>
                    <li>
                      <Check size={15} />
                      {plan.vehicles} veículos novos / mês
                    </li>
                    <li>
                      <Check size={15} />
                      {plan.users} usuários
                    </li>
                    <li>
                      <Check size={15} />
                      {k === "PERFORMANCE"
                        ? "Site e domínio próprio"
                        : "Site no plano anual"}
                    </li>
                  </ul>
                  <span className="small-tag">CONTRATAÇÃO EM BREVE</span>
                </section>
              ))}
            </div>
            <p className="field-hint">
              A cobrança ainda não está habilitada. Nenhum pagamento será
              solicitado nesta versão.
            </p>
          </>
        )}
      </>
    );
  }
  if (module === "equipe") {
    if (!can(ctx.membership.role, "users:manage"))
      return (
        <EmptyState
          title="Acesso restrito"
          description="Somente o administrador pode gerenciar a equipe."
        />
      );
    const members = await (
      await getDb()
    )
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.dealershipId, ctx.dealership.id),
          eq(memberships.status, "ACTIVE"),
        ),
      );
    return (
      <>
        <PageHeader title="Equipe" description={subtitles[module]} />
        <Panel
          title={`${members.length} ${members.length === 1 ? "pessoa na sua equipe" : "pessoas na sua equipe"}`}
        >
          {members.map((m) => (
            <div className="team-row" key={m.id}>
              <span className="avatar">{m.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <h3>{m.name}</h3>
                <p>{m.email}</p>
              </div>
              <span>
                {
                  {
                    ADMIN: "Administrador",
                    MANAGER: "Gerente",
                    SALESPERSON: "Vendedor",
                  }[m.role]
                }
              </span>
              <span className="small-tag">ATIVO</span>
            </div>
          ))}
          <div className="subtle-note">
            Convites e gerenciamento de permissões serão disponibilizados em uma
            próxima etapa.
          </div>
        </Panel>
      </>
    );
  }
  if (module === "relatorios") {
    if (!can(ctx.membership.role, "reports:read"))
      return (
        <EmptyState
          title="Acesso restrito"
          description="Seu perfil não tem permissão para consultar relatórios."
        />
      );
    const stats = await dashboard(ctx);
    return (
      <>
        <PageHeader title="Relatórios" description={subtitles[module]} />
        <div className="report-grid">
          {[
            ["Veículos em estoque", stats.stock],
            ["Valor do estoque", money(stats.value)],
            ["Vendas no mês", stats.sold],
          ].map(([k, v]) => (
            <div className="panel report-card" key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <Panel title="Mais detalhes, em breve">
          <EmptyState
            title="Decisões a partir dos seus dados"
            description="Relatórios de leads, publicações e desempenho estarão disponíveis junto com os próximos módulos."
            icon={Icon}
          />
        </Panel>
      </>
    );
  }
  const tabs =
    module === "studio"
      ? ["Criar conteúdo", "Projetos", "Revisões", "Templates", "Histórico"]
      : module === "publicacoes"
        ? ["Todas", "Rascunhos", "Agendadas", "Publicadas", "Falhas"]
        : [];
  return (
    <>
      <PageHeader
        title={nav.label === "Studio" ? "AutoWeb Studio" : nav.label}
        description={subtitles[module]}
      />
      {contextVehicle && (
        <Link href={`/estoque/${contextVehicle.id}`} className="context-note">
          <ArrowLeft size={16} />
          Veículo selecionado:{" "}
          <strong>
            {contextVehicle.brand} {contextVehicle.model}
          </strong>
        </Link>
      )}
      {tabs.length > 0 && (
        <nav className="tabs" aria-label={`Seções de ${nav.label}`}>
          {tabs.map((t, i) => (
            <Link
              className={(p.tab || tabs[0]) === t ? "active" : ""}
              href={`/${module}?${new URLSearchParams({ tab: t, ...(p.vehicleId ? { vehicleId: p.vehicleId } : {}) })}`}
              key={i}
            >
              {t}
            </Link>
          ))}
        </nav>
      )}
      <section className="panel coming-soon">
        <div className="coming-soon-symbol">
          <Icon size={36} strokeWidth={1.2} />
        </div>
        <span className="small-tag">
          <Clock3 size={12} />
          EM BREVE
        </span>
        <h2>
          {module === "studio"
            ? "Do seu estoque para o seu conteúdo."
            : module === "crm"
              ? "Cada oportunidade tem seu próximo passo."
              : module === "publicacoes"
                ? "Seu conteúdo, pronto para chegar mais longe."
                : module === "site"
                  ? "Sua revenda também vive online."
                  : "Relacionamentos que movem sua revenda."}
        </h2>
        <p>
          {module === "studio"
            ? "A criação de peças estáticas será a próxima etapa. Os veículos e fotos cadastrados aqui alimentarão o Studio."
            : module === "publicacoes"
              ? "Instagram ainda não conectado. Criação, agendamento e envio de publicações serão habilitados após a integração oficial."
              : module === "site"
                ? "O site e a configuração de domínio ainda não estão disponíveis. Nenhum domínio está ativo nesta versão."
                : "Este módulo está planejado para as próximas etapas da AutoWeb. Seu estoque já é o ponto de partida."}
        </p>
        <Link className="button secondary" href="/estoque">
          Ir para o estoque
          <ArrowLeft className="rotate" size={16} />
        </Link>
      </section>
    </>
  );
}
