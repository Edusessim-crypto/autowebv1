# Ambiente

## Variáveis

| Variável         | Uso                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------- |
| DATABASE_URL     | PostgreSQL externo. Obrigatório em produção.                                             |
| APP_ORIGIN       | Origem exata autorizada, sem barra final. Local: http://127.0.0.1:3107. Produção: HTTPS. |
| LOCAL_DATA_DIR   | Diretório local de banco e uploads; padrão `.data`.                                      |
| STORAGE_PROVIDER | Reserva para seleção de provedor. Nesta fase somente local; S3/R2 requer implementação.  |
| DEMO_PASSWORD    | Somente seed explícito local, mínimo 12 caracteres.                                      |
| ALLOW_LOCAL_DB   | Escape `true` para verificar build de produção localmente. Nunca usar no deploy real.    |

Arquivos `.env*` reais são ignorados; `.env.example` contém apenas configuração de exemplo. Scripts administrativos devem receber variáveis pelo processo ou `node --env-file`.

## Desenvolvimento

A aplicação inicializa o schema local ao abrir o banco. PGlite permite um único processo por diretório: pare o servidor antes de executar seed/migrações que usem o mesmo diretório. Testes usam um diretório temporário próprio. Datas comerciais seguem America/Sao_Paulo.

## Build e Linux

`npm run build` produz Next.js standalone. O Dockerfile prepara Node em Linux e usuário sem privilégios. PostgreSQL externo deve estar acessível; execute as migrações em um job separado antes da aplicação. Produção não inicializa schema automaticamente.

A interface de storage local é intencionalmente bloqueada em produção. Implemente S3/R2 (upload/leitura/remoção) e retenha autorização na rota de acesso. Não monte uploads em `public`.

Configure HTTPS no proxy, `APP_ORIGIN` correta e limites de corpo de 11 MB no ingresso para uploads; 32 KB para JSON. Configure limite de requisições por IP na borda, considerando apenas headers de um proxy confiável. Limites de corpo também são verificados pela aplicação, mas o ingresso deve barrar streams excessivos antes do buffering.

## Jobs e integrações

Nenhum scheduler roda nesta fase. O contrato `JobQueue` impede que publicação futura dependa do navegador. Gateway de cobrança ainda não foi selecionado; `BillingProvider` é contrato, não implementação funcional. Não existem tokens ou publicações simuladas.

## Recuperação e dados

Backups do banco e do storage devem ter política e restauração testada antes do deploy. O modo local é persistente em `.data`, não um ambiente de produção. Não exponha o servidor local à internet.
