# AutoWeb

Plataforma independente para gestão de pequenas e médias revendas brasileiras. Primeira entrega funcional: acesso, revenda, trial, painel, estoque e ficha do veículo. A interface usa a logo oficial fornecida e a referência aprovada do painel.

## Executar localmente

Requisitos: Node.js 22.12+ e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Abra http://127.0.0.1:3107. Crie uma conta e cadastre sua revenda. Contas novas começam vazias; o teste permite 5 veículos durante 7 dias. Use o mesmo endereço definido em `APP_ORIGIN`.

Sem `DATABASE_URL`, o desenvolvimento usa PostgreSQL embarcado (PGlite), persistido em `.data/postgres`. Não é SQLite nem armazenamento do navegador. Fotos ficam em `.data/uploads`, fora da pasta pública e protegidas pela sessão.

## PostgreSQL externo

Defina `DATABASE_URL` e execute as migrações antes de iniciar a aplicação:

```sh
npm run db:migrate
npm run dev
```

Os scripts de banco leem as variáveis do processo. Para carregar um arquivo de ambiente: `node --env-file=.env.local --import tsx scripts/migrate.ts`.

## Demonstração opcional

Nunca executada automaticamente. Execute com uma senha escolhida por você:

```sh
DEMO_PASSWORD='uma-senha-local-com-12-caracteres' npm run db:seed
```

Acesso: `demo@autoweb.example`. O seed cria a revenda fictícia **Horizonte Seminovos · Demo**, marcada como demonstração, e três veículos fictícios sem fotos. Não cria leads, publicações ou vendas inexistentes. Execute o seed antes de iniciar o servidor ao usar PGlite, pois o diretório pertence a um único processo.

## Verificações

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes usam um banco temporário próprio. Validam isolamento, RBAC, quota concorrente, edição sem consumo, expiração do trial, senhas e entitlements. A validação HTTP está em `scripts/check-http.mjs` e depende de um servidor de teste dedicado.

## Documentação

- [Arquitetura](ARCHITECTURE.md)
- [Escopo e próximas fases](PRODUCT_SCOPE.md)
- [Ambiente e implantação](ENVIRONMENT.md)
- [Validação](docs/VALIDATION.md)

Esta entrega é uma fundação local executável. Studio, CRM, publicações e site têm estados explícitos de indisponibilidade. Integrações e cobrança não estão ativas.
