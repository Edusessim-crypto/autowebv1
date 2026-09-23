#!/usr/bin/env python3
"""
CarMulti - motor de cards para carros e motos no Instagram.

USO:
    python3 cards_carmulti.py caminho/da/pasta

Funciona de dois jeitos:
  - aponte para a pasta de UM carro -> gera as cards dele
  - aponte para uma pasta que contem VARIAS pastas de carros -> gera todas
    de uma vez, uma subpasta "cards" dentro de cada uma

A pasta de cada veiculo precisa conter:
    template.png   -> layout com o espaco da foto pintado de magenta puro (#FF00FF)
    as fotos do veiculo (jpg ou png), com qualquer nome

As cards saem em uma pasta NOVA, ao lado da pasta do carro, com o
sufixo FINALIZADO no nome. Ex: a pasta "GOL" gera "GOL FINALIZADO".

COMO FUNCIONA
O script analisa cada foto e decide sozinho o tratamento para carro ou moto:
  - foto de exterior  -> localiza o veiculo e enquadra nele, centralizado,
                         ocupando cerca de 92% da altura do quadro
  - close-up ou interior -> usa a foto inteira
Nao importa em que posicao a foto esta na pasta, nem de que distancia
foi tirada. A ordem dos arquivos so define a ordem das cards.

Requer: pip install opencv-python  e a pasta "modelo" ao lado deste script.
Sem isso o script ainda roda, mas trata todas as fotos como interior.

AJUSTE FINO (opcional, so quando uma foto sair mal enquadrada):
Basta renomear o arquivo acrescentando sufixos. Nao precisa mexer no codigo.

    _a35   -> ancora vertical em 35% (sobe o recorte). 50 = centro.
              Menor sobe, maior desce. Ex: 02_a35.jpg
    _h60   -> ancora horizontal em 60%. 50 = centro.
    _z140  -> zoom 1.40 nessa foto especifica.

Pode combinar: 02_z145_a35.jpg
Qualquer sufixo desliga o automatico naquele eixo.
"""

import sys
import os
import json
import shutil
from PIL import Image

# ---------------------------------------------------------------
# CONFIGURACAO
# ---------------------------------------------------------------
# Zoom usado em close-ups e interiores. 1.00 = a largura da foto preenche
# exatamente a largura do slot.
ZOOM_FULL = 1.03

# Enquadramento automatico das fotos de exterior: o script acha o carro
# na foto e ajusta para ele ocupar esta fracao da ALTURA do slot.
# V7: enquadramento sem dependencia de cor. O veiculo e localizado semanticamente
# e depois posicionado por proporcoes fixas do padrao Carmulti.
ALTURA_ALVO = 0.90
LARGURA_MAXIMA = 0.94
MARGEM_INFERIOR_ALVO = 0.045   # ~4,5% entre o ponto mais baixo do carro e a faixa
MARGEM_LATERAL_MIN = 0.025
PROTECAO_CAIXA = 0.025         # protege espelhos/antena contra caixas muito justas

# Qualidade / validacao automatica
LARGURA_MINIMA_QC = 0.80
ALTURA_MINIMA_QC = 0.58
MARGEM_INFERIOR_MAX_QC = 0.11
CORTE_MAX_QC = 0.015

# V7 - motos: a silhueta e naturalmente mais estreita e alta que a de um carro.
# O enquadramento e portanto guiado principalmente pela altura, preservando as
# duas rodas, guidao e retrovisores sem tentar forcar 90% da largura do quadro.
ALTURA_ALVO_MOTO = 0.88
LARGURA_MAXIMA_MOTO = 0.84
MARGEM_INFERIOR_ALVO_MOTO = 0.050
LARGURA_MINIMA_QC_MOTO = 0.30
ALTURA_MINIMA_QC_MOTO = 0.62
MARGEM_INFERIOR_MAX_QC_MOTO = 0.12

# V7 - entregas: preserva pessoas + veiculo como um unico assunto visual.
ENTREGA_OCUPACAO_LARGURA = 0.92
ENTREGA_OCUPACAO_ALTURA = 0.88
ENTREGA_PADDING_X = 0.07
ENTREGA_PADDING_Y = 0.09

# Classificacao automatica de cada foto. Se o veiculo detectado ocupa mais
# do que esta fracao da largura da foto, e close-up ou interior: usa a foto
# inteira. Abaixo disso e uma foto de exterior: enquadra no carro.
# Antes, 70% fazia algumas fotos externas serem tratadas como "foto inteira".
# Isso foi a principal causa de carro pequeno em fotos nas quais o detector
# retornava uma caixa grande. Agora so consideramos close quando o veiculo
# praticamente domina a imagem em largura E altura.
LIMIAR_FOTO_INTEIRA = 0.92
LIMIAR_ALTURA_FOTO_INTEIRA = 0.78

