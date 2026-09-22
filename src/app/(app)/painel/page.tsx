import Link from "next/link";
import {
  CarFront,
  UsersRound,
  CalendarClock,
  KeyRound,
  ArrowUpRight,
  Plus,
  ImagePlus,
  Check,
  ChevronRight,
  Store,
  Layers3,
} from "lucide-react";
import { requireTenant } from "@/server/auth";
import { dashboard, listVehicles } from "@/services/vehicles";
import {
  PageHeader,
  NewVehicleButton,
  Panel,
  EmptyState,
  Badge,
  CarPhoto,
  money,
  number,
} from "@/components/ui";
import { can } from "@/domain/policies";
export default async function Dashboard() {
  const ctx = await requireTenant();
  const [stats, recent] = await Promise.all([
    dashboard(ctx),
    listVehicles(ctx),
  ]);
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const write = can(ctx.membership.role, "vehicles:write");
  const metrics = [
    {
      label: "VEÍCULOS EM ESTOQUE",
      value: stats.stock,
      icon: CarFront,
      sub: `${stats.available} disponíveis para venda`,
      href: "/estoque",
    },
    {
      label: "NOVOS LEADS",
      value: 0,
      icon: UsersRound,
      sub: "CRM disponível em breve",
      href: "/crm",
    },
    {
      label: "PUBLICAÇÕES AGENDADAS",
      value: 0,
      icon: CalendarClock,
      sub: "Publicações em breve",
      href: "/publicacoes",
    },
    {
      label: "VENDAS NO MÊS",
      value: stats.sold,
      icon: KeyRound,
      sub: "Veículos marcados como vendidos",
      href: "/estoque?status=SOLD",
    },
  ];
  return (
    <>
      <PageHeader
        title="Painel da revenda"
        description={`Visão geral · ${month}`}
        action={write ? <NewVehicleButton /> : undefined}
      />
      {ctx.dealership.isDemo && (
        <div className="demo-note">
          Ambiente de demonstração · Os veículos e a revenda são fictícios.
        </div>
      )}
      <section className="metrics" aria-label="Resumo da operação">
        {metrics.map((m) => (
          <Link href={m.href} className="metric-card" key={m.label}>
            <div className="metric-top">
              <span>{m.label}</span>
              <m.icon size={20} strokeWidth={1.5} />
            </div>
            <strong>{number(m.value)}</strong>
            <div className="metric-bottom">
              <span>{m.sub}</span>
              <ArrowUpRight size={15} />
            </div>
          </Link>
        ))}
      </section>
      <div className="dashboard-grid">
        <Panel
          title="Estoque recente"
          link={{ href: "/estoque", label: "Ver estoque" }}
          className="recent-stock"
        >
          {recent.items.length ? (
            <div className="vehicle-rows">
              {recent.items.slice(0, 4).map((v) => (
                <Link
                  className="vehicle-row"
                  href={`/estoque/${v.id}`}
                  key={v.id}
                >
                  <CarPhoto src={v.coverUrl} alt={`${v.brand} ${v.model}`} />
                  <div className="vehicle-row-info">
                    <h3>
                      {v.brand} {v.model}
                    </h3>
                    <p>{v.version || v.transmission}</p>
                    <small>
                      {v.yearModel} <b>·</b> {number(v.mileage)} km <b>·</b>{" "}
                      {v.fuel}
                    </small>
                  </div>
                  <div className="vehicle-row-end">
                    <Badge status={v.status} />
                    <strong>{money(v.price)}</strong>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Seu estoque começa aqui"
              description="Cadastre o primeiro veículo e reúna as informações da sua revenda em um só lugar."
              icon={CarFront}
              action={
                write ? (
                  <Link className="button secondary" href="/estoque/novo">
                    <Plus size={17} />
                    Cadastrar primeiro veículo
                  </Link>
                ) : undefined
              }
            />
          )}
          <div className="panel-bottom">
            <span>Valor dos veículos em estoque</span>
            <strong>{money(stats.value)}</strong>
          </div>
        </Panel>
        <Panel title="Leads recentes" link={{ href: "/crm", label: "Ver CRM" }}>
          <EmptyState
            title="Novas oportunidades, em breve"
            description="O CRM vai conectar os interessados aos veículos da sua revenda."
            icon={UsersRound}
          />
          <div className="subtle-note">
            <span className="small-tag">PRÓXIMA ETAPA</span> Seu relacionamento
            com clientes começa aqui.
          </div>
        </Panel>
      </div>
      <div className="dashboard-lower">
        <Panel title="Prepare sua revenda">
          <div className="setup-steps">
            {[
              {
                done: true,
                icon: Store,
                title: "Sua revenda, seu espaço",
                description: "Dados da revenda cadastrados",
                href: "/configuracoes",
              },
              {
                done: !!ctx.dealership.logoUrl,
                icon: ImagePlus,
                title: "Dê a sua identidade",
                description: "Adicione a logo da sua revenda",
                href: "/configuracoes?tab=identidade",
              },
              {
                done: stats.total > 0,
                icon: CarFront,
                title: "Coloque seu estoque em movimento",
                description: "Cadastre seu primeiro veículo",
                href: "/estoque/novo",
              },
            ].map((s, i) => (
              <Link className="setup-step" key={s.title} href={s.href}>
                <span className={`step-number ${s.done ? "done" : ""}`}>
                  {s.done ? (
                    <Check size={16} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.description}</p>
                </div>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </Panel>
        <section className="usage-panel">
          <div className="usage-title">
            <span className="line-icon">
              <Layers3 size={19} />
            </span>
            <span>Seu espaço para crescer</span>
          </div>
          <h2>
            {ctx.dealership.subscriptionStatus === "TRIAL"
              ? "Explore a AutoWeb"
              : "Plano " + ctx.dealership.plan}
          </h2>
          <p>
            {ctx.dealership.subscriptionStatus === "TRIAL"
              ? "Um novo jeito de organizar sua operação."
              : "Acompanhe o uso do seu plano."}
          </p>
          <div className="usage-count">
            <span>Veículos cadastrados no período</span>
            <strong>
              {stats.used}
              <span> / {stats.limit}</span>
            </strong>
          </div>
          <progress value={stats.used} max={stats.limit} />
          <Link href="/configuracoes?tab=plano">
            Ver meu plano
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
