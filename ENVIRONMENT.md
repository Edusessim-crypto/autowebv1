# Ambiente

## Variáveis

| Variável                  | Uso                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| DATABASE_URL              | PostgreSQL externo. Obrigatório em produção.                                             |
| APP_ORIGIN                | Origem exata autorizada, sem barra final. Local: http://127.0.0.1:3107. Produção: HTTPS. |
| LOCAL_DATA_DIR            | Diretório local de banco e uploads; padrão `.data`.                                      |
| STORAGE_PROVIDER          | `supabase` ativa o Supabase Storage; qualquer outro valor mantém o disco local.          |
| SUPABASE_URL              | URL do projeto Supabase, ex. `https://<ref>.supabase.co`. Exigida com `supabase`.        |
| SUPABASE_SERVICE_ROLE_KEY | Chave `service_role`. Somente servidor: nunca expor ao cliente nem versionar.            |
| SUPABASE_STORAGE_BUCKET   | Bucket privado dos uploads; padrão `vehicle-media`.                                      |
| DEMO_PASSWORD             | Somente seed explícito local, mínimo 12 caracteres.                                      |
| ALLOW_LOCAL_DB            | Escape `true` para verificar build de produção localmente. Nunca usar no deploy real.    |

Arquivos `.env*` reais são ignorados; `.env.example` contém apenas configuração de exemplo. Scripts administrativos devem receber variáveis pelo processo ou `node --env-file`.

## Desenvolvimento

A aplicação inicializa o schema local ao abrir o banco. PGlite permite um único processo por diretório: pare o servidor antes de executar seed/migrações que usem o mesmo diretório. Testes usam um diretório temporário próprio. Datas comerciais seguem America/Sao_Paulo.

`npm run dev` usa `.data` conforme `.env.local`, sem variável adicional. O diretório é descartável: `npm run db:seed` recria a demo inteira, com as fotos versionadas em `assets/demo`. Um cluster PGlite que pare de abrir (`Aborted()` ao consultar) não é recuperável por aqui — apague `.data` e rode o seed novamente.

## Build e Linux

`npm run build` produz Next.js standalone. O Dockerfile prepara Node em Linux e usuário sem privilégios. PostgreSQL externo deve estar acessível; execute as migrações em um job separado antes da aplicação. Produção não inicializa schema automaticamente.

O storage local é intencionalmente bloqueado em produção, onde o filesystem é efêmero. Defina `STORAGE_PROVIDER=supabase` com as variáveis correspondentes e rode `npm run storage:setup` uma vez para criar o bucket privado. O bucket não é público: a leitura continua passando por `/api/media`, que mantém a autorização por revenda. Não monte uploads em `public`.

Configure HTTPS no proxy, `APP_ORIGIN` correta e limites de corpo de 11 MB no ingresso para uploads; 32 KB para JSON. Configure limite de requisições por IP na borda, considerando apenas headers de um proxy confiável. Limites de corpo também são verificados pela aplicação, mas o ingresso deve barrar streams excessivos antes do buffering.

## Jobs e integrações

Nenhum scheduler roda nesta fase. O contrato `JobQueue` impede que publicação futura dependa do navegador. Gateway de cobrança ainda não foi selecionado; `BillingProvider` é contrato, não implementação funcional. Não existem tokens ou publicações simuladas.

## Recuperação e dados

Backups do banco e do storage devem ter política e restauração testada antes do deploy. O modo local é persistente em `.data`, não um ambiente de produção. Não exponha o servidor local à internet.
