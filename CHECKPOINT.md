# Checkpoint — Etapa 2A: motor de render integrado

23 de setembro de 2026. Commit `8605a8d`.

O motor visual validado da Carmulti passou a ser um serviço da AutoWeb, sem
reescrita geométrica. Um veículo com fotos no estoque já produz peças
1080×1350 pelo caminho completo: projeto persistido, job no worker, cards no
object storage e metadados no banco.

## Arquitetura

```
Next.js (Vercel)            Render Worker (Docker/VPS)
  autentica                   recebe payload pronto
  autoriza                    baixa fotos (URL temporária)
  valida plano                YOLO + enquadramento + QC
  persiste job         ->     compõe o card
  grava resultado      <-     devolve RenderResult
```

O worker não conhece sessão, CRM, plano nem banco da AutoWeb, e não consulta o
PostgreSQL principal.

## Diretórios criados

```
services/render-worker/
  app/          contratos, pipeline, API, storage, templates, ponte
  engine/       cards_carmulti.py (intocado) + ORIGEM.md
  templates/    4 PNGs: 2 herdados + 2 neutros da AutoWeb
  assets/       yolo11n-seg.pt + fontes Barlow
  tools/        build_templates.py, regression.py
  tests/        geometria (11) e integração (4)
docs/STUDIO_RENDER_ARCHITECTURE.md
```

## Motor preservado

`engine/cards_carmulti.py` — **nenhuma alteração**.

    SHA-256  8762f97b4e227b5b2c8f9d8addd0250f56b93080a7814c65a7e2972b581e6226

Igual ao original em `CARMULTI_V7_COMPLETO` e ao ZIP de referência (os três
hashes conferem). Teste automatizado verifica as constantes calibradas:
`ALTURA_ALVO` 0.90, `LARGURA_MAXIMA` 0.94, `MARGEM_INFERIOR_ALVO` 0.045,
`ZOOM_MAXIMO` 2.20, `ALTURA_ALVO_MOTO` 0.88, `LARGURA_MAXIMA_MOTO` 0.84,
`LIMIAR_FOTO_INTEIRA` 0.92, `PROTECAO_CAIXA` 0.025.

### Sobre o os.chdir

Não foi preciso mexer no motor: o `os.chdir` estava em `carmulti-api/app/
motor.py`, não em `cards_carmulti.py`, que já recebe `pasta_script` por
parâmetro. A ponte resolve caminhos de forma absoluta e nunca troca o cwd.

## YOLO

    yolo11n-seg.pt
    SHA-256  55ed65c56c91713d23e8402371c6c49a6fd84f257f7dce452e8d70e41dcbe152
    6.182.636 bytes

Versionado no repositório e carregado do disco. Teste confirma que o arquivo
existe e que o detector sobe sem baixar nada.

## Dependências

`requirements.lock.txt` fixa o que roda hoje: Pillow 12.3.0, numpy 2.5.3,
opencv-python-headless 4.10.0.84, ultralytics 8.4.160, torch 2.14.0, fastapi
0.141.1, pydantic 2.13.5.

O `ultralytics` puxa `opencv-python`, que instalava a 5.0.0 por cima do
headless 4.10 fixado. Os dois fornecem o mesmo módulo `cv2`, então removemos o
não-headless — no ambiente local e no Dockerfile.

## Schema

`migrations/0003_studio.sql`, aplicada em produção com os dados intactos.

| Tabela             | Papel                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `content_projects` | Projeto: veículo, template versionado, status, fotos escolhidas              |
| `render_jobs`      | Uma linha por tentativa, com `attempt`, `engineVersion` e o erro daquela vez |
| `generated_assets` | Peça gerada: chave no storage, enquadramento, métricas, alertas              |

Índices por revenda e pelas consultas reais (projeto por veículo, job por
projeto, asset por posição).

## Contratos

`RenderInput` v1: revenda (nome, logo, cores, contatos), veículo, fotos com
ordem e `mediaId`, template (chave, versão, variante) e configurações.

`RenderResult`: por card, `sourceMediaId`, posição, `storageKey`, dimensões,
grupo, tipo detectado, status, enquadramento (zoom e âncoras), métricas de QC
e alertas; mais estatísticas do lote e código de erro quando falha.

Erros classificados: INVALID_INPUT, INPUT_DOWNLOAD_FAILED, MODEL_LOAD_FAILED,
RENDER_FAILED, UPLOAD_FAILED, TIMEOUT, INTERNAL_ERROR. O banco guarda código e
mensagem técnica; a interface recebe texto amigável.

## Storage

As fotos chegam ao worker por URL assinada de 15 minutos — o bucket continua
privado. O banco guarda a `storageKey`, nunca a URL. As peças saem em

    dealerships/{dealershipId}/content/{projectId}/{jobId}/card-01.png