# Ordenacao automatica: separa as fotos em tres blocos, nesta ordem —
# 1) exteriores de frente
# 2) close-up e fotos internas
# 3) exteriores de traseira
# Dentro de cada bloco a ordem dos arquivos e mantida.
# Ponha False para desligar e usar apenas a ordem dos arquivos.
ORDENAR_AUTOMATICO = True
LIMIAR_TRASEIRA = 0.012     # fracao de vermelho (lanternas) que indica traseira
LIMIAR_CARRO_VERMELHO = 0.25
ZOOM_MAXIMO = 2.20          # teto de seguranca, evita foto pixelada

# Nome da pasta de saida: fica AO LADO da pasta do carro, com este sufixo.
# Ex: pasta "GOL" -> as cards saem em "GOL FINALIZADO"
SUFIXO_SAIDA = " FINALIZADO"

MAGENTA = (255, 0, 255)
TOLERANCIA = 40  # quanto o pixel pode desviar do magenta puro
EXTENSOES = (".jpg", ".jpeg", ".png", ".webp")

CLASSES_SSD = [
    "background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus",
    "car", "cat", "chair", "cow", "diningtable", "dog", "horse", "motorbike",
    "person", "pottedplant", "sheep", "sofa", "train", "tvmonitor",
]
# ---------------------------------------------------------------


def detectar_slot(template):
    """Acha o retangulo magenta no template. Retorna (x0, y0, x1, y1)."""
    px = template.convert("RGB").load()
    largura, altura = template.size
    xs, ys = [], []
    for y in range(altura):
        for x in range(largura):
            r, g, b = px[x, y]
            if (r > 255 - TOLERANCIA and g < TOLERANCIA
                    and b > 255 - TOLERANCIA):
                xs.append(x)
                ys.append(y)
    if not xs:
        erro("Nao encontrei area magenta no template.png. "
             "Pinte o espaco da foto de #FF00FF e exporte de novo.")

    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)

    # Expande 1px para cobrir o antialiasing da borda do retangulo.
    x0 = max(0, x0 - 1)
    y0 = max(0, y0 - 1)
    x1 = min(largura - 1, x1 + 1)
    y1 = min(altura - 1, y1 + 1)
    return x0, y0, x1 + 1, y1 + 1


def carregar_detector(pasta_script):
    """Carrega o melhor detector disponivel.

    Prioridade V7:
      1) YOLO segmentation (semanticamente encontra o veiculo, independente da cor)
      2) MobileNet-SSD antigo como fallback

    O retorno continua sendo um unico objeto para manter compatibilidade com
    carmulti_auto.py e carmulti_manual.py.
    """
    # 1) Segmentacao YOLO: muito mais robusta para carros pretos/cinza, sombras
    # e fundos de contraste baixo.
    try:
        from ultralytics import YOLO
        modelo_local = os.path.join(pasta_script, "modelo", "yolo11n-seg.pt")
        nome_modelo = modelo_local if os.path.isfile(modelo_local) else "yolo11n-seg.pt"
        modelo = YOLO(nome_modelo)
        return {"tipo": "yolo-seg", "modelo": modelo}
    except Exception:
        pass

    # 2) Fallback para o detector antigo.
    try:
        import cv2
    except ImportError:
        return None

    proto = os.path.join(pasta_script, "modelo", "MobileNetSSD_deploy.prototxt")
    pesos = os.path.join(pasta_script, "modelo", "MobileNetSSD_deploy.caffemodel")
    if not (os.path.isfile(proto) and os.path.isfile(pesos)):
        return None
    try:
        rede = cv2.dnn.readNetFromCaffe(proto, pesos)
        return {"tipo": "mobilenet-ssd", "modelo": rede}
    except Exception:
        return None


def nome_detector(net):
    if isinstance(net, dict):
        return net.get("tipo", "desconhecido")
    return "mobilenet-ssd-legado" if net is not None else "indisponivel"


def _expandir_caixa(caixa, w, h, fracao=PROTECAO_CAIXA):
    x1, y1, x2, y2 = [float(v) for v in caixa]
    bw, bh = max(1.0, x2-x1), max(1.0, y2-y1)
    px, py = bw*fracao, bh*fracao
    return (max(0.0, x1-px), max(0.0, y1-py),
            min(float(w), x2+px), min(float(h), y2+py))


