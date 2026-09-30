# Comparativo de recursos: Matte Office × eweren/gather.town

**Data:** 29/09/2026

**Base Matte:** `d361c969a25fb963f5e91040176bc9e0e705c572`

**Base de referência:** `26e12c237545c06a92d9457cfedad96e611a43c6`
**Método:** leitura do código, do mapa Tiled e da documentação. A referência não foi executada: o autor informa que desligou os servidores e que o vídeo exige backend e Jitsi externos.

## Critério

“Existe” significa que há caminho de uso conectado ao mapa ou à interface. “Parcial” significa que o código está presente, mas o mapa, backend ou interface não completa o fluxo. As caixas marcadas em `TODO.md` não bastam para afirmar que o recurso funciona.

## Inventário comparado

| Recurso observado na referência | Evidência na referência | Matte Office hoje | Decisão |
| --- | --- | --- | --- |
| Nome e avatar antes de entrar | `src/main/scenes/TitleScene.ts` | `frontend/app/play/IntroScreen.tsx` | Já existe; manter |
| Movimento, colisão, câmera acompanhando avatar | `src/main/nodes/PlayerNode.ts`, `src/main/scenes/GameScene.ts` | `frontend/utils/pixi/Player/Player.ts`, `PlayApp.ts` | Já existe; manter |
| Assentos interativos | 30 `chair` no mapa Tiled | 42 assentos independentes no escritório Matte | Já existe, com mais assentos; manter |
| Videoconferência, câmera, microfone e chat público/privado | `src/Jitsi.ts`, `src/main/Gather.ts`, `src/customElements/UserVideoElement.ts` | Agora por proximidade, tela separada, `VideoBar.tsx`, `OfficeChat.tsx` | Matte já cobre o essencial e vai além em proximidade/tela |
| Maximizar uma pessoa/tela | `src/customElements/UserVideoElement.ts` | `VideoBar.tsx` | Já existe |
| Jogos no espaço | Sete iframes para jogos/experiências; depende dos sites externos | Pingue-pongue nativo | Parcial: temos jogo, falta catálogo de experiências externas |
| Quadro colaborativo Miro | Um iframe Miro no mapa; `SwitchNode` alternativo não instanciado | Recados compartilhados, sem canvas colaborativo | Falta quadro visual |
| Objetos que abrem conteúdo externo, com URL de sala sincronizada | `src/main/nodes/IFrameNode.ts`; sete objetos `iframe` no mapa | Objetos Matte limitados a assento, guia, recado, consumo e pingue-pongue | Falta; **P1** |
| Painel de apresentação e slides sincronizados | `PresentationNode.ts`, `PresentationBoardNode.ts`, `Gather.ts` | Compartilhamento de tela, sem controle de slides/participação | Parcial na referência: há painel, mas o mapa não contém objeto `presentation`; construir fluxo completo; **P1** |
| Controles de entrada/saída de áudio e câmera | `JitsiControlsNode.ts`, `Jitsi.ts` | Alternar mic/câmera, sem escolher dispositivo | Falta; **P1** |
| Silenciar participante só para si | `UserVideoElement.ts` | Áudio remoto toca globalmente | Falta; **P1** |
| Destaque de quem fala | `UserVideoElement.ts` usa `SoundMeter` e contorno | Sem indicador de voz por participante | Falta; **P1** |
| Áudio compartilhado numa caixa de som espacial | `SpeakerNode.ts`, `Jitsi.shareTabAudio()`; um `speaker` no mapa | Sem estação de áudio ambiente | Falta; **P2** |
| Gato interativo com animação de carinho | `CatNode.ts`; um `cat` no mapa | Sem pet interativo | Falta; **P3** |
| Dança, corrida e modo fantasma | `PlayerNode.ts`, `CharacterNode.ts` | Animações de andar/sentar; sem essas ações | Falta; **P3**. Modo fantasma somente com papel autorizado |
| Luzes dinâmicas e escurecer durante apresentação | `LightNode.ts`; quatro `light` no mapa | Mapa estático, sem iluminação dinâmica | Falta; **P3** |
| Controle por gamepad | `src/engine/input/GamepadInput.ts` | Teclado, mouse e toque | Falta; **P3** |
| Notificações animadas com som | `NotificationNode.ts` | Feedback textual contextual | Parcial; **P2** |
| Editor de mapa com objetos configuráveis | Mapa Tiled instancia objetos por tipo e propriedade | Editor Matte edita tiles/colisão/teleporte/área privada; hotspots do escritório são gerados por script | Falta editor de interações; **P1**, habilita vários recursos |
| Aplicativo de desktop | `electron-forge.config.js` e scripts Electron | Web no navegador | Opcional; **P4** |

