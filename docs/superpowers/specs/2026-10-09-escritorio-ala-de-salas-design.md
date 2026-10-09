# Ala de salas do Escritório Matte

Data: 09/10/2026. Aprovado em conversa com o Pedro (caminho A).

## Objetivo

O escritório atual continua sendo a primeira sala. À direita dele surge uma ala nova, no escuro, com uma sala de treinamento para 50 pessoas, 4 salas de one-on-one e a sala da diretoria. Quando a pessoa chega à passagem no lado direito do escritório, o escuro some aos poucos e a ala aparece. Plaquinhas mostram o nome de cada sala.

## O que o Pedro decidiu

| Assunto | Decisão |
|---|---|
| Formato | Um mapa só, mais largo. A ala fica à direita do escritório atual, coberta por escuro até a pessoa chegar na passagem. |
| Quando revela | Ao pisar na passagem. O escuro volta **toda vez** que a pessoa entra no escritório (nada fica guardado). |
| Treinamento | Para o time e para pessoas de fora. Palco e plateia, mas outras pessoas também podem falar. Todos entram pelo **mesmo link do escritório** e caminham até a sala. |
| One-on-one | **4 salas**, até **3 pessoas** cada. A quarta pessoa **não entra** e vê "Sala cheia". |
| Diretoria | Sala do Pedro, **aberta para qualquer um**, conversa privada lá dentro, plaquinha com o nome dele. |

## Como cada parte funciona

### Ala e escuro

- O mapa passa de 50 para cerca de 86 quadradinhos de largura (a altura continua 30). A medida final sai da arte aprovada.
- Na parede direita do escritório abre uma **passagem** (2 a 3 quadradinhos de largura), num ponto que hoje é parede. O resto do escritório não muda de lugar.
- Enquanto a pessoa não pisou na passagem nesta visita, a ala fica coberta por um escuro quase total. Por baixo dele não aparecem móveis, bonecos nem nomes.
- Ao pisar na passagem, o escuro some em cerca de 1,5 segundo, da passagem para a direita, e a ala inteira fica visível. Não volta a escurecer durante a visita.
- O escuro é só visual e de cada pessoa. Quem já revelou vê quem está na ala; quem não revelou não vê. Ninguém é bloqueado pelo escuro: o único caminho para a ala é a passagem, e pisar nela já revela.
- Ao recarregar a página ou entrar de novo, o escuro volta.

### Plaquinhas

- Cada sala tem uma plaquinha sobre a porta, no estilo das etiquetas de nome (fundo escuro, texto branco): "Sala de treinamento", "1:1 · 1", "1:1 · 2", "1:1 · 3", "1:1 · 4" e "Diretoria · Pedro Soares".
- A plaquinha da passagem ("Salas" com uma seta) fica visível no escritório o tempo todo, para as pessoas acharem o caminho.
- As plaquinhas das salas ficam visíveis **mesmo no escuro**, como placas iluminadas, para dar a ideia do que existe lá.
- As plaquinhas são desenhadas pelo sistema, não pintadas na arte, para dar para trocar o texto sem refazer a imagem.

### Sala de treinamento (revisado em 09/10/2026: grande reunião)

Decisões do Pedro em 09/10/2026, depois do lançamento da ala: a sala vira uma grande reunião; quem está no palco gerencia os microfones; vídeos numa faixa no topo; o apresentador pode desligar o microfone de alguém, desligar o de todos, bloquear religar e desligar a câmera de alguém.

- 50 lugares em fileiras, palco na frente com a tela de apresentação. A pessoa só senta quando pisa na cadeira.
- **Uma chamada para a sala toda:** quem entra na sala entra automaticamente numa única conversa com todos que estão dentro, como na sala de vidro. Os vídeos aparecem na faixa no topo da tela, com o botão "Expandir reunião" de sempre.
- Câmera e microfone começam desligados. Cada pessoa liga o próprio microfone e a própria câmera.
- **Apresentador:** quem está de pé no palco. Pode haver mais de um. Ao sair do palco, perde os controles.
- **Controles do apresentador:** desligar o microfone de uma pessoa, desligar a câmera de uma pessoa, silenciar todos (menos quem está no palco) e bloquear os microfones. A pessoa silenciada pode religar o microfone, a não ser que os microfones estejam bloqueados.
- **Microfones bloqueados:** ninguém fora do palco consegue ligar o microfone. A pessoa clica em "Pedir para falar"; o apresentador vê o pedido e clica em "Liberar"; só então ela consegue ligar o microfone. Ao desbloquear, todos voltam a poder falar.
- Os dois microfones fixos (palco e plateia) saem da sala; a chamada da sala substitui os dois.
- A tela de slides continua (apresentações e "levantar a mão" de sempre).

