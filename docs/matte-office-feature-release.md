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
- Publicação confirmada: Render `dep-dauggkuk1f9s73boi2i0`, Vercel `dpl_8QCUoDgUaqpwBHHaDCTiuoXnNDh8`, commit `f22e62b`. O endereço público permanece `gather-clone-beta.vercel.app`.
- Após publicação, dois navegadores conectaram no Agora com microfone/câmera desligados: chamada compacta e expansão manual verificadas. Não foi concluído um compartilhamento real de tela nem teste com câmera física nesta validação.
- O mapa principal recebeu oito objetos por atualização aditiva; os 52 anteriores foram preservados. Backup local em `~/.config/gather-clone/matte-office-map-before-features-20260930.json`. Sala e contas temporárias de integração removidas.

## Limites da entrega

Miro precisa de uma URL de quadro fornecida pelo gestor. O comportamento do iframe depende do serviço externo. Slides são criados no editor ou importados em JSON; não há conversor de PDF/PPT. A entrega desktop usa a instalação PWA disponível no navegador. Modo fantasma foi omitido por não existir uso administrativo definido. Troca física de dispositivos, áudio de aba e gamepad físico precisam ser conferidos com os dispositivos de cada participante.

Implementação e ilustrações novas são originais; nenhum código ou asset foi copiado do repositório de referência.


## Ajuste de visibilidade e proximidade — 30/09/2026

- Avatares com contorno claro de um pixel nativo, sombra nos pés e identificação sobre fundo escuro. Tamanho e alinhamento nas cadeiras preservados; destaque acompanha as poses e a troca de skin.
- Chamadas em áreas abertas usam raio circular de 2,5 tiles, em vez de uma região quadrada de alcance 6. Grupos próximos continuam conversando juntos e salas privadas mantêm seu próprio canal.
- Trocas rápidas de skin são serializadas para impedir o descarte duplicado dos atlas.
- Validação: 38 testes backend; 53 testes frontend antes da revisão, mais 3 novos casos do ciclo de troca de skin (suíte Player final: 9/9); builds frontend/backend passaram. Na prévia do navegador foram conferidos avatar em pé, sentado e troca de skin.
- Render: `dep-daugr6m0tbcc73fcpu60`, commit `6be2c6a`. Vercel: `dpl_Bop1C2sKhVZGnQn1ZGk6cLavBERG`, commit `9954956`.