def _detectar_objetos_yolo(modelo, caminho, classes_permitidas=None, conf_min=0.18):
    """Retorna deteccoes semanticas com caixa, classe e confianca.

    A funcao e compartilhada por cards de estoque e entregas. Quando a
    segmentacao estiver disponivel, a caixa usa a mascara real do objeto.
    """
    try:
        resultados = modelo.predict(source=caminho, imgsz=640, conf=conf_min,
                                    iou=0.55, verbose=False, device="cpu")
    except TypeError:
        resultados = modelo.predict(source=caminho, imgsz=640, conf=conf_min,
                                    iou=0.55, verbose=False)
    if not resultados:
        return []
    r = resultados[0]
    if r.boxes is None or len(r.boxes) == 0:
        return []

    with Image.open(caminho) as im:
        w, h = im.size
    nomes = getattr(r, "names", {})
    permitidos = set(classes_permitidas or []) if classes_permitidas else None
    masks_xy = getattr(getattr(r, "masks", None), "xy", None)
    saida = []

    for i, box in enumerate(r.boxes):
        try:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
        except Exception:
            continue
        classe = str(nomes.get(cls_id, cls_id)).lower()
        if permitidos is not None and classe not in permitidos:
            continue

        caixa = None
        if masks_xy is not None and i < len(masks_xy):
            poly = masks_xy[i]
            if poly is not None and len(poly) >= 3:
                try:
                    xs = poly[:, 0]
                    ys = poly[:, 1]
                    caixa = (float(xs.min()), float(ys.min()),
                             float(xs.max()), float(ys.max()))
                except Exception:
                    caixa = None
        if caixa is None:
            try:
                caixa = tuple(float(v) for v in box.xyxy[0].tolist())
            except Exception:
                continue

        x1, y1, x2, y2 = caixa
        x1=max(0.0,min(float(w),x1)); x2=max(0.0,min(float(w),x2))
        y1=max(0.0,min(float(h),y1)); y2=max(0.0,min(float(h),y2))
        if x2 <= x1 or y2 <= y1:
            continue
        saida.append({"classe": classe, "confianca": conf,
                      "caixa": (x1,y1,x2,y2), "tamanho": (w,h)})
    return saida


def _achar_carro_yolo(modelo, caminho):
    """Compatibilidade: retorna somente a caixa do veiculo principal."""
    info = _achar_veiculo_yolo(modelo, caminho)
    return info["caixa"] if info else None


def _achar_veiculo_yolo(modelo, caminho):
    """Retorna o veiculo principal e identifica se e carro ou moto."""
    deteccoes = _detectar_objetos_yolo(
        modelo, caminho, {"car", "truck", "bus", "motorcycle"}, 0.18)
    if not deteccoes:
        return None
    w,h = deteccoes[0]["tamanho"]
    candidatos=[]
    for d in deteccoes:
        x1,y1,x2,y2=d["caixa"]
        bw,bh=max(1.0,x2-x1),max(1.0,y2-y1)
        area=bw*bh
        cx,cy=(x1+x2)/2.0,(y1+y2)/2.0
        dx=abs(cx-w/2.0)/max(1.0,w/2.0)
        dy=abs(cy-h/2.0)/max(1.0,h/2.0)
        centralidade=max(0.0,1.0-0.5*(dx+dy))
        profundidade=max(0.0,min(1.0,cy/max(1.0,h)))
        score=area*(0.72+0.20*centralidade+0.08*profundidade)*(0.75+0.25*d["confianca"])
        candidatos.append((score,d))
    _, d=max(candidatos,key=lambda x:x[0])
    tipo="moto" if d["classe"]=="motorcycle" else "carro"
    return {"caixa": _expandir_caixa(d["caixa"],w,h),
            "tipo": tipo, "classe": d["classe"],
            "confianca": d["confianca"]}

def _achar_veiculo_ssd(rede, caminho):
    import cv2
    img = cv2.imread(caminho)
    if img is None:
        return None
    h, w = img.shape[:2]
    blob = cv2.dnn.blobFromImage(
        cv2.resize(img, (300, 300)), 0.007843, (300, 300), 127.5)
    rede.setInput(blob)
    saida = rede.forward()

    melhor = None
    for i in range(saida.shape[2]):
        confianca = float(saida[0, 0, i, 2])
        classe = CLASSES_SSD[int(saida[0, 0, i, 1])]
        if confianca > 0.30 and classe in ("car", "bus", "motorbike"):
            x1, y1, x2, y2 = saida[0, 0, i, 3:7] * [w, h, w, h]
            area = max(1.0, x2-x1) * max(1.0, y2-y1)
            if melhor is None or area > melhor[0]:
                melhor = (area, classe, confianca, x1, y1, x2, y2)
    if melhor is None:
        return None
    tipo = "moto" if melhor[1] == "motorbike" else "carro"
    return {"caixa": _expandir_caixa(melhor[3:], w, h),
            "tipo": tipo, "classe": melhor[1], "confianca": melhor[2]}


def _achar_carro_ssd(rede, caminho):
    """Compatibilidade com chamadas antigas que esperam apenas bbox."""
    info = _achar_veiculo_ssd(rede, caminho)
    return info["caixa"] if info else None

