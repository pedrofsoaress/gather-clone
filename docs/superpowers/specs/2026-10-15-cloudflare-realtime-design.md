# Vídeo e áudio pelo Cloudflare Realtime

Data: 15/10/2026. Pedido do Pedro: trocar a Agora por uma ferramenta mais barata ("achei caro demais os planos", "bora trocar pra cloudflare"). Desenho aprovado em conversa no mesmo dia (ele mandou as chaves para seguir).

## Objetivo

Todo o áudio e vídeo do escritório (conversas por proximidade, salas fechadas, treinamento, compartilhamento de tela, caixa de som do lounge) passa a usar o **Cloudflare Realtime SFU** em vez da Agora, com:

- **custo perto de zero**: a Cloudflare cobra só o tráfego entregue às pessoas, com 1.000 GB grátis por mês (depois US$ 0,05 por GB); o uso estimado do escritório cabe no grátis;
- **conversas mais rápidas**: cada pessoa publica o próprio áudio e vídeo uma vez; chegar perto de alguém vira só "começar a receber" (meta: vídeo em até ~0,5 s depois do passo, hoje ~1,9 s);
- **a mesma tela de hoje**: faixa de vídeos, reunião expandida, janela flutuante, botões do apresentador, avisos, configuração de dispositivos.

## Decisões

| Assunto | Decisão |
|---|---|
| Provedor | Cloudflare Realtime SFU (app "escritorio") + Cloudflare TURN (chave "escritorio"). RealtimeKit **não** é usado (cobra por minuto). |
| Chaves | Só no servidor (Render): `CLOUDFLARE_SFU_APP_ID`, `CLOUDFLARE_SFU_APP_SECRET`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`. O site nunca vê o segredo. |
| Quem recebe quem | Decidido pelo servidor, com as mesmas regras de hoje: grupo da conversa (área privada do quadradinho, senão grupo de proximidade), treinamento com plateia recebendo só o vídeo do palco e telas, ninguém recebe a própria tela, caixa de som para quem está no alcance dela. |
| Qualidade | Simulcast em 3 camadas (`f`, `h`, `q`). Quadradinhos pequenos recebem `q`; reunião expandida e janela flutuante `h`; tela compartilhada e quadro ampliado `f`. O site pede a troca de camada; o servidor aplica. |
| Câmera ou microfone desligado | Não envia nada (sem custo). O estado ligado/desligado continua indo para os outros pelo servidor, como hoje. |
| Troca segura | Chave `VIDEO_PROVIDER` no servidor (`agora` ou `cloudflare`), enviada ao site na entrada. Começa em `agora`; liga `cloudflare` num horário combinado; volta para `agora` trocando a chave no Render. A Agora sai do código depois de 1 a 2 semanas estável (fora deste trabalho). |

## Como funciona

### Conexões de cada pessoa

- Ao entrar no escritório com `VIDEO_PROVIDER=cloudflare`, o site pede ao servidor os servidores de conexão (TURN, válidos por algumas horas) e abre **uma conexão de envio** e **uma conexão de recebimento** com a Cloudflare.
- **Envio:** quando liga microfone, câmera ou compartilha a tela, o site publica a faixa correspondente (câmera com simulcast). O servidor registra quais faixas cada pessoa publica.
- **Recebimento:** o servidor calcula, para cada pessoa, a lista de faixas que ela deve receber e a camada de cada vídeo. Quando essa lista muda (alguém chega perto, sai, liga a câmera, entra na sala, sobe no palco, muda de andar), o servidor pede à Cloudflare as faixas novas e fecha as que saíram, e manda ao site a renegociação; o site responde e as faixas aparecem nos quadradinhos.
- Todas as chamadas à API da Cloudflare saem do servidor. O site só troca as descrições de conexão (SDP) com o servidor pelo socket.

### Regras de quem recebe

Uma função pura do servidor, a partir do estado da sessão, decide as faixas desejadas por pessoa:

- conversa atual = área privada do quadradinho verificado, senão o grupo de proximidade (exatamente o que hoje autoriza a chamada);
- recebe áudio de todos da conversa; recebe vídeo de todos da conversa, menos: no treinamento, quem não está no palco só recebe vídeo de quem está no palco; ninguém recebe a própria tela;
- caixa de som: quem está no alcance de uma caixa ligada recebe o áudio dela com o volume calculado no site, como hoje;
- pessoas de outro andar nunca.

### Tela

- O site passa a ter uma camada de mídia com a **mesma interface** que a tela usa hoje (lista de pessoas remotas, faixas de áudio e vídeo que tocam num elemento, volume, indicador de quem está falando, avisos `user-info-updated`, `user-left`, `reset-users`, `screen-share-changed`). A tela (VideoBar, reunião expandida, janela flutuante, configurações) não muda.
- Escolha de microfone, câmera e saída de áudio, mudo por pessoa e volume por pessoa continuam funcionando.

### Erros

- Conexão com a Cloudflare caiu: o site reconecta sozinho e o servidor refaz a lista do que receber; aviso "Reconectando o vídeo..." só se passar de alguns segundos.
- Cloudflare recusou uma faixa: aviso "Não foi possível receber a mídia de um participante." como hoje, e o resto continua.
- Sem as chaves no servidor com `VIDEO_PROVIDER=cloudflare`: o servidor volta a mandar `agora` e registra o erro.

## O que não muda

Mapa, bonecos, escadas, salas, limites, chat, lista de online, seguir, controles do apresentador (silenciar, bloquear, pedir para falar), aparência da faixa de vídeos, da reunião expandida e da janela flutuante.

## Publicação

1. Servidor e site com `VIDEO_PROVIDER=agora` (nada muda para ninguém).
2. Teste completo com bonecos num escritório de teste separado usando `cloudflare` (nenhum boneco no escritório real).
3. Num horário combinado com o Pedro: `VIDEO_PROVIDER=cloudflare` no Render. Quem estiver online cai por alguns segundos.
4. Se algo der errado: volta para `agora` no Render.

## Como saber que deu certo

1. Duas pessoas que se aproximam se veem e se ouvem em até ~0,5 s depois do passo; ao se afastar, param de receber.
2. Salas fechadas, cabines, ilhas, 1:1 e Diretoria: quem está fora não recebe nada de dentro.
3. Treinamento: a plateia recebe vídeo só do palco e áudio de todos; o palco vê todos.
4. Compartilhar tela funciona e quem compartilha não recebe a própria tela de volta.
5. Caixa de som toca para quem está no alcance, com o volume certo.
6. Trocar de andar encerra o que recebia no outro andar.
7. Desligar a câmera ou o microfone para de enviar; religar volta.
8. O uso da Cloudflare (tráfego entregue) no painel bate com a estimativa e fica dentro de 1.000 GB/mês no uso normal.
9. Testes automáticos cobrem: a função de quem recebe quem, a diferença entre o que recebe e o que deve receber, a escolha de camada, a troca de provedor e a autorização (ninguém pede faixa de fora da sua conversa).
