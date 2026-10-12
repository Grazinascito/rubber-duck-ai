# rubber-duck-ai

Pato de borracha com voz: um pato flutuante no sistema operacional que ouve o
programador e responde por voz, alimentado pela API Gemini Live.

## Language

**Envelope de mensagem**:
O formato único de toda mensagem trocada pelo WebSocket: um objeto com `type`
(string não vazia) e `payload` opcional de qualquer forma.
_Avoid_: payload solto, mensagem crua.

**Summon/Dismiss**:
Os dois comandos que mostram (summon) e escondem (dismiss) o pato.
_Avoid_: abrir/fechar, mostrar/esconder, toggle.

**Oculto / Ouvindo / Pensando / Falando / Sleep**:
Os estados do pato. Oculto: ausente da tela, janela escondida, sem interação,
nada é captado. Ouvindo: presente no canto, arrastável, escutando a usuária.
Pensando: transitório entre a usuária parar de falar e o pato responder.
Falando: enunciando (pergunta, hipótese ou pedido). Sleep: ver Sleep. Sem
escuta e Encerrado entram em US4 e US6.
_Avoid_: escondido/mostrado, aberto/fechado, minimizado, toggle, visível.

**Marcador de conexão**:
O elemento da página que exibe se o pato está "conectado" ou "desconectado"
do servidor.
_Avoid_: badge de status, indicador.

**Sessão**:
Uma conversa do pato com o Gemini Live, do início até o encerramento.
_Avoid_: conexão, conversa, thread.

**Turno**:
O período de fala de um dos lados da conversa. O fim do turno do pato chega
como `turn_complete`; o fim do da usuária, como a transcrição concluída
(`finished`).
_Avoid_: resposta, mensagem, round.

**Interrupção**:
A usuária falar enquanto o pato fala: o pato para de falar na hora e passa a
ouvir.
_Avoid_: corte, cancelamento, override.

**Handle de resumption**:
Token que permite reabrir a mesma sessão numa conexão nova (válido 2 h). Usado
na reconexão única após o servidor anunciar GoAway.
_Avoid_: token de sessão (genérico), id de reconexão.

**Sleep**:
Estado após silêncio longo: a sessão encerra, o microfone desliga e o pato
permanece na tela dormindo (olhos fechados, "zzz") até nova convocação, que
abre sessão nova.
_Avoid_: standby, pausa, timeout (o timeout é a duração do silêncio, não o
estado).