def achar_veiculo_info(net, caminho):
    """Retorna bbox + tipo do veiculo principal (carro ou moto)."""
    if net is None:
        return None
    if isinstance(net, dict):
        tipo = net.get("tipo")
        modelo = net.get("modelo")
        if tipo == "yolo-seg":
            try:
                return _achar_veiculo_yolo(modelo, caminho)
            except Exception:
                return None
        if tipo == "mobilenet-ssd":
            try:
                return _achar_veiculo_ssd(modelo, caminho)
            except Exception:
                return None
    try:
        return _achar_veiculo_ssd(net, caminho)
    except Exception:
        return None


def achar_carro(net, caminho):
    """Compatibilidade: retorna somente (x1,y1,x2,y2) do veiculo."""
    info = achar_veiculo_info(net, caminho)
    return info["caixa"] if info else None


def inferir_tipo_veiculo(net, caminhos, max_fotos=4):
    """Decide carro/moto por voto nas primeiras fotos detectaveis."""
    votos={"carro":0.0,"moto":0.0}
    for caminho in list(caminhos)[:max_fotos]:
        info=achar_veiculo_info(net,caminho)
        if not info:
            continue
        tipo=info.get("tipo","carro")
        votos[tipo]+=max(0.2,float(info.get("confianca",0.5)))
    if votos["moto"] > votos["carro"]:
        return "moto"
    if votos["carro"] > 0:
        return "carro"
    return "desconhecido"

def fracao_vermelha(caminho, caixa):
    """Fracao de vermelho saturado dentro do veiculo (lanternas traseiras)."""
    import cv2
    import numpy as np
    img = cv2.imread(caminho)
    if img is None:
        return 0.0
    x1, y1, x2, y2 = [int(v) for v in caixa]
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(img.shape[1], x2)
    y2 = min(img.shape[0], y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    hsv = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)
    h, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    vermelho = ((h < 10) | (h > 170)) & (sat > 110) & (val > 70)
    return float(vermelho.mean())


def classificar_foto(caminho, tamanho_foto, caixa, tipo_veiculo="carro"):
    """Classifica a foto para o tratamento visual adequado.

    Motos nao possuem fluxo de interior/traseira por lanternas. Quando uma moto
    e detectada, ela e sempre enquadrada como assunto principal e a ordem
    original das fotos e preservada.
    """
    if caixa is None:
        return "meio", 0.0
    if tipo_veiculo == "moto":
        return "moto", 0.0
    w, h = tamanho_foto
    bw = max(1.0, caixa[2]-caixa[0]) / max(1.0, w)
    bh = max(1.0, caixa[3]-caixa[1]) / max(1.0, h)
    if bw >= LIMIAR_FOTO_INTEIRA and bh >= LIMIAR_ALTURA_FOTO_INTEIRA:
        return "meio", 0.0
    vermelho = fracao_vermelha(caminho, caixa)
    grupo = "traseira" if vermelho >= LIMIAR_TRASEIRA else "frente"
    return grupo, vermelho

def enquadrar_no_veiculo(tamanho_foto, caixa, largura_slot, altura_slot,
                         tipo_veiculo="carro"):
    """Calcula zoom/ancoras para carros e motos sem alterar a fotografia."""
    w, h = tamanho_foto
    x1, y1, x2, y2 = [float(v) for v in caixa]
    bw = max(1.0, x2-x1)
    bh = max(1.0, y2-y1)

    if tipo_veiculo == "moto":
        largura_max = LARGURA_MAXIMA_MOTO
        altura_alvo = ALTURA_ALVO_MOTO
        margem_bottom = MARGEM_INFERIOR_ALVO_MOTO
        topo_frac = 0.035
    else:
        largura_max = LARGURA_MAXIMA
        altura_alvo = ALTURA_ALVO
        margem_bottom = MARGEM_INFERIOR_ALVO
        topo_frac = 0.025

    escala_assunto = min((largura_slot * largura_max) / bw,
                         (altura_slot * altura_alvo) / bh)
    escala_cover = max(largura_slot / max(1.0, w),
                       altura_slot / max(1.0, h))
    escala = max(escala_assunto, escala_cover)

    nova_l = w * escala
    nova_a = h * escala
    zoom = nova_l / largura_slot
    if zoom > ZOOM_MAXIMO:
        zoom = ZOOM_MAXIMO
        nova_l = largura_slot * zoom
        escala = nova_l / w
        nova_a = h * escala

    folga_x = max(0.0, nova_l - largura_slot)
    folga_y = max(0.0, nova_a - altura_slot)

    centro_x = ((x1+x2)/2.0) * escala
    crop_x = max(0.0, min(folga_x, centro_x - largura_slot/2.0))

    alvo_bottom = altura_slot * (1.0 - margem_bottom)
    crop_y = y2 * escala - alvo_bottom
    topo_min = altura_slot * topo_frac
    topo_no_slot = y1 * escala - crop_y
    if topo_no_slot < topo_min:
        crop_y -= (topo_min - topo_no_slot)
    crop_y = max(0.0, min(folga_y, crop_y))

    ah = 0.5 if folga_x <= 1e-6 else crop_x / folga_x
    av = 0.5 if folga_y <= 1e-6 else crop_y / folga_y
    return zoom, max(0.0, min(1.0, ah)), max(0.0, min(1.0, av))