## O que não entra como paridade comprovada

- `NpcNode` e `spawnNPCs()` existem, mas `spawnNPCs()` está comentado e o mapa não tem objetos `npc`. Bots autônomos também aparecem pendentes no `TODO.md`.
- `PresentationNode` foi registrado na cena, porém há apenas `presentationBoard` no mapa. O fluxo de iniciar uma apresentação precisa ser completado mesmo na referência.
- `SwitchNode` tem uma integração Miro alternativa, mas não há objeto `powerswitch` no mapa. O iframe Miro é a integração realmente posicionada.
- A reprodução de trilha sonora e sons de mapa aparece desligada/comentada; áudio ambiente deve ser planejado a partir do `SpeakerNode`, não da trilha.
- “Face recognition” está marcado no `TODO.md`, mas não há um fluxo verificável de reconhecimento facial no código analisado. Não entra no escopo.
- O README aponta um backend separado (`eweren/games-backend`). Esta comparação não pressupõe que os servidores antigos estejam disponíveis.
- “Vídeo baseado em distância” consta como pendente no `TODO.md` da referência. A conexão por proximidade do Matte já supera esse ponto.

## Requisitos para a implementação Matte

1. Cada recurso precisa de uma entrada visível no escritório, estado sincronizado quando for compartilhado, saída/limpeza segura e funcionamento responsivo.
2. A apresentação e os objetos externos devem preservar a escolha do usuário entre chamada pequena e expandida. Trocar slides ou iniciar mídia não pode minimizar uma reunião expandida.
3. Configurações de mic/câmera/saída precisam ser aplicadas sem perder o canal Agora, a câmera nem uma tela em curso. Permissões recusadas ou dispositivos removidos devem gerar mensagens claras.
4. URLs de conteúdo externo devem ser HTTPS, aprovadas pelo servidor por domínio/tipo, renderizadas com política restrita e ter saída “Abrir em nova aba” caso o site bloqueie embed. Uma URL de sala compartilhada só pode ser alterada por pessoa autorizada naquele objeto.
5. Apresentação: um único apresentador por painel; slides sincronizados por versão/revisão; participantes podem abrir e fechar a visualização; desconexão encerra ou transfere a sessão de forma explícita. Pedidos de fala, se incluídos, não podem expor áudio sem consentimento.
6. Som espacial: captação de áudio de aba requer ação explícita; usuários podem mutar para si; distância regula volume; fora da área ou após desconexão não resta track tocando.
7. Dança/corrida são cosméticas ou respeitam a velocidade permitida pelo servidor. Modo fantasma não pode atravessar paredes para usuários comuns nem contornar áreas privadas.
8. Mídia visual, música, sprites e código precisam ser originais ou licenciados para o projeto Matte.

## Restrição de licença

O arquivo `LICENSE.md` da referência diz que código, arte e trilha não receberam licença de distribuição, restringe uso aos interesses pessoais e proíbe reempacotamento e uso comercial sem autorização. O plano usa somente ideias de produto e descreve implementação original. Não incorporar arquivos ou trechos da referência ao repositório Matte.

## Sucesso

Uma pessoa consegue montar e usar uma sala de reunião com apresentação e quadro; outra entra por proximidade, escolhe dispositivos, vê quem fala, silencia alguém apenas localmente e participa de objetos externos sem quebrar a chamada. Recursos sociais e de ambientação são entregues em lotes independentes depois disso.
