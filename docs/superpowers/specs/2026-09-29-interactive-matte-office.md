# Escritório Matte interativo — especificação

## Problema

O mapa publicado hoje é uma imagem única. Há movimento, colisão aproximada e vídeo por proximidade, mas os móveis pintados na imagem não recebem cliques, não mudam de estado e não oferecem ações. Isso não atende ao pedido de um escritório virtual interativo no nível da referência enviada.

## Resultado esperado

O mesmo escritório público e o mesmo link passam a oferecer objetos utilizáveis. O visitante descobre um objeto por cursor, contorno e nome; clica ou toca nele para caminhar até um ponto livre; ao chegar, executa a ação. Perto de um objeto, também pode usar `E`. Um comando visível explica o controle para quem usa teclado ou toque.

## Objetos e ações

Todos os itens funcionais principais visíveis na arte recebem uma ação. Paredes, pisos, quadros decorativos e plantas continuam cenário.

| Área | Objetos | Ação observável |
| --- | --- | --- |
| Lounge superior | Estante, sofá | Abrir guia do escritório; sentar e levantar |
| Sala de reunião | Mesa/tela | Abrir quadro compartilhado; manter áudio privado da sala |
| Cozinha | Café, água, máquina de snacks, mesa | Preparar/pegar item com efeito visível; sentar e levantar |
| Equipe esquerda e direita | Oito mesas | Ocupar/desocupar estação; indicar presença e abrir bloco compartilhado da equipe |
| Centro | Mesa de projetos | Abrir quadro compartilhado de projetos |
| Oficina | Prateleiras e bancada | Abrir guia de ferramentas; abrir quadro de ideias |
| Recepção | Balcão e poltronas | Assinar/ler livro de visitas; sentar e levantar |
| Jogos | Mesa de pingue-pongue e sofá | Partida simples para duas pessoas com placar; sentar e levantar |

O guia do escritório contém apenas instruções locais de uso e o link público já existente; não inventa links, arquivos ou informações da empresa. Os quadros compartilhados contêm texto, limite de 500 caracteres por nota e autoria visível. O livro de visitas contém mensagens de até 280 caracteres. A partida de pingue-pongue usa uma ação de rebater por jogador e mostra placar/vez para ambos; não promete física complexa.

## Regras de interação

- O clique em um objeto encontra um ponto de aproximação livre no mesmo cômodo. Se não houver caminho, mostra “Não consigo chegar até esse objeto” e não abre a ação.
- Clicar em outro destino, usar uma tecla de movimento, trocar de cômodo ou desconectar cancela a ação pendente.
- O painel de ação é acessível por teclado, tem botão de fechar, foco controlado e não move o avatar enquanto a pessoa digita.
- Apenas o jogador presente no escritório pode ativar objetos. O servidor valida ID de objeto, posição, conteúdo e tamanho de cada evento. O cliente nunca escolhe sozinho o ocupante de um assento nem o placar.
- Uma cadeira/estação comporta um jogador por vez. O avatar aparece visualmente sentado no assento ou posicionado na estação, com indicação de ocupação. Ocupação termina ao levantar, sair da área ou desconectar. Dois jogadores vendo o mesmo espaço veem o mesmo estado.
- Notas e livro de visitas sobrevivem a reinício do Render. Ocupação e partida ativa são temporárias e são reconstruídas com estado inicial vazio após reinício.
- Falhas de rede mantêm uma mensagem legível e não deixam o painel travado em “salvando”.
- A arte atual permanece como base visual, mas cada objeto funcional tem uma camada própria de hitbox/realce e efeitos de estado. O efeito deve aparecer sobre o cenário, não só em uma caixa de texto separada.

## Critérios de aceite

1. O mapa ainda abre pelo link público atual e continua aceitando visitantes sem convite individual.
2. Todos os objetos da tabela têm indicação de interação, resposta ao clique/toque e à tecla `E`, e uma ação observável.
3. O avatar não atravessa móveis; aproxima-se do objeto e a ação só dispara quando chega ao ponto permitido.
4. Dois visitantes veem ocupação, notas e partida sincronizadas; não conseguem ocupar o mesmo assento.
5. Notas e livro de visitas aparecem novamente após atualizar a página e após reiniciar o backend.
6. O vídeo por proximidade e a sala de reunião privada continuam funcionando.
7. A experiência é testada em desktop e largura móvel; sem erros de console; compilação de frontend e backend passa.

## Limites desta entrega

Não há edição livre do mapa, integração com ferramentas externas da Matte, nem edição de cada pixel decorativo. O usuário pode solicitar isso como expansão depois que o escritório funcional estiver entregue.