O `keyPattern` do storage da AutoWeb foi estendido para aceitar essas chaves;
antes só permitia `vehicles|branding` em `.webp`, e teria recusado as peças.

## Segurança

Autenticação por `x-worker-token` comparado com `compare_digest`: 401 sem
token ou com token errado, verificado por requisição real. O `dealershipId` do
payload serve para rastreabilidade e para compor a chave — a autorização
acontece antes, na AutoWeb, e tem teste.

## Estados e concorrência

Projeto: DRAFT, QUEUED, PROCESSING, REVIEW, COMPLETED, FAILED. Uma peça
reprovada no QC leva o projeto a REVIEW, não a FAILED.

Um job por processo (`RENDER_CONCURRENCY=1`). O estado vive no PostgreSQL: um
worker reiniciado não apaga o que aconteceu. O mesmo `jobId` reenviado devolve
o estado atual sem renderizar de novo — verificado.

Staging em `/tmp/autoweb-render/{jobId}/`, removido ao concluir ou falhar, com
varredura de pastas órfãs no start.

## Docker

`python:3.12-slim` com libgl/libglib para o OpenCV, instalação pelo lock,
remoção do opencv não-headless, `/tmp` para staging, porta 8080, health check
e um worker por processo. Produção sugerida: 2 vCPU, 4 GB, 2 GB de disco
temporário.

## Testes

Worker — 15, todos passando:

- 11 geométricos, sem YOLO: constantes calibradas, base do veículo assentada
  na linha (margem inferior converge para 0.045), teto de zoom, parâmetros
  próprios de moto, QC de carro e de moto, recorte, sufixos manuais, slot.
- 4 de integração, com YOLO: modelo local existe e carrega, render completo
  1080×1350 com vínculo à mídia, ordem preservada e staging limpo.

AutoWeb — 16, todos passando (7 novos do Studio): isolamento de projetos e
peças, recusa de mídia de outro veículo e de outra revenda, vendedor sem
`studio:manage`, limites de fotos, persistência com metadados, direitos de
plano e a confirmação de que gerar conteúdo não consome cota de veículo.

`typecheck`, `lint`, `test` e `build` passam.

## Render de validação

Executado pela API do worker, com token, fotografia servida por HTTP:

    status COMPLETED · engine carmulti-v7-autoweb-1 · 1568 ms
    card-01.png · zoom 1.831 · âncoras 0.512 / 0.790
    métricas: largura 0.940 · margem_inferior 0.045

Os dois últimos números são a prova de que o motor está preservado:
`largura` bate com `LARGURA_MAXIMA` e `margem_inferior` com
`MARGEM_INFERIOR_ALVO`. A âncora vertical em 0.79 mostra que o motor assentou
a base do veículo em vez de centralizar a caixa.

## Divergências conhecidas em relação ao motor original

1. **Interiores usam zoom 1.0, não `ZOOM_FULL` (1.03).** Divergência herdada
   da API validada, que a documentou: o 1.03 cortava as bordas sem ganho.
2. **Ordenação automática desligada.** `montar_ordem()` existe e não é
   chamada: a AutoWeb preserva a ordem do usuário (`as_provided`).
3. **`analisar_fotos()` reimplementada na ponte.** A original vive em
   `carmulti_auto.py`, que carrega telefone, endereço e cores da Carmulti e
   por isso não pode ser importado. A ponte chama as mesmas funções do motor,
   na mesma ordem.
4. **Textos e branding reescritos.** As coordenadas saíram do código e foram
   para a definição de template; as cores vêm da revenda.

## Pendências

- **Dataset de regressão vazio.** O harness está pronto
  (`tools/regression.py`), mas precisa de fotografias reais, que não entram no
  git. Sem ele, a comparação numérica com o motor antigo ainda não foi feita:
  o que existe hoje é a verificação das constantes e das métricas produzidas.
- **Cores do template neutro.** A cor secundária da revenda ainda não existe
  no cadastro; hoje só a primária é usada.
- **Sem interface.** É a Etapa 2B, como combinado.
- **Fallback MobileNet.** Mantido no motor, sem assets; YOLO é o caminho.
- **Reels, entregas e Instagram.** Não integrados, conforme o escopo.

## Riscos

- **Versões do Python divergem do motor original em Pillow, numpy e torch.**
  O lock fixa o que roda hoje, mas o baseline de regressão contra o motor
  antigo ainda não foi gerado — é a primeira coisa a fazer com fotos reais.
- **Worker não implantado.** Roda local; produção depende de VPS/Docker e das
  variáveis `RENDER_WORKER_URL` e `RENDER_WORKER_SECRET` na Vercel. Enquanto
  não existirem, `startRender` responde 503 com mensagem clara.
- **Tempo de lote.** 11 fotos levam de 40 a 60 segundos. Com um job por
  processo, a fila cresce sob uso simultâneo.

## Próxima etapa

2B: interface do Studio. Não iniciada.
