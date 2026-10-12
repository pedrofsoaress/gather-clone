# Segundo andar do Escritório Matte

Data: 12/10/2026. Pedido do Pedro: "um escritório foda, com dois andares, quando sobe uma escada abre um outro andar em cima, como no Habbo Hotel, seguindo a mesma identidade, com mais posições de trabalho para as pessoas ficarem trabalhando de verdade".

O Pedro respondeu às perguntas de escopo e depois autorizou seguir sem a aprovação dele ("depois pode seguir sem minha aprovação"). As decisões marcadas como **(decisão do Claude)** foram tomadas sem ele e ficam aqui para ele revisar.

## Objetivo

Uma escada no térreo leva a um segundo andar, que é uma sala nova no mesmo estilo de pixel art. Lá em cima ficam pelo menos 40 lugares de trabalho, em dois tipos: mesas de foco silencioso e ilhas de time.

## O que o Pedro decidiu

| Assunto | Decisão |
|---|---|
| Tipos de posição de trabalho | Os dois: mesas de foco silencioso e ilhas de time. |
| Falar com quem está em foco | "Bater na mesa": a pessoa chega perto e clica em **Chamar**; quem está em foco recebe um aviso e aceita ou ignora. |
| Ilhas | Livres e numeradas ("Ilha 1", "Ilha 2"...). Qualquer um senta. |
| Tamanho | 40 pessoas ou mais sentadas no andar de cima. |
| Limite geral do escritório | Continua **80 pessoas** ao mesmo tempo. |

## Decisões do Claude

- **Onde fica a escada (decisão do Claude):** no fim do corredor da ala nova, na parte de baixo (corredor x 50 a 52, perto de y 26 a 28). É um canto sem uso, fica perto da passagem da ala e não mexe em nada do escritório. A plaquinha "Escada · 2º andar" fica visível mesmo no escuro, como as das salas.
- **Tamanho e formato do andar (decisão do Claude):** do mesmo tamanho do escritório original (50 por 30 quadradinhos), com a escada de descida no mesmo canto em que se chega.
- **Divisão do andar (decisão do Claude):** metade esquerda com a **Área de foco** (20 mesas individuais) e metade direita com **4 ilhas de 6 lugares** (24 lugares). São 44 lugares no total.
- **Arte (decisão do Claude):** montada com pedaços da arte atual (piso, paredes, mesas, cadeiras, computadores, plantas, tapetes), como foi feito na ala. Assim o estilo fica igual por construção. A escada é desenhada no mesmo estilo e paleta. Não há aprovação prévia da arte, porque o Pedro autorizou seguir; ele vê o resultado antes da publicação.

## Como cada parte funciona

### Escada

- No térreo, a escada ocupa um trecho do fim do corredor da ala. Pisar no degrau de cima leva a pessoa para o segundo andar, no topo da escada de lá. No segundo andar, pisar na escada leva de volta ao térreo, ao pé da escada.
- A troca de andar usa a passagem entre salas que o escritório já tem: a tela escurece, carrega o outro andar e a pessoa aparece lá.
- Quem está num andar não vê nem ouve quem está no outro. A chamada de vídeo termina ao trocar de andar.
- Ao reconectar ou recarregar, a pessoa volta para o andar e o lugar onde estava, como hoje.

### Área de foco

- 20 mesas individuais, cada uma com cadeira e computador, em fileiras com divisórias ou plantas entre elas. A plaquinha da área diz "Área de foco · silêncio".
- **Sentar numa mesa de foco liga o modo foco.** Quem está em foco não entra em conversa por proximidade: ninguém ouve, vê ou fala com essa pessoa só por passar ou sentar perto. A pessoa vê o aviso "Modo foco: ninguém te escuta. Quem quiser falar vai te chamar."
- Acima do boneco de quem está em foco aparece uma marquinha "em foco".
- **Chamar:** quem está de pé a até 2 quadradinhos de uma pessoa em foco vê o botão "Chamar {nome}". Ao clicar, a pessoa em foco recebe o aviso "{nome} quer falar com você" com os botões "Aceitar" e "Agora não".
  - **Aceitar:** abre uma conversa só entre as duas pessoas, ali na mesa. A conversa termina quando quem chamou se afasta (mais de 2 quadradinhos) ou quando a pessoa em foco levanta.
  - **Agora não** (ou 30 segundos sem resposta): quem chamou vê "{nome} está em foco agora." e nada mais acontece.
  - Uma pessoa só pode chamar a mesma pessoa de novo depois de 1 minuto.
- Levantar da mesa desliga o modo foco e a pessoa volta à conversa por proximidade normal.

### Ilhas de time

- 4 ilhas de 6 lugares (duas fileiras de 3 mesas de frente uma para a outra), cada uma sobre um tapete, com a plaquinha "Ilha 1" a "Ilha 4".
- Cada ilha é uma área privada, como a sala de vidro: quem está dentro da área da ilha (sentado ou de pé) conversa com todos da mesma ilha, e quem está fora não ouve.
- Sem limite por ilha além dos 6 lugares; quem está de pé dentro do tapete também participa.

### O resto do andar

- O corredor entre as duas metades e a área perto da escada têm conversa por proximidade normal.
- Plantas e luminárias no mesmo estilo do térreo.

## O que não muda

- O térreo e a ala: lugares, salas, interações, sala de treinamento, salas 1:1 e diretoria. A única mudança visível no térreo é a escada no fim do corredor da ala.
- O limite de 80 pessoas, a janela flutuante, a reconexão e as páginas de entrada.

## Publicação

- Mexe no servidor (modo foco, chamada), no site (andar novo, arte, botões) e no mapa guardado no banco (sala nova).
- Ordem: servidor, site e por último o mapa, sempre guardando cópia do mapa antes. Trocar o mapa derruba quem estiver online por alguns segundos, então a publicação é **combinada com o Pedro** e precisa do clique dele no Render.

## Como saber que deu certo

1. Pisar na escada do térreo leva ao segundo andar; pisar na escada de cima leva de volta. Recarregando lá em cima, a pessoa continua lá em cima.
2. Quem está no térreo não vê nem ouve quem está em cima, e vice-versa.
3. Duas pessoas sentadas em mesas de foco vizinhas não entram em chamada.
4. Uma pessoa de pé ao lado de alguém em foco vê "Chamar"; ao aceitar, as duas conversam; ao se afastar, a conversa termina. Com "Agora não", nada acontece e quem chamou é avisado.
5. Quem está na Ilha 1 conversa com toda a Ilha 1 e não ouve a Ilha 2.
6. O andar de cima tem 44 lugares sentados e o escritório continua aceitando 80 pessoas.
7. Testes automáticos cobrem: troca de andar validada pelo servidor, isolamento do modo foco na conversa por proximidade, chamada (aceitar, recusar, expirar, repetir antes de 1 minuto, fim ao se afastar ou levantar) e as áreas das ilhas.
