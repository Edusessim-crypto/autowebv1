import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  CarFront,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { requireTenant } from "@/server/auth";
import { listVehicles, dashboard } from "@/services/vehicles";
import {
  PageHeader,
  NewVehicleButton,
  EmptyState,
  CarPhoto,
  Badge,
  money,
  number,
} from "@/components/ui";
import { statusLabels } from "@/domain/validation";
import { can } from "@/domain/policies";
export default async function Inventory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  const [result, stats] = await Promise.all([
    listVehicles(ctx, {
      search: p.q,
      status: p.status,
      sort: p.sort,
      page: Number(p.page || 1),
    }),
    dashboard(ctx),
  ]);
  const url = (update: Record<string, string>) =>
    "/estoque?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(p).filter(
          (e): e is [string, string] => e[1] !== undefined,
        ),
      ),
      ...update,
    }).toString();
  return (
    <>
      <PageHeader
        title="Estoque"
        description="Gerencie todos os veículos da sua revenda."
        action={
          can(ctx.membership.role, "vehicles:write") ? (
            <NewVehicleButton />
          ) : undefined
        }
      />
      <div className="stock-summary">
        {[
          { label: "Total de veículos", value: stats.total },
          { label: "Disponíveis", value: stats.available },
          { label: "Reservados", value: stats.reserved },
          { label: "Vendidos no mês", value: stats.sold },
        ].map((s) => (
          <div key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      <form className="inventory-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Buscar marca, modelo ou placa"
            aria-label="Buscar veículos"
          />
        </div>
        <label className="filter-select">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filtrar por status"
            name="status"
            defaultValue={p.status || "ALL"}
          >
            <option value="ALL">Todos os status</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <select
          name="sort"
          aria-label="Ordenação"
          defaultValue={p.sort || "newest"}
        >
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
          <option value="price">Menor preço</option>
        </select>
        <input type="hidden" name="view" value={p.view || "grid"} />
        <button type="submit" className="button secondary">
          Buscar
        </button>
        <div className="view-toggle">
          <Link
            aria-label="Ver em grade"
            className={p.view !== "list" ? "selected" : ""}
            href={url({ view: "grid" })}
          >
            <LayoutGrid size={18} />
          </Link>
          <Link
            aria-label="Ver em lista"
            className={p.view === "list" ? "selected" : ""}
            href={url({ view: "list" })}
          >
            <List size={18} />
          </Link>
        </div>
      </form>
      <div className="results-caption">
        <span>
          {result.total}{" "}
          {result.total === 1 ? "veículo encontrado" : "veículos encontrados"}
        </span>
        {(p.q || (p.status && p.status !== "ALL")) && (
          <Link href="/estoque">Limpar filtros</Link>
        )}
      </div>
      {result.items.length ? (
        <div
          className={p.view === "list" ? "inventory-list" : "inventory-grid"}
        >
          {result.items.map((v) => (
            <Link href={`/estoque/${v.id}`} className="vehicle-card" key={v.id}>
              <div className="vehicle-card-photo">
                <CarPhoto src={v.coverUrl} alt={`${v.brand} ${v.model}`} />
                <Badge status={v.status} />
              </div>
              <div className="vehicle-card-body">
                <div className="vehicle-brand">{v.brand}</div>
                <h2>{v.model}</h2>
                <p>{v.version || v.transmission}</p>
                <div className="vehicle-specs">
                  <span>
                    {v.yearManufacture}/{v.yearModel}
                  </span>
                  <span>{number(v.mileage)} km</span>
                  <span>{v.fuel}</span>
                </div>
                <div className="vehicle-card-footer">
                  <strong>{money(v.price)}</strong>
                  <span>
                    Ver ficha <ChevronRight size={15} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title={
              stats.total
                ? "Nenhum veículo encontrado"
                : "Nenhum veículo cadastrado"
            }
            description={
              stats.total
                ? "Tente outra busca ou remova os filtros."
                : "Adicione seu primeiro veículo e comece a organizar sua operação."
            }
            icon={CarFront}
            action={
              stats.total ? (
                <Link className="button secondary" href="/estoque">
                  Limpar filtros
                </Link>
              ) : can(ctx.membership.role, "vehicles:write") ? (
                <NewVehicleButton />
              ) : undefined
            }
          />
        </div>
      )}
      <div className="pagination">
        <span>
          Página {result.page} de {result.pages}
        </span>
        <div>
          {result.page > 1 && (
            <Link
              className="button secondary"
              href={url({ page: String(result.page - 1) })}
            >
              <ChevronLeft size={16} />
              Anterior
            </Link>
          )}
          {result.page < result.pages && (
            <Link
              className="button secondary"
              href={url({ page: String(result.page + 1) })}
            >
              Próxima
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