def enquadrar_no_carro(tamanho_foto, caixa, largura_slot, altura_slot):
    """Compatibilidade com V6."""
    return enquadrar_no_veiculo(tamanho_foto, caixa, largura_slot, altura_slot, "carro")

def metricas_enquadramento(tamanho_foto, caixa, largura_slot, altura_slot,
                           zoom, ancora_h, ancora_v):
    """Mede a caixa do carro depois do recorte, sem alterar a foto."""
    if caixa is None:
        return None
    w, h = tamanho_foto
    nova_l = largura_slot * zoom
    nova_a = nova_l * h / w
    if nova_a < altura_slot:
        nova_a = float(altura_slot)
        nova_l = nova_a * w / h
    if nova_l < largura_slot:
        nova_l = float(largura_slot)
        nova_a = nova_l * h / w
    escala = nova_l / w
    crop_x = max(0.0, nova_l-largura_slot) * ancora_h
    crop_y = max(0.0, nova_a-altura_slot) * ancora_v
    x1,y1,x2,y2 = [float(v)*escala for v in caixa]
    x1 -= crop_x; x2 -= crop_x
    y1 -= crop_y; y2 -= crop_y
    return {
        "largura": (x2-x1)/largura_slot,
        "altura": (y2-y1)/altura_slot,
        "margem_esq": x1/largura_slot,
        "margem_dir": (largura_slot-x2)/largura_slot,
        "margem_topo": y1/altura_slot,
        "margem_inferior": (altura_slot-y2)/altura_slot,
    }


def validar_enquadramento(metricas, tipo_veiculo="carro"):
    """Retorna alertas com limites diferentes para carro e moto."""
    if not metricas:
        return []
    avisos = []
    if tipo_veiculo == "moto":
        if (metricas["largura"] < LARGURA_MINIMA_QC_MOTO
                and metricas["altura"] < ALTURA_MINIMA_QC_MOTO):
            avisos.append("moto pequena no quadro")
        if metricas["margem_inferior"] > MARGEM_INFERIOR_MAX_QC_MOTO:
            avisos.append("espaco inferior excessivo")
    else:
        if metricas["largura"] < LARGURA_MINIMA_QC and metricas["altura"] < ALTURA_MINIMA_QC:
            avisos.append("carro pequeno no quadro")
        if metricas["margem_inferior"] > MARGEM_INFERIOR_MAX_QC:
            avisos.append("espaco inferior excessivo")
    if metricas["margem_esq"] < -CORTE_MAX_QC or metricas["margem_dir"] < -CORTE_MAX_QC:
        avisos.append("possivel corte lateral do veiculo")
    if metricas["margem_topo"] < -CORTE_MAX_QC or metricas["margem_inferior"] < -CORTE_MAX_QC:
        avisos.append("possivel corte vertical do veiculo")
    return avisos


