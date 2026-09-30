# Recursos do escritório — 30/09/2026

## Entregue

- Editor: criação, posição, edição e remoção de objetos com configuração validada no servidor.
- Quadro e piano: URL de sala sincronizada, hosts permitidos e link alternativo quando o serviço recusa iframe.
- Apresentações: slides de título/texto/imagem, importação JSON no editor, controle pelo apresentador e pedido de fala.
- Áudio e vídeo: seleção de dispositivos, volume/mute local por pessoa, indicação de fala e câmera independente da tela compartilhada.
- Caixa de som: áudio de aba, posse exclusiva, alcance e volume por distância/área privada.
- Avatar: Z para dançar, Shift para correr e carinho no Caju.
- Ambiente: luzes locais configuráveis, avisos silenciosos por padrão e comandos de gamepad.
- Instalação: PWA pelo navegador, sem cache de autenticação, chamadas ou mapa.

## Correções de integração

Os recursos seguem a sala atual. Proximidade usa os passos aceitos pelo servidor, atualiza quem ficou parado e separa salas privadas. Movimentos fora do piso são recusados e o cliente recupera a posição válida. Passagens aguardam confirmação do servidor. O editor preserva alterações ao trocar de aba. O chat, os objetos e o painel de dispositivos compartilham bloqueios de entrada para não mover o avatar atrás de um painel.

Tokens de mídia exigem participação atual validada no backend; canais distinguem o índice da sala. A câmera e a tela renovam tokens. Dispositivos removidos voltam ao padrão e capturas pendentes são encerradas ao sair da conversa. O menu de áudio usa portal para não ser cortado pelos vídeos.

## Verificação

- 37 testes backend: estado, posições, proximidade, assentos, autorização de mídia e objetos por sala.
- 56 testes frontend/mapa/PWA: configurações, editor, movimento, áudio, ciclo de captura, duração real dos tokens e recursos visuais.
- Dois participantes temporários em Socket.io: dança sincronizada, recusa de ações distantes, apresentações/slide/pedido de fala, autorização da conversa privada, posse/volume/liberação do speaker e URL externa compartilhada.
- Navegador: entrada com nome, mapa, carinho no pet e dispositivos; interface a 375px sem corte da barra de controles.
- Builds de produção de frontend e backend.

## Limites da entrega

Miro precisa de uma URL de quadro fornecida pelo gestor. O comportamento do iframe depende do serviço externo. Slides são criados no editor ou importados em JSON; não há conversor de PDF/PPT. A entrega desktop usa a instalação PWA disponível no navegador. Modo fantasma foi omitido por não existir uso administrativo definido. Troca física de dispositivos, áudio de aba e gamepad físico precisam ser conferidos com os dispositivos de cada participante.

Implementação e ilustrações novas são originais; nenhum código ou asset foi copiado do repositório de referência.
