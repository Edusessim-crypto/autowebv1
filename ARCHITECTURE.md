# Arquitetura

## Stack

Next.js App Router, React, TypeScript estrito, Tailwind CSS 4 + tokens CSS, Drizzle ORM e PostgreSQL. Inter/Poppins são servidas localmente. Lucide fornece ícones e Radix fornece menu, drawer e diálogo acessíveis.

- `src/app`: rotas, composição das páginas e handlers HTTP.
- `src/components`: componentes de apresentação e interações de formulário.
- `src/domain`: validação, permissões e regras de planos.
- `src/services`: casos de uso de estoque, mídia, clientes, CRM e Studio.
- `services/render-worker`: serviço Python que gera as peças do Studio.
- `src/server`: acesso ao banco, schema, autenticação e storage.
- `src/config`: navegação.
- `migrations`: SQL versionado, aplicado em ordem de nome. Cada arquivo é idempotente, então repetir o conjunto leva qualquer banco ao schema atual.

## Autenticação

Senhas são derivadas com scrypt e salt aleatório. Sessões opacas têm 256 bits aleatórios; somente seu SHA-256 é armazenado. O cookie é HttpOnly, SameSite=Lax e Secure em HTTPS. A sessão expira em 7 dias. Logout exclui a sessão no servidor. As mutações exigem Origin exata, validação Zod e sessão válida. Tentativas de login/cadastro são limitadas no banco por identificador de conta, sem armazenar e-mail na chave.

Antes de lançamento público: verificação de e-mail, recuperação de senha, monitoramento e limitação adicional por IP confiável na borda. Não há recuperação de senha fictícia.

## Isolamento multiempresa

`User` é independente de `Dealership`, ligado por `Membership`. A sessão carrega a revenda ativa; o servidor revalida a membership ativa a cada consulta. O cliente não escolhe o tenant nas mutações. Todas as consultas operacionais incluem `dealershipId`. Mídia usa chave estrangeira composta para impedir vínculo entre revendas. O schema permite múltiplas memberships; seletor de revenda fica para uma próxima fase.

Os limites e permissões são executados no servidor. A interface esconde ações sem permissão, mas isso não é o controle de segurança. Funções de serviço recebem um contexto obtido por `requireTenant`.

## Quota e trial

Criação adquire lock da revenda em transação; valida assinatura; incrementa uso e insere veículo/auditoria na mesma transação. Várias requisições simultâneas não ultrapassam o limite. Trial usa um único período `trial`, não é reiniciado na virada do mês. Contas ativas usam mês no fuso America/Sao_Paulo. Editar ou marcar vendido não consome novo cadastro. Expiração bloqueia escrita sem apagar dados.

## Fotos

Upload máximo de 10 MB, até 30 imagens por veículo, MIME/extensão e decodificação real por Sharp, limite de pixels e bloqueio de imagens animadas. A imagem é reprocessada para WebP com metadados removidos; thumbnail própria. Nomes enviados não são utilizados como caminho. A rota de leitura exige sessão e tenant. Capa, remoção e ordenação são persistidas no banco.

`StorageProvider` possui implementação local para desenvolvimento. Produção falha explicitamente enquanto não houver implementação S3/R2, impedindo uso acidental do filesystem efêmero. A limpeza de arquivos órfãos e antivírus adicional são evolução operacional.

## Banco e implantação

O modo local usa PGlite, motor PostgreSQL embarcado. Produção usa `pg` e PostgreSQL externo, com o mesmo schema e Drizzle. Migração inicial é idempotente. Próximas alterações devem acrescentar migrações numeradas e um controle de aplicação/checksum antes de múltiplas versões em produção. PostgreSQL externo precisa de backup e migração em etapa única da implantação.

## Próximos módulos

Branch, Customer, Lead, ContentTemplate, ContentProject, SocialPost e SiteConfig serão introduzidos nas suas fases, sempre com vínculo explícito à revenda. Não existem tabelas e integrações vazias fingindo funcionalidade. Os provedores de cobrança e jobs estão delimitados como contratos; não executam cobranças ou publicações.

## CRM

`customers`, `leads` e `crm_activities` seguem o isolamento por revenda das demais tabelas. Uma oportunidade pode apontar para um veículo e para um responsável, ambos opcionais, e os três vínculos são verificados contra a revenda antes de gravar.

A visibilidade do vendedor é aplicada em SQL, não na interface: `ADMIN` e `MANAGER` leem o funil inteiro, `SALESPERSON` apenas as oportunidades atribuídas a si, e só pode atribuir uma oportunidade a si mesmo. Telefones são normalizados para dígitos na gravação, de modo que busca e deduplicação concordem.

A mudança de etapa grava atividade e log de auditoria na mesma transação do lead. Marcar como perdido exige motivo.

## Studio

O motor visual roda num serviço Python separado, fora da Vercel, porque carrega
PyTorch e YOLO. A aplicação autentica, autoriza, monta o payload e grava o
resultado; o worker só renderiza e não consulta o banco da AutoWeb.

`content_projects`, `render_jobs` e `generated_assets` seguem o isolamento por
revenda. Cada peça guarda o enquadramento e as métricas de QC, o que permite
reeditar um card sem reprocessar o lote.

Detalhes em `docs/STUDIO_RENDER_ARCHITECTURE.md`.