def detectar_assunto_entrega(net, caminho):
    """Encontra o grupo principal de uma entrega: pessoas + veiculo.

    Usa a mesma YOLO local do sistema. Pessoas pequenas de fundo sao ignoradas;
    quando ha um veiculo, priorizamos pessoas proximas a ele. Retorna uma bbox
    unica que pode ser usada para um crop deterministico da foto original.
    """
    if not (isinstance(net, dict) and net.get("tipo") == "yolo-seg"):
        info = achar_veiculo_info(net, caminho)
        return {"caixa": info["caixa"], "componentes": [info.get("classe","veiculo")]} if info else None
    modelo=net.get("modelo")
    dets=_detectar_objetos_yolo(modelo,caminho,{"person","car","truck","bus","motorcycle"},0.16)
    if not dets:
        return None
    w,h=dets[0]["tamanho"]
    area_img=max(1.0,w*h)
    veics=[d for d in dets if d["classe"] in {"car","truck","bus","motorcycle"}]
    pessoas=[d for d in dets if d["classe"]=="person"]

    def score(d):
        x1,y1,x2,y2=d["caixa"]
        a=max(1.0,(x2-x1)*(y2-y1))
        cx,cy=(x1+x2)/2,(y1+y2)/2
        cent=max(0.0,1.0-(abs(cx-w/2)/(w/2)+abs(cy-h/2)/(h/2))/2)
        return a*(0.75+0.25*cent)*(0.7+0.3*d["confianca"])

    principal=max(veics,key=score) if veics else None
    escolhidos=[]
    if principal:
        escolhidos.append(principal)
        vx1,vy1,vx2,vy2=principal["caixa"]
        vbw,vbh=vx2-vx1,vy2-vy1
        zona=(vx1-0.75*vbw,vy1-0.75*vbh,vx2+0.75*vbw,vy2+0.55*vbh)
        proximas=[]
        for d in pessoas:
            x1,y1,x2,y2=d["caixa"]
            a=(x2-x1)*(y2-y1)
            cx,cy=(x1+x2)/2,(y1+y2)/2
            if a/area_img < 0.006:
                continue
            if zona[0] <= cx <= zona[2] and zona[1] <= cy <= zona[3]:
                proximas.append(d)
        proximas=sorted(proximas,key=score,reverse=True)[:5]
        escolhidos.extend(proximas)
        if len(escolhidos)==1 and pessoas:
            escolhidos.extend(sorted(pessoas,key=score,reverse=True)[:2])
    else:
        escolhidos=[d for d in sorted(pessoas,key=score,reverse=True)
                    if ((d["caixa"][2]-d["caixa"][0])*(d["caixa"][3]-d["caixa"][1]))/area_img >= 0.006][:5]
    if not escolhidos:
        return None

    x1=min(d["caixa"][0] for d in escolhidos); y1=min(d["caixa"][1] for d in escolhidos)
    x2=max(d["caixa"][2] for d in escolhidos); y2=max(d["caixa"][3] for d in escolhidos)
    bw,bh=x2-x1,y2-y1
    caixa=(max(0.0,x1-bw*ENTREGA_PADDING_X),
           max(0.0,y1-bh*ENTREGA_PADDING_Y),
           min(float(w),x2+bw*ENTREGA_PADDING_X),
           min(float(h),y2+bh*ENTREGA_PADDING_Y))
    return {"caixa":caixa,"componentes":[d["classe"] for d in escolhidos]}


def recortar_assunto_entrega(foto, largura_slot, altura_slot, caixa):
    """Crop 4:5/slot guiado pelo assunto, sem gerar ou alterar pixels."""
    if caixa is None:
        return None, None
    fw,fh=foto.size
    x1,y1,x2,y2=[float(v) for v in caixa]
    bw,bh=max(1.0,x2-x1),max(1.0,y2-y1)
    # Crop minimo que contem o assunto e respeita o aspect ratio do slot.
    ratio=largura_slot/max(1.0,altura_slot)
    crop_w=bw/ENTREGA_OCUPACAO_LARGURA
    crop_h=bh/ENTREGA_OCUPACAO_ALTURA
    if crop_w/crop_h < ratio:
        crop_w=crop_h*ratio
    else:
        crop_h=crop_w/ratio
    # O crop nao pode ultrapassar a foto. Se necessario, reduz ate caber.
    fator=min(1.0,fw/max(1.0,crop_w),fh/max(1.0,crop_h))
    crop_w*=fator; crop_h*=fator
    cx=(x1+x2)/2.0
    # Ligeiro bias para cima quando pessoas sao o assunto, evitando cortar cabecas.
    cy=(y1+y2)/2.0 - 0.025*crop_h
    left=max(0.0,min(fw-crop_w,cx-crop_w/2.0))
    top=max(0.0,min(fh-crop_h,cy-crop_h/2.0))
    crop=foto.crop((int(round(left)),int(round(top)),
                    int(round(left+crop_w)),int(round(top+crop_h))))
    crop=crop.resize((largura_slot,altura_slot),Image.Resampling.LANCZOS)
    meta={"crop_original":[round(left,2),round(top,2),round(left+crop_w,2),round(top+crop_h,2)],
          "assunto":[round(x1,2),round(y1,2),round(x2,2),round(y2,2)]}
    return crop,meta

def ler_sufixos(nome):
    """Le _z / _a / _h do nome do arquivo. Retorna (zoom ou None, ah, av)."""
    base = os.path.splitext(nome)[0]
    zoom = None
    ancora_h = None
    ancora_v = None
    for parte in base.split("_")[1:]:
        parte = parte.strip().lower()
        if len(parte) < 2 or not parte[1:].isdigit():
            continue
        valor = int(parte[1:])
        if parte[0] == "z":
            zoom = valor / 100.0
        elif parte[0] == "a":
            ancora_v = valor / 100.0
        elif parte[0] == "h":
            ancora_h = valor / 100.0
    return zoom, ancora_h, ancora_v


