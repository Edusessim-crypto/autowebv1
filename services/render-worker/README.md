# Render Worker

Serviço que gera as peças do AutoWeb Studio. Roda **fora** da Vercel: carrega
PyTorch e YOLO, consome CPU e leva dezenas de segundos por lote — nada disso
cabe num route handler serverless.

## O que é preservado

`engine/cards_carmulti.py` é o motor visual validado em produção, copiado
**sem uma linha alterada** (SHA-256 `8762f97b…e6226`). Toda a geometria vem
dele: enquadramento, proteção de teto e espelhos, regras próprias de moto,
classificação de interior/close e o controle de qualidade.

O que ele faz de diferente de "centralizar o veículo": assenta a **base** do
carro a uma distância fixa da faixa do template, de modo que veículos
fotografados de ângulos distintos pousem na mesma linha. As constantes
(`ALTURA_ALVO`, `MARGEM_INFERIOR_ALVO`, `ZOOM_MAXIMO`…) vieram de casos reais
e não devem ser ajustadas sem o harness de regressão.

## Estrutura

```
app/        camada AutoWeb: contratos, pipeline, API, storage
engine/     motor validado, intocado
templates/  PNG com o slot magenta + templates neutros da AutoWeb
assets/     yolo11n-seg.pt e as fontes Barlow
tools/      geração de templates e harness de regressão
tests/      geometria (rápidos) e integração (carregam o YOLO)
```

## Como falar com ele

Nenhum navegador acessa este serviço: só o backend da AutoWeb, com o segredo
no header `x-worker-token`.

| Rota | Papel |
| --- | --- |
| `GET /health` | status, versão do motor, se o modelo carregou |
| `GET /ready` | modelo, templates e diretório temporário utilizáveis |
| `POST /v1/render` | aceita um lote e responde imediatamente |
| `GET /v1/jobs/{id}` | resultado quando pronto, 202 enquanto processa |
| `POST /v1/render/card` | refaz UM card com enquadramento manual |
| `GET /v1/templates` | templates disponíveis |

O mesmo `jobId` não roda duas vezes: reenviar devolve o estado atual.

## Fluxo de um job

```
AutoWeb autoriza e monta o payload
  -> POST /v1/render (aceito na hora)
  -> worker baixa as fotos por URL temporária
  -> YOLO detecta, o motor enquadra
  -> template + textos + marca da revenda
  -> QC do motor marca o que precisa de revisão
  -> upload ao object storage
  -> AutoWeb consulta o resultado e grava no banco
```

Cada job usa `/tmp/autoweb-render/{jobId}/`, removido ao terminar ou falhar.
Um job que morra deixa a pasta para trás; ela é varrida no próximo start.
O produto final vive no object storage, nunca no disco do worker.

## Desenvolvimento

```
python3 -m venv .venv
./.venv/bin/pip install -r requirements.lock.txt
./.venv/bin/pip uninstall -y opencv-python   # ver nota abaixo

RENDER_WORKER_SECRET=um-segredo-local \
STORAGE_PROVIDER=local \
LOCAL_STORAGE_DIR=/tmp/autoweb-storage \
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8099
```

Testes:

```
./.venv/bin/python -m pytest tests -q                  # geometria, rápido
./.venv/bin/python -m pytest tests -q -m integration   # carrega o YOLO
```

### OpenCV

O `ultralytics` puxa `opencv-python`, que sobrepõe o `opencv-python-headless`
fixado em 4.10.0.84. Os dois instalam o mesmo módulo `cv2`, então em servidor
mantemos só o headless — por isso o `pip uninstall` acima e no Dockerfile.

### Versões

`requirements.lock.txt` fixa o que roda hoje. Atualizar Ultralytics, Pillow ou
PyTorch pode mudar bounding boxes e, com eles, os pixels: faça com o harness
de regressão em mãos, não por serem mais novos.

## Produção

| Item | Valor |
| --- | --- |
| Porta | 8080 |
| CPU | 2 vCPU (o lote é CPU-bound) |
| RAM | 4 GB (PyTorch + YOLO + imagens) |
| Disco temporário | 2 GB em `/tmp` |
| Concorrência | 1 job por processo (`RENDER_CONCURRENCY`) |
| Health check | `GET /health` |

Variáveis: `RENDER_WORKER_SECRET`, `STORAGE_PROVIDER`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.

```
docker build -t autoweb-render-worker .
docker run -p 8080:8080 --env-file .env autoweb-render-worker
```

Fila é preferível a derrubar o serviço por falta de memória: um job de cada
vez, e medir antes de aumentar.

## Regressão

O dataset com fotografias reais não entra no git
(`tests/golden-private/`, ignorado). Antes de mexer na matemática:

```
./.venv/bin/python tools/regression.py --update   # baseline de hoje
./.venv/bin/python tools/regression.py            # compara depois
```

A geometria é comparada com tolerância de 0,002 em zoom e âncoras; os pixels
admitem diferença média de 2, o suficiente para compressão mas não para
deslocamento.
