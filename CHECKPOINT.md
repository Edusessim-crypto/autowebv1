# Checkpoint — Fase A: Clientes e CRM

22 de setembro de 2026. Commits `f3c7f38` (modelagem e serviços) e `a9f7295` (interface).

Uma revenda já consegue percorrer o primeiro fluxo comercial completo: cadastrar um veículo, cadastrar um cliente, registrar o interesse nesse veículo, atribuir a um vendedor, acompanhar no funil e marcar venda ou perda.

## Novas tabelas

`migrations/0002_crm.sql`, aplicada em produção.

| Tabela           | Papel                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `customers`      | Cliente da revenda: nome, telefone, WhatsApp, e-mail, notas          |
| `leads`          | Oportunidade comercial, com veículo e responsável opcionais          |
| `crm_activities` | Histórico: anotação, ligação, WhatsApp, mudança de etapa, atribuição |

Índices: `customer_tenant_idx`, `customer_phone_idx`, `lead_stage_idx`, `lead_assigned_idx`, `lead_vehicle_idx`, `lead_customer_idx`, `activity_lead_idx`. Cada um responde a uma consulta real do funil, não indexação preventiva.

Uma única entidade representa lead e oportunidade, como orientado.

## Novas rotas

Páginas: `/clientes`, `/clientes/novo`, `/clientes/[id]`, `/clientes/[id]/editar`, `/crm`, `/crm/novo`.

API: `GET POST /api/customers` · `GET PATCH /api/customers/[id]` · `GET POST /api/leads` · `GET PATCH /api/leads/[id]` · `POST /api/leads/[id]/stage` · `POST /api/leads/[id]/activities` · `POST /api/leads/[id]/assign`.

## Regras de negócio

`src/domain/crm.ts` não conhece HTTP, banco nem storage:

- Sete etapas e sete origens, com rótulos em português.
- `SALESPERSON` lê apenas as oportunidades atribuídas a si e só pode atribuir a si mesmo. A restrição é aplicada em SQL, dentro do serviço, e não depende da interface.
- Telefones são normalizados para dígitos na gravação, aceitando 10 ou 11 dígitos com ou sem o código 55.
- Um cliente exige nome e ao menos um contato.
- Marcar como perdido exige motivo.

Nada foi duplicado: permissões usam `crm:manage` já existente, limites de plano continuam em `domain/plans`, e a auditoria usa `audit_logs`.

## Auditoria

`customer.created`, `customer.updated`, `lead.created`, `lead.assigned`, `lead.stage_changed`, `lead.won`, `lead.lost`. A mudança de etapa grava lead, atividade e auditoria na mesma transação.

## Integrações

- Ficha do veículo: aba **Leads** com contagem e lista dos interessados, além de "Adicionar lead" já com o veículo preenchido.
- Painel: "Novos leads" e "Leads recentes" com dados reais, mais aviso de oportunidades com próxima ação vencida.
- Ficha do cliente: oportunidades abertas e histórico das fechadas.

## Testes

`tests/crm.test.ts`, cinco casos somados aos quatro da fundação — nove ao todo, todos passando:

1. Isolamento por revenda em clientes e oportunidades, incluindo a tentativa de usar cliente de outra revenda.
2. Vendedor enxerga apenas o próprio funil e não consegue repassar oportunidade a colega.
3. Etapas, obrigatoriedade do motivo da perda e histórico de atividades.
4. Oportunidade ligada a veículo, contagem para o painel e recusa de veículo de outra revenda.
5. Regras de domínio: normalização de telefone, link do WhatsApp e visibilidade.

`typecheck`, `lint`, `test` e `build` passam.

## Correções de infraestrutura

**Carregador de migrações.** `db.ts` e `scripts/migrate.ts` liam apenas `0001_foundation.sql`, com nome fixo. Qualquer migração nova ficaria fora de produção. Ambos passam a aplicar todos os arquivos `.sql` em ordem de nome.

**Ambiente local.** `.data` estava corrompido e não abria nem para uma consulta; o backup também não. Foi recriado pelo seed, que reconstrói a demo com as fotos versionadas. `npm run dev` volta a funcionar sem `LOCAL_DATA_DIR` manual.

**Produção.** O banco tinha 13 tabelas de um projeto Prisma anterior, todas vazias, entre elas `customers` e `leads` em `camelCase`, incompatíveis. Foram removidas com autorização, junto dos 19 tipos enum órfãos. Veículos, fotos, usuários e sessões não foram tocados.

## Pendências

Desta fase, deliberadamente adiadas:

- Arraste no funil. A etapa muda por ação explícita, validada no servidor.
- Definir próxima ação com data pela interface; o serviço e a coluna já existem.
- Aviso de cliente duplicado na criação; `findByContact` já existe e não está ligado à interface.
- Paginação do funil por coluna: cada uma carrega no máximo 25 cartões e informa o total.

Anteriores, sem relação com esta fase: recuperação de senha, convites de equipe, cobrança, limpeza de arquivos órfãos no storage, substituição das fotos de demonstração com licença CC e remoção de `/api/health/storage`.

## Próxima fase

Studio, conforme o plano. Não iniciada.