def recortar(foto, largura_slot, altura_slot, zoom, ancora_h=0.5, ancora_v=0.5):
    """Redimensiona e recorta a foto no zoom e na ancora pedidos."""
    w, h = foto.size
    nova_l = int(round(largura_slot * zoom))
    nova_a = int(round(nova_l * h / w))

    # Garante que nunca sobra area vazia.
    if nova_a < altura_slot:
        nova_a = altura_slot
        nova_l = int(round(nova_a * w / h))
    if nova_l < largura_slot:
        nova_l = largura_slot
        nova_a = int(round(nova_l * h / w))

    foto = foto.resize((nova_l, nova_a), Image.LANCZOS)
    x = int(round((nova_l - largura_slot) * ancora_h))
    y = int(round((nova_a - altura_slot) * ancora_v))
    x = max(0, min(nova_l - largura_slot, x))
    y = max(0, min(nova_a - altura_slot, y))
    return foto.crop((x, y, x + largura_slot, y + altura_slot))


def ordem_natural(nome):
    """Ordena 2.jpg antes de 10.jpg, e nao o contrario."""
    partes = []
    numero = ""
    for c in nome.lower():
        if c.isdigit():
            numero += c
        else:
            if numero:
                partes.append((1, int(numero), ""))
                numero = ""
            partes.append((0, 0, c))
    if numero:
        partes.append((1, int(numero), ""))
    return partes


def erro(msg):
    print("\nERRO: " + msg + "\n")
    sys.exit(1)


def montar_ordem(itens):
    """Ordena em tres blocos: exteriores de frente, close-up e interiores,
    exteriores de traseira. Dentro de cada bloco mantem a ordem dos arquivos."""
    frente = [i for i in itens if i["grupo"] == "frente"]
    meio = [i for i in itens if i["grupo"] == "meio"]
    traseira = [i for i in itens if i["grupo"] == "traseira"]
    return frente + meio + traseira


def processar_pasta(pasta, net):
    """Gera cards de uma pasta, detectando automaticamente carro ou moto."""
    nome_veiculo = os.path.basename(os.path.normpath(pasta))
    template = Image.open(os.path.join(pasta, "template.png")).convert("RGB")
    x0, y0, x1, y1 = detectar_slot(template)
    largura_slot, altura_slot = x1-x0, y1-y0
    fotos = sorted((f for f in os.listdir(pasta)
                    if f.lower().endswith(EXTENSOES) and f.lower() != "template.png"),
                   key=ordem_natural)
    if not fotos:
        print("  [{}] nenhuma foto encontrada, pulando.".format(nome_veiculo))
        return 0

    destino = os.path.join(os.path.dirname(os.path.abspath(pasta)), nome_veiculo + SUFIXO_SAIDA)
    os.makedirs(destino, exist_ok=True)
    itens=[]
    votos={"carro":0,"moto":0}
    for nome in fotos:
        caminho=os.path.join(pasta,nome)
        foto=Image.open(caminho).convert("RGB")
        info=achar_veiculo_info(net,caminho) if net is not None else None
        caixa=info["caixa"] if info else None
        tipo=info.get("tipo","desconhecido") if info else "desconhecido"
        if tipo in votos: votos[tipo]+=1
        grupo,vermelho=classificar_foto(caminho,foto.size,caixa,tipo if tipo!="desconhecido" else "carro")
        itens.append({"nome":nome,"caixa":caixa,"tamanho":foto.size,"grupo":grupo,
                      "vermelho":vermelho,"tipo_veiculo":tipo})
    tipo_lote="moto" if votos["moto"]>votos["carro"] else "carro"
    for item in itens:
        if item["tipo_veiculo"]=="desconhecido" and item["caixa"] is not None:
            item["tipo_veiculo"]=tipo_lote

    ordenou=False
    if ORDENAR_AUTOMATICO and net is not None and tipo_lote != "moto":
        if any(i["vermelho"] > LIMIAR_CARRO_VERMELHO for i in itens):
            print("  (carro vermelho: ordenacao automatica desligada nesta pasta)")
        else:
            itens=montar_ordem(itens); ordenou=True

    print("\n[{}]  {}  slot {}x{}px  -  {} fotos  ->  {}{}".format(
        nome_veiculo,tipo_lote.upper(),largura_slot,altura_slot,len(fotos),
        os.path.basename(destino),"  [reordenado]" if ordenou else ""))
    relatorio=[]; tem_revisao=False; revisao_dir=os.path.join(destino,"REVISAO")
    for i,item in enumerate(itens,1):
        nome=item["nome"]; caminho=os.path.join(pasta,nome)
        foto=Image.open(caminho).convert("RGB"); caixa=item["caixa"]
        tipo=item.get("tipo_veiculo") if item.get("tipo_veiculo") in ("carro","moto") else tipo_lote
        if item["grupo"]=="meio" or caixa is None:
            modo="full"; origem="interior" if caixa is None else "perto"
            zoom,ancora_h,ancora_v=ZOOM_FULL,0.50,0.50
        else:
            modo="wide"; origem=item["grupo"]
            zoom,ancora_h,ancora_v=enquadrar_no_veiculo(foto.size,caixa,largura_slot,altura_slot,tipo)
        zoom_manual,ah_manual,av_manual=ler_sufixos(nome)
        if zoom_manual is not None: zoom,origem=zoom_manual,"manual"
        if ah_manual is not None: ancora_h,origem=ah_manual,"manual"
        if av_manual is not None: ancora_v,origem=av_manual,"manual"
        recorte=recortar(foto,largura_slot,altura_slot,zoom,ancora_h,ancora_v)
        card=template.copy(); card.paste(recorte,(x0,y0))
        nome_card="card_{:02d}.png".format(i); caminho_card=os.path.join(destino,nome_card); card.save(caminho_card)
        metricas=None; avisos=[]; manual=origem=="manual"
        if item["grupo"]!="meio" and caixa is not None:
            metricas=metricas_enquadramento(foto.size,caixa,largura_slot,altura_slot,zoom,ancora_h,ancora_v)
            avisos=validar_enquadramento(metricas,tipo)
        if avisos and not manual:
            tem_revisao=True; os.makedirs(revisao_dir,exist_ok=True)
            shutil.copy2(caminho_card,os.path.join(revisao_dir,nome_card)); status="REVISAR: "+"; ".join(avisos)
        else:
            status="OK" if not avisos else "manual/aceito"
        relatorio.append({"card":nome_card,"foto":nome,"grupo":item["grupo"],"tipo_veiculo":tipo,
                          "detector":nome_detector(net),"zoom":round(float(zoom),4),
                          "ancora_h":round(float(ancora_h),4),"ancora_v":round(float(ancora_v),4),
                          "manual":bool(manual),"status":status,
                          "metricas":({k:round(float(v),4) for k,v in metricas.items()} if metricas else None)})
        selo="!" if avisos and not manual else "+"
        print("  {} {:02d} [{:4s}/{:4s}] zoom {:.2f} ancora {:.0f}/{:.0f} ({}) {} {}".format(
            selo,i,modo,tipo,zoom,ancora_h*100,ancora_v*100,origem,nome,status))
    with open(os.path.join(destino,"qualidade.json"),"w",encoding="utf-8") as f:
        json.dump(relatorio,f,ensure_ascii=False,indent=2)
    if tem_revisao:
        with open(os.path.join(destino,"REVISAO_NECESSARIA.txt"),"w",encoding="utf-8") as f:
            f.write("Alguns cards ficaram fora das margens automaticas da Carmulti.\nAs copias estao na pasta REVISAO.\n")
    return len(fotos)

