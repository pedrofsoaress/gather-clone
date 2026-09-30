# Recursos da referência Gather: plano de implementação

> **Para execução:** ler a [análise comparativa](../specs/2026-09-29-gather-reference-gap-analysis.md). Executar uma entrega por vez com testes e revisão antes da próxima. As entregas abaixo são independentes onde indicado; apresentações dependem do modelo de objetos da Entrega 1.

**Objetivo:** trazer ao Matte Office os recursos úteis encontrados em `eweren/gather.town` que ainda não existem, preservando o escritório atual e a experiência de reunião já construída.

**Arquitetura:** manter Pixi para mapa/avatar/objetos, React para painéis, Socket.io para estado compartilhado e Agora para mídia. Criar um modelo extensível de interação por objeto, em vez de acrescentar condicionais para cada objeto em `OfficeHud`. Dados do mapa são validados no frontend e backend; comandos compartilhados são autorizados por sessão, posição e papel.

**Stack:** Next.js/React/TypeScript, Pixi, Socket.io, Agora RTC, Zod, Supabase, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-29-gather-reference-gap-analysis.md`

## Restrições globais

- Implementação, assets e textos próprios. Não copiar código, sprites, áudio ou arte do repositório de referência: a licença dele veda uso comercial e reempacotamento sem permissão.
- O acesso público ao escritório continua possível. A autorização de ações especiais deve derivar do servidor, nunca de um campo enviado pelo navegador.
- O estado de reunião `meetingMode` é uma escolha explícita do usuário. Nenhuma mudança de participante, tela, apresentação ou objeto altera esse estado automaticamente após a pessoa expandir a reunião; só saída da conversa ou clique em “Visualização de mapa” pode fazê-lo.
- Não mudar o provedor de vídeo. Usar Agora, já integrado, e as variáveis de ambiente existentes.
- Cada entrega precisa deixar o escritório em estado utilizável, com build de frontend/backend e teste de duas abas para fluxos compartilhados.

## Ordem de entrega

| Entrega | Prioridade | Dependência | Resultado observável |
| --- | --- | --- | --- |
| 1. Objetos configuráveis no mapa | P1 | nenhuma | Gestor coloca e edita objetos com ID e propriedades; servidor valida |
| 2. Quadro/links/experiências externas | P1 | 1 | Aproximar, abrir Miro/jogo autorizado e sincronizar sala entre pessoas |
| 3. Apresentações | P1 | 1 | Apresentador controla slides; participantes seguem sem perder câmera/chat |
| 4. Dispositivos e controles por pessoa | P1 | nenhuma | Escolha de mic/câmera/saída, mute local e indicador de voz |
| 5. Som espacial em objeto | P2 | 1, 4 | Compartilhar áudio de aba perto da caixa de som; volume cai com distância |
| 6. Expressões e pet | P3 | 1 | Dançar/correr, carinho no gato; fantasma restrito |
| 7. Luz, avisos e gamepad | P3 | 1 | Luzes por zona, notificações consistentes, controle por gamepad |
| 8. Instalador desktop | P4 | 1–7 estáveis | Empacotamento opcional; mesma URL/serviços do web app |

As entregas 2, 3 e 4 podem ser desenvolvidas em paralelo depois da Entrega 1, em branches separados. 5–7 são independentes entre si depois das dependências listadas. Cada linha deve ter uma demonstração funcional isolada antes de publicação.

## Mapa de arquivos e responsabilidades

| Área | Arquivos existentes a alterar | Novos módulos previstos |
| --- | --- | --- |
| Modelo e editor | `frontend/utils/pixi/zod.ts`, `types.ts`, `EditorApp.ts`; `backend/src/session.ts` | `frontend/utils/pixi/office/object-config.ts`, painel React de configuração no editor |
| Objetos em jogo | `frontend/utils/pixi/PlayApp.ts`, `office/InteractionLayer.ts`, `frontend/app/play/OfficeHud.tsx` | componentes React por tipo: `ExternalObjectPanel.tsx`, `PresentationPanel.tsx`, `SpeakerPanel.tsx`, `PetPanel.tsx` |
| Estado Socket | `backend/src/sockets/socket-types.ts`, `sockets.ts`, `backend/src/office/OfficeState.ts` | `OfficeSharedObjects.ts`, `PresentationState.ts`, `SpeakerState.ts` com testes próprios |
| Vídeo/áudio | `frontend/utils/video-chat/video-chat.ts`, `frontend/components/VideoChat/VideoBar.tsx`, `MicAndCameraButtons.tsx` | `DeviceSettings.tsx`, `AudioPreference.ts` |
| Avatar/efeitos | `frontend/utils/pixi/Player/Player.ts`, `PlayApp.ts` | módulo de ações de avatar, efeitos de luz e adaptador gamepad |
| Mapa padrão | `scripts/matte-office-map.mjs` | definições originais de quadro, painel, speaker e pet no mapa Matte |

Evitar colocar toda a lógica nova em `OfficeHud.tsx` ou `sockets.ts`. Cada estado compartilhado tem módulo próprio, deixando o roteamento nesses arquivos como integração fina.

## Entrega 1 — Modelo e editor de objetos configuráveis

**Referência:** `src/main/scenes/GameScene.ts` instancia objetos do Tiled por tipo; propriedades vêm do mapa. **Ganho Matte:** adicionar os novos objetos sem editar o script do escritório a cada mudança de layout.

**Arquivos:** `frontend/utils/pixi/zod.ts`, `types.ts`, `EditorApp.ts`, componentes do editor em `frontend/app/`, `backend/src/session.ts`, `backend/src/routes/routes.ts`, `scripts/matte-office-map.mjs`; testes em `frontend/utils/pixi/office/` e `backend/src/office/`.

**Contrato:** cada objeto preserva `id`, `kind`, `label`, `bounds`, `approach`; novos tipos usam `config` validado por tipo. Os valores devem permitir `external` (`url`, `allowedHosts`, `roomEditable`), `presentation` (`deckId`), `speaker` (`rangeTiles`) e `pet` (`animationSet`). Um ID não se repete na mesma sala. O backend usa o mapa persistido como fonte de verdade.

- [ ] Criar testes de esquema para IDs duplicados, URL inválida, `approach` fora do mapa e tipo/config incompatíveis. Executar `node --test` nos testes JS e o build TypeScript; esperar falhas antes do código.
- [ ] Estender o Zod do frontend e a validação da rota de gravação no backend com o mesmo conjunto de propriedades. Rejeitar objetos com coordenadas fora do mapa e `config` desconhecido; preservar mapas antigos sem migração manual.
- [ ] Criar no editor um seletor de tipo, posicionamento de área/ponto de aproximação e formulário de configuração. Ao salvar, reabrir e ver o mesmo objeto no mapa; excluir apenas o objeto selecionado.
- [ ] Integrar `InteractionLayer`/`OfficeHud` por um registro de renderizadores/ações por `kind`. Confirmar que assentos, recados e pingue-pongue atuais continuam funcionais.
- [ ] Testar com duas abas e executar builds. Fazer commit apenas dessa entrega.

**Aceite:** gestor cria um objeto externo e um painel de apresentação pelo editor, salva, recarrega e ambos aparecem no lugar correto; visitantes não conseguem alterar o mapa.

## Entrega 2 — Objetos externos e quadro colaborativo

**Referência:** `src/main/nodes/IFrameNode.ts` e os sete `iframe` no mapa (Miro, piano e jogos); a URL de sala pode ser propagada. O `SwitchNode` Miro alternativo está sem objeto no mapa.

**Arquivos:** `ExternalObjectPanel.tsx`, `frontend/app/play/OfficeHud.tsx`, `frontend/utils/pixi/office/object-config.ts`, `backend/src/office/OfficeSharedObjects.ts`, `backend/src/sockets/socket-types.ts`, `sockets.ts`, `scripts/matte-office-map.mjs`; testes do estado de URL e validação.

**Contrato de eventos:** `officeExternalOpen({objectId})` é local; `officeExternalSetRoom({objectId,url,revision})` vai ao servidor e responde `{ok,revision}`; `officeExternalState({objectId,url,revision})` é emitido só aos presentes na sala. O servidor exige host aprovado para o objeto e rejeita HTTP, `javascript:`, `data:`, usuário fora da sala e revisão antiga.

- [ ] Escrever teste de autorização: usuário distante/sem permissão não muda URL; duas mudanças concorrentes mantêm a maior revisão válida. Executar e confirmar falha inicial.
- [ ] Implementar `OfficeSharedObjects` com URL canônica, host permitido e revisão monotônica. Remover parâmetros perigosos conforme política por integração. Salvar somente identificador/URL de sala quando a experiência exigir continuidade.
- [ ] Criar painel responsivo com iframe em sandbox restrito, cabeçalho com nome, botão de fechar e “Abrir em nova aba”. Não embutir site que sinalize bloqueio ou cujo host não esteja aprovado.
- [ ] Posicionar um quadro colaborativo autorizado e uma experiência externa original no escritório Matte via editor/mapa. Para Miro, criar integração configurável; verificar os termos e política de embed do serviço antes de usar uma sala real.
- [ ] Testar duas abas: mudança de sala aparece em ambas; fechar o painel não desliga a chamada; site que recusa iframe oferece link utilizável. Executar builds e commit.

**Aceite:** duas pessoas próximas abrem o mesmo quadro/jogo, usam a mesma sala compartilhada e podem voltar ao mapa sem recarregar.

## Entrega 3 — Apresentações em painel

**Referência:** `PresentationBoardNode.ts`, `PresentationNode.ts`, `Gather.ts`. A implementação de referência tem slides/foco/mute, mas falta um gatilho `presentation` no mapa. O Matte deve entregar o fluxo completo.

**Arquivos:** `backend/src/office/PresentationState.ts`, `backend/src/sockets/socket-types.ts`, `sockets.ts`, `frontend/app/play/PresentationPanel.tsx`, `PlayClient.tsx`, `VideoBar.tsx`, `OfficeHud.tsx`, `scripts/matte-office-map.mjs`; testes em `backend/src/office/PresentationState.test.ts` e teste de componente/browser.

**Contrato:** `presentationStart({objectId,deckId})`, `presentationSlide({objectId,index,revision})`, `presentationEnd({objectId})`, `presentationRaiseHand({objectId})`; snapshot `{presenterUid,deckId,slideIndex,revision,raisedHands}`. Somente o apresentador muda slides. A mídia continua no canal Agora existente.

- [ ] Testar início por pessoa próxima, avanço válido, índice fora do deck, tentativa por participante não apresentador, reconexão e desconexão do apresentador.
- [ ] Implementar estado por objeto/sala com revisão; validar acesso no servidor e emitir snapshots para participantes atuais e tardios.
- [ ] Criar painel de upload/seleção de deck com armazenamento aprovado, preview e controles anterior/próximo/encerrar; usar tipos e limites de arquivo explícitos. Não executar HTML de slides.
- [ ] Abrir apresentação no layout da reunião expandida ou em painel sobre o mapa conforme escolha atual. Integrar pedido de fala e foco visual opcional, sem mutar microfones remotamente nem alterar `meetingMode` por evento de tela/slide.
- [ ] Testar com duas abas e celular: slide sincroniza, tela compartilhada pode continuar em tile próprio, câmera continua visível, minimizado/expandido permanece como usuário definiu. Executar builds e commit.

**Aceite:** uma pessoa apresenta, outra segue os slides e pede fala; ambas mantêm controle próprio da visualização da chamada.

## Entrega 4 — Dispositivos e controles individuais de áudio

**Referência:** `JitsiControlsNode.ts`, `Jitsi.ts`, `UserVideoElement.ts`. O Matte já tem mic/câmera/tela e maximização, mas não seleção de dispositivos, mute local por pessoa nem indicador de fala.

**Arquivos:** `frontend/utils/video-chat/video-chat.ts`, `frontend/components/VideoChat/VideoBar.tsx`, `MicAndCameraButtons.tsx`, novos `DeviceSettings.tsx` e `AudioPreference.ts`.

**Contrato:** `listDevices(): Promise<MediaDeviceInfo[]>`, `selectMicrophone(deviceId)`, `selectCamera(deviceId)`, `selectOutput(deviceId)` (quando o navegador oferecer `setSinkId`), `setRemoteMuted(uid,boolean)`, `setRemoteVolume(uid,0..100)`. Guardar preferências no navegador; nunca enviar IDs de hardware ao servidor.

- [ ] Testar a lógica de troca com mocks de track: trocar câmera não encerra compartilhamento de tela; microfone novo publica uma vez; saída indisponível mostra explicação; dispositivo desconectado volta ao padrão.
- [ ] Implementar seleção e troca de tracks no cliente Agora, fechando tracks antigos depois da troca bem sucedida. Tratar permissão negada e `devicechange`.
- [ ] Adicionar painel de preferências acessível pelo navbar; mostrar microfone, câmera e saída disponíveis. Salvar escolha apenas após sucesso.
- [ ] Acrescentar menu por pessoa no tile de vídeo para mute/volume local e contorno de “falando” com medição local do áudio remoto. Evitar reordenação agressiva que faça tiles saltarem durante a conversa.
- [ ] Testar em dois navegadores com dois participantes, câmera e tela simultâneas, fone conectado/desconectado. Executar build e commit.

**Aceite:** participante escolhe outro microfone/câmera, silencia só uma pessoa e identifica quem fala, sem tirar ninguém da chamada.

## Entrega 5 — Caixa de som espacial

**Referência:** `SpeakerNode.ts` e `Jitsi.shareTabAudio()`; um speaker no mapa.

**Arquivos:** `backend/src/office/SpeakerState.ts`, sockets, `frontend/utils/video-chat/video-chat.ts`, `frontend/app/play/SpeakerPanel.tsx`, `frontend/utils/pixi/PlayApp.ts`, mapa Matte.

- [ ] Testar posse exclusiva do speaker, recusa de publicação por pessoa distante, liberação em desconexão e volume calculado `max(0, 1 - distância/rangeTiles)`.
- [ ] Adicionar objeto speaker com indicador de dono e botão “Compartilhar áudio desta aba”. Capturar somente após clique e escolha explícita do navegador; usar stream de áudio independente da câmera e da tela atual.
- [ ] Associar a track a um identificador de mídia Agora próprio. Clientes próximos recebem e regulam volume conforme distância verificada; clientes fora da área não escutam. Oferecer mute local.
- [ ] Parar track e limpar estado ao clicar parar, sair do raio, trocar sala, perder permissão ou desconectar. Testar duas abas com fones para evitar eco; executar builds e commit.

**Aceite:** música compartilhada toca apenas perto do speaker, diminui suavemente ao se afastar e para ao sair.

## Entrega 6 — Ações do avatar e pet

**Referência:** dança/corrida/fantasma em `PlayerNode.ts` e pet em `CatNode.ts`.

**Arquivos:** `frontend/utils/pixi/Player/Player.ts`, `PlayerSpriteSheetData.ts`, `PlayApp.ts`, `frontend/utils/pixi/office/InteractionLayer.ts`, `backend/src/session.ts`, `socket-types.ts`, `sockets.ts`, `PetPanel.tsx`, sprites originais Matte.

- [ ] Criar animações originais de dança/corrida e carinho; testar o fallback de skin sem essas animações.
- [ ] Enviar ações efêmeras de dança/carinho a pessoas na mesma sala; interromper ao andar, sentar ou sair. Corrida precisa de velocidade validada pelo servidor antes de aumentar deslocamento.
- [ ] Criar um pet no mapa, com aproximação, carinho e animação curta. Não deixar uma interação cosmética capturar controles de reunião.
- [ ] Restringir modo fantasma a papel de gestor validado no servidor e áreas explicitamente permitidas; testar colisão e sala privada com usuário comum. Se essa função não tiver uso administrativo concreto, omiti-la do lançamento inicial e registrar a decisão.
- [ ] Validar em duas abas a animação do próprio avatar e do visitante; executar builds e commit.

**Aceite:** avatares dançam/correm e acariciam o pet com estados consistentes entre clientes; visitante comum continua bloqueado por paredes.

## Entrega 7 — Luz, notificações e gamepad

**Referência:** `LightNode.ts`, `NotificationNode.ts`, `GamepadInput.ts`.

**Arquivos:** `frontend/utils/pixi/PlayApp.ts`, `frontend/utils/pixi/EditorApp.ts`, `frontend/app/play/OfficeHud.tsx`, novos módulos de `lighting`, `notifications`, `gamepad` em `frontend/utils/pixi/office/`.

- [ ] Adicionar objetos de luz configuráveis (posição, raio, cor, intensidade) e renderização Pixi numa camada separada. Testar ordem de camadas, 0 luzes, redimensionamento e desempenho no mapa Matte.
- [ ] Criar avisos unificados de entrada, interação e início/fim de apresentação; incluir preferências de silêncio, pausa automática de som e aviso sem áudio como padrão em navegadores sem permissão.
- [ ] Mapear D-pad/analógico para deslocamento, botão de ação para objeto próximo e botão de saída para fechar painel; teclado/mouse devem continuar funcionais. Exibir legenda de botão conforme controle detectado.
- [ ] Testar gamepad conectado e removido durante o uso, apresentação com luz reduzida e restauração ao terminar, muitos avisos seguidos. Executar builds e commit.

**Aceite:** iluminação melhora leitura do ambiente, eventos não cobrem controles, gamepad permite navegar/interagir sem teclado.

## Entrega 8 — App desktop opcional

**Referência:** `electron-forge.config.js`; não traz função nova de reunião.

**Arquivos:** novo diretório `desktop/` com manifesto, entrada e empacotamento; documentação de instalação. Criar somente depois de estabilizar as entregas web.

- [ ] Definir requisito de produto para instalação e atualizações. Se bastar instalação pelo navegador, implementar PWA primeiro e encerrar esta entrega.
- [ ] Se houver necessidade de instalador, criar wrapper mínimo que abre a URL HTTPS Matte, sem replicar backend ou armazenar segredo Agora localmente.
- [ ] Testar câmera, microfone, captura de tela, links externos e atualizações no macOS/Windows; assinar os binários antes de distribuir.

**Aceite:** app instala e oferece a mesma experiência do navegador; publicação em Vercel/Render continua fonte única do produto.

## Verificação transversal e publicação

1. Antes de cada release: build `frontend` (`npm run build`) e `backend` (`npm run build`), testes específicos (`node --test` nos JS e testes TypeScript após transpilar), inspeção da UI em desktop e celular.
2. Executar fluxo real com duas pessoas: entrar por nome, sentar, chamada pequena, expandir, compartilhar tela, abrir objeto/apresentação, trocar dispositivo, voltar ao mapa. Verificar que câmera e tela são tiles separados e que expandir permanece expandido.
3. Confirmar limpeza de conexões, tracks, timers e listeners após sair da sala, fechar navegador e desconectar socket.
4. Publicar uma entrega por vez em Vercel/Render; acompanhar erros de socket/Agora e guardar caminho para reverter a entrega isoladamente.

## Fora do escopo, com justificativa

- Recriar chat público/privado, cadeiras, entrada com nome, compartilhamento de tela e expansão de vídeo: o Matte já possui esses recursos.
- Bots/NPC e trilha sonora do repositório de referência: existem arquivos, mas não há integração ativa comprovada; não são lacunas de paridade.
- Copiar o mapa, sprites, músicas ou código da referência: a licença proíbe uso comercial/reempacotamento sem autorização.
