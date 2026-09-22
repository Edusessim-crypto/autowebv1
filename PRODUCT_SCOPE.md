# Escopo do produto

Princípio: **Cadastre uma vez. A AutoWeb faz o resto.** O veículo é o centro de estoque, conteúdo, distribuição, site e vendas.

## Primeira entrega implementada

- Projeto novo e identidade oficial, sem dependência de outro produto.
- Design tokens, AppShell, sidebar agrupada, menu de perfil e drawer mobile.
- Componentes reutilizáveis de ação, painel, status, imagem, estado vazio, formulário, skeleton e diálogo.
- Cadastro, login, logout, onboarding de revenda, membership e RBAC.
- Trial de 7 dias/5 veículos, planos centralizados e controle atômico de utilização.
- Painel com estoque e vendas consultados do banco; módulos futuros identificados.
- Estoque com busca, filtro, ordenação, grid/lista e paginação de 12 itens.
- Cadastro e edição em duas etapas, preço, opcionais, placa e cinco status.
- Ficha com dados, fotos, histórico e contexto para módulos futuros.
- Upload validado, capa, ordem e exclusão de fotos; logo da revenda.
- Equipe atual em leitura, resumo real de estoque/vendas, dados da revenda e informações dos planos.
- Seed demonstrativo opcional e testes de regras centrais.

## Fase seguinte: Studio

Criar ContentTemplate e ContentProject com autorização por tenant. Fluxo veículo → fotos → template → preview → composição estática → revisão → exportação. Legenda deve usar somente dados cadastrados. Sem vídeos/Reels. Personalização obedece entitlements. Gerar assets via serviço independente, com estados reais de processamento/erro.

## Fase CRM

Customer, Lead, atividades e timeline. Etapas NOVO, CONTATADO, QUALIFICADO, VISITA, PROPOSTA, VENDA e PERDIDO. Vínculos com veículo e vendedor validados na mesma revenda. Mudança de etapa pelo detalhe antes de drag-and-drop. WhatsApp via link real.

## Fase publicações

SocialPost, credenciais criptografadas, conexão oficial Instagram, job idempotente e agenda independente de navegador. Sem credenciais, nenhuma publicação é enviada ou marcada como publicada.

## Fase site

Um template de site, estoque público, ficha, formulário de interesse criando lead. Entitlements: Start/Pro anual com site; Performance mensal/anual com site e domínio. Validação real de DNS antes de status ativo.

## Fase gestão

Convites e limite de usuários transacional; seleção de revenda; multiunidade Performance; relatórios de dados reais; edição de dados cadastrais; seleção de gateway e ativação de cobrança. Nenhum pagamento está habilitado.

## Fora da primeira versão

Reels, vídeo, financeiro completo, emissão fiscal, documentação veicular, financiamento, avaliação de usado, marketplaces e WhatsApp omnichannel. Landing page comercial fora deste projeto inicial.

## Pendências para operação pública

S3/R2, verificação e recuperação de conta, cadastro comercial de assinatura, controle de migrações, backups, monitoramento, revisão de segurança/privacidade, testes de implantação em PostgreSQL externo e Linux. A fundação local não deve ser apresentada como plataforma integralmente pronta para produção.
