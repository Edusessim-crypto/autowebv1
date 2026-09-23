# Motor visual — origem e integridade

`cards_carmulti.py` vem de `CARMULTI_V7_COMPLETO` (build 2026-09-10), copiado
**sem alteração alguma**.

    SHA-256  8762f97b4e227b5b2c8f9d8addd0250f56b93080a7814c65a7e2972b581e6226
    Linhas   824

Este arquivo é comportamento validado em produção: geometria, constantes
calibradas e QC. Alterá-lo muda o resultado de todas as peças.

Antes de qualquer mudança aqui, gere o baseline de regressão
(`tools/regression.py --update`) e compare depois. Adaptações de
infraestrutura (caminhos, concorrência, I/O) pertencem a `app/`, não a este
arquivo — foi assim que o `os.chdir` da API antiga foi eliminado sem tocar no
motor.

O que a camada `app/` faz por fora:

- `engine_bridge.py` importa o motor e resolve caminhos de forma absoluta.
- `analyse_photos()` reproduz `analisar_fotos()` de `carmulti_auto.py`, que
  não pode ser importado por carregar identidade fixa da Carmulti.
- A ordenação automática do motor fica desligada: a AutoWeb preserva a ordem
  escolhida pelo usuário.
