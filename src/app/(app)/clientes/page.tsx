import Link from "next/link";
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
} from "lucide-react";
import { requireTenant } from "@/server/auth";
import { listCustomers } from "@/services/customers";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatPhone, whatsappLink } from "@/domain/crm";

function when(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  const result = await listCustomers(ctx, {
    search: p.q,
    page: Number(p.page || 1),
  });
  const url = (update: Record<string, string>) =>
    "/clientes?" +
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
        title="Clientes"
        description="Organize seus clientes e mantenha todo o histórico em um só lugar."
        action={
          <Link className="button primary" href="/clientes/novo">
            <Plus size={18} />
            Novo cliente
          </Link>
        }
      />
      <form className="inventory-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Buscar nome, telefone ou e-mail"
            aria-label="Buscar clientes"
          />
        </div>
        <button type="submit" className="button secondary">
          Buscar
        </button>
      </form>
      <div className="results-caption">
        <span>
          {result.total}{" "}
          {result.total === 1 ? "cliente encontrado" : "clientes encontrados"}
        </span>
        {p.q && <Link href="/clientes">Limpar busca</Link>}
      </div>
      {result.items.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Oportunidades</th>
                <th>Último contato</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {result.items.map((c) => {
                const phone = c.whatsapp || c.phone;
                return (
                  <tr key={c.id}>
                    <td data-label="Cliente">
                      <Link className="cell-title" href={`/clientes/${c.id}`}>
                        {c.name}
                      </Link>
                      {c.email && <span className="cell-sub">{c.email}</span>}
                    </td>
                    <td data-label="Telefone">
                      {phone ? formatPhone(phone) : "—"}
                    </td>
                    <td data-label="Oportunidades">
                      {c.openLeads > 0 ? (
                        <span className="pill">{c.openLeads} aberta(s)</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Último contato">{when(c.lastContactAt)}</td>
                    <td className="cell-actions">
                      {c.whatsapp && (
                        <a
                          className="icon-action"
                          href={whatsappLink(c.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Abrir WhatsApp de ${c.name}`}
                        >
                          <MessageCircle size={16} />
                        </a>
                      )}
                      <Link className="cell-link" href={`/clientes/${c.id}`}>
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={p.q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={
            p.q
              ? "Tente outro nome ou telefone."
              : "Cadastre o primeiro cliente para começar a registrar oportunidades."
          }
          action={
            !p.q ? (
              <Link className="button primary" href="/clientes/novo">
                <Plus size={18} />
                Novo cliente
              </Link>
            ) : undefined
          }
        />
      )}
      {result.pages > 1 && (
        <nav className="pagination" aria-label="Paginação">
          <Link
            aria-disabled={result.page === 1}
            href={url({ page: String(Math.max(1, result.page - 1)) })}
          >
            <ChevronLeft size={16} />
          </Link>
          <span>
            Página {result.page} de {result.pages}
          </span>
          <Link
            aria-disabled={result.page === result.pages}
            href={url({
              page: String(Math.min(result.pages, result.page + 1)),
            })}
          >
            <ChevronRight size={16} />
          </Link>
        </nav>
      )}
    </>
  );
}