### Chamada mais rápida (todo o escritório)

- O vídeo abre cerca de 0,15 segundo depois que alguém chega perto (antes, 1 segundo de espera).

### Salas de one-on-one

- 4 salas pequenas, cada uma com mesa e 3 cadeiras, porta e plaquinha.
- Conversa privada: quem está dentro conversa só entre si, como na sala de vidro de hoje.
- Limite de 3 pessoas, garantido pelo servidor. Se já há 3 dentro, a quarta pessoa para na porta e vê "Sala cheia".
- Se alguém sai, a vaga abre na hora.
- Ao reconectar, a pessoa volta para onde estava, a não ser que a sala esteja cheia. Nesse caso volta para a recepção.

### Diretoria

- Sala maior que as de one-on-one, com mesa de trabalho e um canto de reunião.
- Qualquer pessoa entra. A conversa lá dentro é privada, como na sala de vidro.
- Sem limite de pessoas além do limite geral do escritório.

### Capacidade do escritório

- O limite geral sobe de 30 para **80 pessoas** ao mesmo tempo (50 no treinamento e 30 no resto).
- A partir de 81, quem tenta entrar vê a mensagem de escritório cheio, em português.

## Arte

- A ala precisa de pixel art nova, no mesmo estilo, escala e iluminação do escritório atual (`frontend/public/matte-office-v2.png`, quadradinhos de 32 pixels).
- **Primeira tentativa:** gerar a ala com IA, usando a imagem atual como referência.
- **Plano B, se a IA não ficar no padrão:** montar a ala reaproveitando pedaços da própria arte atual (piso, paredes, cadeiras, mesas, sofás e plantas recortados de `matte-office-v2.png`). Assim o estilo fica igual por construção.
- A arte da ala é **mostrada ao Pedro e aprovada antes** de qualquer encaixe no mapa.
- O resultado vira uma imagem única e mais larga (`matte-office-v3.png`). A imagem atual continua no projeto, porque a página inicial usa ela.

## O que não muda

- O escritório atual: lugares, móveis, interações, sala de vidro, ping-pong e quadro.
- O comportamento de quem está fora da ala.
- As páginas de entrada, a janela flutuante e a reconexão.

## Publicação

- A mudança mexe no servidor do escritório e no mapa guardado no banco. Na publicação, todo mundo cai por alguns segundos e precisa entrar de novo. **Publicar num horário combinado com o Pedro, sem gente no escritório.**
- Ordem: servidor primeiro, depois o mapa no banco, depois o site.

## Como saber que deu certo

1. Ao entrar, a ala está escura e só as plaquinhas aparecem.
2. Ao pisar na passagem, a ala aparece em cerca de 1,5 segundo. Recarregando a página, volta a ficar escura.
3. Com 3 pessoas numa sala de one-on-one, a quarta não entra e vê "Sala cheia". Quando uma sai, a vaga abre.
4. Na sala de one-on-one e na diretoria, quem está fora não ouve quem está dentro.
5. No treinamento, todos na sala estão na mesma chamada; quem está no palco desliga microfones e câmeras dos outros, silencia todos e bloqueia os microfones; com o bloqueio, só quem foi liberado consegue ligar o microfone.
6. O escritório aceita 80 pessoas ao mesmo tempo, e a 81ª vê a mensagem de cheio.
7. Nada muda para quem fica no escritório atual.
8. Testes automáticos cobrem: limite da sala, revelação por visita, ausência de conversa na plateia, volume do palco e do microfone da plateia, e reconexão para uma sala cheia.
