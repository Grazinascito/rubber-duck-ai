# Pesquisa técnica — Rubber Duck AI (POC)

- **Data:** 2026-10-12
- **Status:** pesquisa concluída; insumo para o plano de implementação (ainda não escrito à época). Seção 4 (segurança/responsible AI) adicionada no mesmo dia, a pedido, após lacuna identificada. **Estado (2026-10-13):** o plano de implementação existe (`plano-de-tasks.md`); a proposta de 120 s de silêncio foi decidida como 80 s (`SLEEP_AFTER_SECONDS`, decisão #2 do plano).
- **Método:** verificação das afirmações da pesquisa feita pelo Claude contra as fontes oficiais (documentação do Google, especificação W3C, código do exemplo oficial). Nenhum arquivo foi criado nem nenhum servidor iniciado durante a pesquisa.

## 1. Confirmações — a pesquisa do Claude está correta

### Limites de sessão e reconexão (Live API)

Confirmado na página oficial de session management:

- Sessão só de áudio dura no máximo **15 minutos** sem compressão de contexto (context window compression: mecanismo que descarta conteúdo antigo para caber na janela de contexto).
- A conexão WebSocket cai por volta de **10 minutos**; ao cair, a sessão acaba junto.
- Antes de cair, o servidor envia **`GoAway`** com `timeLeft` (tempo restante).
- **Session resumption** (resurgência: retomar a mesma sessão numa conexão nova usando um token chamado *handle*): token válido por **2 horas**.
- Com compressão de contexto ativada, a sessão pode durar sem limite.

Nomes exatos dos campos no SDK Python (`google-genai`), usados no plano:

```python
config = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    context_window_compression=types.ContextWindowCompressionConfig(
        sliding_window=types.SlidingWindow(),
    ),
    session_resumption=types.SessionResumptionConfig(handle=previous_handle),
)
```

No loop de recepção:

```python
if message.session_resumption_update:
    update = message.session_resumption_update
    if update.resumable and update.new_handle:
        # guardar update.new_handle para reconectar
```

Fonte: https://ai.google.dev/gemini-api/docs/live-api/session-management

### Preço

- US$ 3 por milhão de tokens de áudio de entrada; US$ 12 por milhão de saída.
- Existe plano gratuito.
- A página mostra US$ 0,005/min de entrada e US$ 0,018/min de saída, o que confirma o cálculo 1 segundo de áudio = 25 tokens (25 × 60 = 1.500 tokens/min; 1.500 × US$ 3/milhão ≈ US$ 0,0045/min).
- Fonte: https://ai.google.dev/gemini-api/docs/pricing

### Formato do áudio

- Entrada: PCM 16-bit little-endian, 16 kHz (`audio/pcm;rate=16000`). Saída: 24 kHz.
- Fonte: https://ai.google.dev/gemini-api/docs/live-api

### Estrutura do exemplo oficial (verificada no repositório em 2026-10-12)

Pasta `frontend/` do exemplo `gemini-live-genai-python-sdk` tem **6 arquivos**:

- `gemini-client.js` — cliente WebSocket
- `index.html`
- `main.js` — estados, botões, legenda
- `media-handler.js` — microfone e playback
- `pcm-processor.js` — AudioWorklet
- **`style.css`** — ⚠️ a estrutura de pastas aprovada não prevê o CSS; o plano precisa incluí-lo (transparência, arrasto e visual do pato ficam nele)

Outras verificações no código do exemplo:

- Microfone desligado com `getTracks().forEach(t => t.stop())` (para a captura de fato — atende AC4.1 do PRD).
- `getUserMedia({ audio: true })` **sem** constraints explícitas (ver seção 2.2).
- AudioWorklet carregado de `"/static/pcm-processor.js"` — caminho absoluto, origem `http`.
- Fonte: https://github.com/google-gemini/gemini-live-api-examples/tree/main/gemini-live-genai-python-sdk

## 2. Os 4 pontos que a pesquisa anterior não confirmava — resolvidos

### 2.1 Nome do modelo (resolvido)

- Modelo padrão atual da Live API: **`gemini-3.8-live`** (estável, sem sufixo de preview).
- `gemini-live-2.5-flash-preview` e `gemini-2.0-flash-live-001` foram desligados em **9 de dezembro de 2025**.
- `gemini-2.5-flash-native-audio-preview-12-2025` ainda existe, mas o acesso à série 2.5 está restrito a projetos que já a usavam.
- Consequência para o plano: o nome do modelo entra como variável de configuração (`.env`), nunca fixo no código, porque esses nomes mudam.
- Fontes: https://ai.google.dev/gemini-api/docs/models e https://ai.google.dev/gemini-api/docs/changelog

### 2.2 Cancelamento de eco por padrão (resolvido)

- A especificação W3C diz que `echoCancellation` **não tem padrão garantido pela especificação** — cada navegador (user agent) define o próprio padrão. O Chromium usa `true` na prática.
- O exemplo do Google chama só `getUserMedia({ audio: true })`, ou seja, depende do padrão do navegador.
- Conclusão: a decisão D15 continua válida (o cancelamento de eco do Chromium é o motivo de o áudio ficar no Electron), mas nosso código declara explicitamente:

```javascript
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
})
```

- Fontes: https://w3c.github.io/mediacapture-main e https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints

### 2.3 O arquivo `.whl` do exemplo (resolvido)

- O repositório tem `google_genai-2.14.0-py3-none-any.whl` na raiz do exemplo, mas **nada o referencia**: nem o `requirements.txt`, nem o `Dockerfile` instalam esse arquivo.
- É um artefato deixado para trás (provável cópia de uma versão pré-release do SDK de antes da publicação no PyPI).
- Conclusão: não copiar; instalar `google-genai` do PyPI.
- Detalhe extra: o `requirements.txt` do exemplo não fixa versão nenhuma de nenhuma dependência (7 pacotes sem pino). Para o objetivo de terceiros instalarem pelo README (US7), nosso `requirements.txt` fixa versões.
- Fontes: https://github.com/google-gemini/gemini-live-api-examples/blob/main/gemini-live-genai-python-sdk/requirements.txt e o Dockerfile da mesma pasta

### 2.4 Se a Live API cobra de novo o histórico a cada turno (segue sem confirmação)

- A documentação descreve o protocolo como *stateful* (o servidor mantém o contexto da sessão), mas nenhum documento afirma explicitamente como o faturamento conta o histórico acumulado.
- Decisão: não gastar mais tempo buscando. O PRD já prevê a via empírica (CS2 — medir o custo por sessão durante a POC, usando o plano gratuito).
- Fica como pergunta aberta no plano.

## 3. Implicações para o plano de implementação (pré-decisões, sujeitas à sua revisão)

1. **Servir o `index.html` pelo FastAPI (`http://127.0.0.1:8000`) em vez de `win.loadFile`.** O exemplo carrega o AudioWorklet de uma URL `http` (`/static/pcm-processor.js`). Carregar módulos de AudioWorklet a partir de `file://` (o caso do `loadFile`) é área de risco conhecida do Chromium: origens `file://` são tratadas como opacas para fetch de módulos. Manter o servidor FastAPI servindo o frontend e o Electron abrindo com `loadURL` custa ~3 linhas, remove o risco e fica mais perto do exemplo intacto. Se você preferir manter o `loadFile`, o plano precisa de um plano B (protocolo customizado do Electron).
2. **Detecção de silêncio para o modo sleep (E2/F9).** Com o microfone aberto, o cliente envia áudio continuamente mesmo em silêncio — "usuária calada" não pode ser detectado pela chegada de pacotes. Via limpa: ativar `input_audio_transcription` (transcrição da fala da usuária) e o backend cronometrar a última fala transcrita. Proposta de duração do silêncio: 120 segundos, configurável.
3. **Arquivos novos na estrutura aprovada:** o CSS do pato (o `style.css` do exemplo) e, se aceito, um módulo só com a system instruction (texto de comportamento do PRD 5.6 separado do código de transporte).

Nada disso invalida a D15 ou a estrutura aprovada — são ajustes de contorno.

## 4. Segurança, privacidade e responsible AI — quem cuida do quê

> **Atualização — 13/10/2026:** a referência atual deste tema é o documento
> [Propostas de segurança, privacidade e IA responsável](seguranca-privacidade-ia-responsavel.md).
> O texto abaixo fica como registro histórico. A nova referência substitui
> as conclusões sobre suporte a `safety_settings` na Live, alcance dos padrões
> de segurança, tratamento e retenção de dados e divisão de responsabilidades
> no uso de chave própria. Também distingue validade do identificador de
> retomada e retenção do estado da sessão. As medidas são propostas para
> avaliação e implementação futura.

Resposta curta à pergunta "a SDK já faz tudo?": **não**. A divisão é: a API/SDK do Google entrega os filtros de conteúdo, o transporte criptografado e a infraestrutura; **tudo que é decisão de produto e de código local é nosso** — onde a chave vive, quem conecta no servidor, o que o README revela, e o que o pato tem permissão de afirmar.

### 4.1 O que o Google/API/SDK já cobre (não construímos)

1. **Filtros de conteúdo natos do modelo.** A Gemini API filtra 4 categorias ajustáveis (assédio, discurso de ódio, conteúdo sexual explícito, conteúdo perigoso) e mantém proteções centrais sempre ligadas que não podem ser desligadas (ex.: child safety). O padrão dos modelos Gemini 2.5 e 3 é filtro ajustável desligado, contando com a segurança inerente do modelo; quem relaxa demais pode passar por revisão do Google nos termos de uso. Fonte: https://ai.google.dev/gemini-api/docs/safety-settings
2. **Safety na Live API.** Confirmado no código-fonte do SDK Python (`google/genai/types.py`, classe `LiveConnectConfig`): existe o campo `safety_settings: Optional[list[SafetySetting]]` — "Safety settings in the request to block unsafe content in the response". Ou seja, dá para configurar na sessão da Live API, embora a página de referência REST não liste o campo com destaque. Decisão para o plano: **manter o padrão, não relaxar**. Fonte: https://github.com/googleapis/python-genai
3. **Transporte e autenticação.** A conexão com o Google é criptografada (WSS) e autenticada pela chave — o SDK cuida disso.
4. **Infraestrutura e detecção de abuso** do lado do Google.

### 4.2 O que é nossa responsabilidade (a SDK não cuida)

1. **Guarda da chave de API.** A chave existe só no processo Python (a D15 já garante que o renderer nunca a vê). Concretamente: `.env` + `.gitignore` + `.env.example` sem chave real; chave nunca no código, nunca em log, nunca no renderer.
2. **Rede local.** O servidor FastAPI precisa escutar **só em 127.0.0.1** (loopback). Sem isso, outro computador da mesma rede poderia conectar no nosso WebSocket e usar o servidor como proxy gratuito da nossa chave. Sem autenticação na POC; risco residual aceito e documentado: outro processo local pode conectar.
3. **Endurecimento do Electron (Electron hardening: configurações padrão de segurança da janela).** `contextIsolation` ligado, `nodeIntegration` desligado, sandbox do renderer, `preload` expondo só funções específicas via `contextBridge`, handler de permissão aprovando apenas `media`, CSP (Content Security Policy: política que restringe de onde a página pode carregar código) na página servida.
4. **Privacidade de produto — o PRD exige, a implementação cumpre.** Sessão encerrada ou microfone desligado = nada capturado (parar as tracks com `stop()`, já verificado no exemplo); nenhuma gravação de áudio e nenhum log de transcrição em disco; transcrição existe só em memória para a legenda (F6).
5. **Transparência no README (disclosure).** Itens que precisam constar:
   - A voz da usuária é enviada aos servidores do Google (Gemini API).
   - Tier gratuito: o Google pode usar o conteúdo enviado para melhorar produtos — os termos dizem para não enviar informação sensível aos serviços não pagos. Tier pago: não usa para treino (vale o Data Processing Addendum). Fonte: https://ai.google.dev/gemini-api/terms
   - **Restrição de idade:** os termos da Gemini API exigem 18+ e proíbem clientes da API direcionados a menores de 18; o uso é para fins profissionais/negócios. O README declara isso.
   - O pato é uma IA generativa e pode errar (conecta com R2 e P7 do PRD).
   - Dados pessoais/LGPD: cada pessoa que instala usa a própria chave (decisão A6) — cada uma é responsável pelos próprios dados enviados ao Google; o repositório distribui código, não opera um serviço.
6. **Política de Uso Proibido.** Nosso caso (tutoria de estudo, persona de pato) não cai em categoria proibida (CSAE, extremismo, malware, golpe, impersonação de pessoa real, decisões automatizadas de alto risco sem humano etc.). O pato não se passa por humano nem por especialista — o P7 (hipótese marcada como chute) alinha com a proibição de "false expertise". Fonte: https://policies.google.com/terms/generative-ai/use-policy
7. **Responsabilidade pelos outputs.** Os termos são explícitos: quem usa e compartilha o conteúdo gerado é responsável por ele. O PRD já mitiga: P7 (nunca inventa fato verificável), hipótese sempre marcada como chute, verificação final é o teste da usuária (E10), R2 documentado no repositório.
8. **Guardrails de produto.** O P7 do PRD é o guardrail de responsible AI do produto; a system instruction (seção 5.6 do PRD) o materializa. O escopo mínimo da POC (sem busca, sem ferramentas, sem acesso à tela — C6) reduz a superfície de risco.

### 4.3 O que o guia de segurança do Google pede × o que a POC entrega

O guia (https://ai.google.dev/gemini-api/docs/safety-guidance) recomenda 4 práticas; situação da POC:

| Prática recomendada | Na POC |
|---|---|
| Entender os riscos do seu app | Feito no PRD (R2 — erro confiado, com mitigação P7/E10) |
| Ajustar configurações de segurança | Manter padrão seguro; não relaxar `safety_settings` |
| Testar para o seu caso de uso | Sessões de teste da POC (C5) + item novo no checklist manual: teste adversarial curto (pedir conteúdo ofensivo/proibido e observar o comportamento do pato) |
| Monitorar e coletar feedback | Fora de escopo na POC (sem telemetria); registrar como limitação conhecida |

### 4.4 Implicações novas para o plano

1. `uvicorn` com `host="127.0.0.1"` explícito (não `0.0.0.0`).
2. Checklist de segurança do Electron no passo da janela (contextIsolation, sandbox, permission handler só para `media`, CSP).
3. Seção do README com: disclosure de voz enviada ao Google, tiers gratuito/pago, 18+, "o pato pode errar", cada um usa a própria chave.
4. Teste adversarial curto no roteiro de testes manuais da POC.
5. `safety_settings` da sessão: não configurar (manter padrão) e registrar a decisão.

## 5. Sobre a aba `http://127.0.0.1:8000/` (registro)

Em 2026-10-12, nada está rodando na porta 8000 desta máquina e nenhum servidor foi criado durante a pesquisa. A porta 8000 aparece na pesquisa como a porta padrão do FastAPI do exemplo do Google. A aba do navegador mostra uma página de erro (conexão recusada) até existir um servidor de verdade.

## 6. Todas as fontes

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/live-api
- https://ai.google.dev/gemini-api/docs/live-api/session-management
- https://ai.google.dev/gemini-api/docs/changelog
- https://w3c.github.io/mediacapture-main
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
- https://github.com/google-gemini/gemini-live-api-examples/tree/main/gemini-live-genai-python-sdk
- https://ai.google.dev/gemini-api/docs/safety-settings
- https://ai.google.dev/gemini-api/terms
- https://policies.google.com/terms/generative-ai/use-policy
- https://ai.google.dev/gemini-api/docs/safety-guidance
- https://ai.google.dev/responsible
- https://ai.google.dev/api/live
- https://github.com/googleapis/python-genai (código-fonte do SDK; `LiveConnectConfig.safety_settings` verificado em `google/genai/types.py` em 2026-10-12)
