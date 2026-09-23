# Dataset de regressão (não versionado)

Fotografias reais não entram no git. Esta pasta é ignorada; coloque aqui os
casos que provam que o motor adaptado continua igual ao validado.

Estrutura esperada:

    inputs/<caso>/foto-01.jpg ...
    expected/<caso>/card-01.png ...
    metadata.json

`metadata.json` descreve cada caso:

```json
{
  "casos": [
    {
      "nome": "carro-preto",
      "veiculo": { "brand": "Chevrolet", "model": "Onix Plus", "price": 8990000,
                   "yearManufacture": 2022, "yearModel": 2023, "mileage": 19800 },
      "template": { "key": "carmulti-v7", "version": 1, "variant": "STANDARD" }
    }
  ]
}
```

Casos que valem cobrir: carro preto, cinza, branco e vermelho; moto; foto
vertical e horizontal; interior; close; lateral; veículo pequeno no quadro;
nome longo; variantes standard e price drop.

Gere o baseline com o motor original antes de qualquer mudança:

    python tools/regression.py --update

E compare depois:

    python tools/regression.py