def main():
    if len(sys.argv) < 2:
        erro("Informe a pasta. "
             "Ex: python3 cards_carmulti.py ~/Downloads/Carros")

    raiz = sys.argv[1].rstrip("/")
    if not os.path.isdir(raiz):
        erro("Pasta nao encontrada: " + raiz)

    # Uma pasta de carro tem template.png dentro.
    if os.path.isfile(os.path.join(raiz, "template.png")):
        pastas = [raiz]
    else:
        pastas = sorted(
            (os.path.join(raiz, d) for d in os.listdir(raiz)
             if os.path.isdir(os.path.join(raiz, d))
             and os.path.isfile(os.path.join(raiz, d, "template.png"))),
            key=ordem_natural,
        )
        if not pastas:
            erro("Nao achei template.png em " + raiz + " nem nas subpastas.\n"
                 "Cada pasta de veiculo precisa ter o seu template.png.")
        print("Encontrei {} carros para processar.".format(len(pastas)))

    pasta_script = os.path.dirname(os.path.abspath(__file__))
    net = carregar_detector(pasta_script)
    if net is None:
        print("\nAVISO: detector indisponivel. Todas as fotos serao tratadas")
        print("como interior, sem enquadrar no carro.")
        print("Instale ultralytics para ativar a segmentacao V7:")
        print("  python3 -m pip install ultralytics")
    else:
        print("\nDetector ativo: {}".format(nome_detector(net)))

    total = 0
    falhas = []
    for pasta in pastas:
        try:
            total += processar_pasta(pasta, net)
        except Exception as e:
            falhas.append((os.path.basename(pasta), str(e)))
            print("  ERRO nesta pasta: {}".format(e))

    print("\n" + "=" * 46)
    print("Pronto. {} cards em {} veiculo(s).".format(total, len(pastas)))
    if falhas:
        print("\nPastas com problema:")
        for nome, msg in falhas:
            print("  {} -> {}".format(nome, msg))


if __name__ == "__main__":
    main()
