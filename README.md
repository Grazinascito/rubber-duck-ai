# rubber-duck-ai

Pato de borracha com voz (POC): um pato flutuante que ouve e responde por voz, alimentado pela API Gemini Live.

Pré-requisitos: Python >= 3.10 e Node >= 18.

## Bico sincronizado com a fala

O áudio da Gemini toca no renderer, por Web Audio. O módulo
`frontend/duck-talk-animator.js` mede o RMS da saída e troca apenas o `src`
do avatar, usando as três imagens já existentes. O microfone não alimenta
esse analisador.

Para calibrar, ajuste no topo desse módulo:

- `LIMIAR_1 = 0.02`: abaixo dele, o bico fica fechado.
- `LIMIAR_2 = 0.08`: a partir dele, o bico fica totalmente aberto.
- `MIN_FRAME_MS = 60`: duração mínima de cada frame durante a fala.
- `DEBUG = true`: mostra RMS bruto, volume suavizado e frame na janela.
  Reinicie o app após editar; volte para `false` ao terminar.

O frame usa o **volume suavizado**. Calibre os limites com essa leitura em
uma conversa real, incluindo pausas entre frases. São amplitudes do PCM,
não uma medida do volume físico do alto-falante.

Para testar manualmente:

1. Execute `npm start --prefix frontend` e convoque o pato com
   `CommandOrControl+Shift+D`.
2. Faça uma pergunta. Durante a resposta, confira os três frames, as pausas
   com o bico fechado e a ausência de piscadas ou mudanças de layout.
3. Interrompa a resposta falando. O bico deve fechar imediatamente; repita
   deixando uma resposta terminar normalmente.
4. Desligue o microfone durante uma resposta: a voz e o bico devem continuar.
   Ocultar o pato deve encerrar ambos.
5. Ative “Reduzir movimento” no sistema durante uma resposta: a voz continua,
   mas o pato fica parado, com o bico fechado. Desative para retomar a animação.

Testes automatizados: `npm test --prefix frontend` e
`.venv/bin/python -m pytest -q`. Cobrem análise, pré-carregamento,
interrupção, fila de reprodução, fim de turno, acessibilidade e limpeza.
