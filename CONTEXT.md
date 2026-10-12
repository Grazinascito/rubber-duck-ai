# rubber-duck-ai

Pato de borracha com voz: um pato flutuante no sistema operacional que ouve o
programador e responde por voz, alimentado pela API Gemini Live.

## Language

**Echo mode**:
Modo de operação em que o servidor devolve a mesma mensagem recebida, sem
consultar o Gemini. Existe para validar a pilha completa sem chave de API.
_Avoid_: modo teste, mock mode.

**Envelope de mensagem**:
O formato único de toda mensagem trocada pelo WebSocket: um objeto com `type`
(string não vazia) e `payload` opcional de qualquer forma.
_Avoid_: payload solto, mensagem crua.

**Summon/Dismiss**:
Os dois comandos que mostram (summon) e escondem (dismiss) o pato.
_Avoid_: abrir/fechar, mostrar/esconder, toggle.

**Marcador de conexão**:
O elemento da página que exibe se o pato está "conectado" ou "desconectado"
do servidor.
_Avoid_: badge de status, indicador.

**Sessão**:
Uma conversa do pato com o Gemini Live, do início até o encerramento.
_Avoid_: conexão, conversa, thread.
