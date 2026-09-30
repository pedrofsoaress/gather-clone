# Instalar o Matte Office

O Matte Office pode ser instalado pelo navegador como PWA. A versão instalada usa a mesma origem HTTPS, o mesmo backend Socket.io e as mesmas chamadas Agora do site. Não é necessário distribuir um instalador ou armazenar credenciais dentro de um aplicativo desktop.

Abra `/install` no endereço publicado da Matte. Chrome/Edge oferecem um botão de instalação quando elegível; a página também orienta a instalação manual no Mac, Windows, Android e iOS. Se o navegador não oferecer instalação, o escritório continua acessível no site.

O atalho inicia em `/`, onde a pessoa escolhe entrar no escritório e informa seu nome. Isso mantém o link atual de convite na página inicial como fonte única, sem gravar um convite que pode ser revogado dentro do manifesto.

## Internet e atualizações

- O escritório precisa de internet. Mapa compartilhado, chat e mídia não têm modo offline.
- O service worker não intercepta requisições e não grava páginas, tokens, respostas de APIs, mídia ou arquivos em Cache Storage.
- Uma atualização do service worker não recarrega a janela. O código novo da aplicação chega na próxima navegação, abertura ou atualização manual, preservando chamadas em andamento.
- Microfone, câmera e compartilhamento de tela continuam solicitando as permissões do navegador. O suporte à captura de tela varia por navegador e plataforma; instalar a PWA não amplia essas permissões.
- Os ícones em `frontend/public/pwa/` são desenhos originais da Matte feitos para esta entrega. `frontend/scripts/generate-pwa-icons.mjs` os recria sem dependências.

## Verificação antes de publicar

1. Executar `node --experimental-strip-types --test scripts/pwa.test.mjs` e `npx tsc --noEmit --incremental false` em `frontend`.
2. Na URL HTTPS publicada, conferir `/manifest.webmanifest`, `/sw.js` e todos os ícones. O manifesto precisa conter os ícones 192/512, `display: standalone`, `scope: /` e `start_url: /`.
3. No Chrome/Edge, instalar, abrir pelo ícone e entrar no escritório. Confirmar entrada por nome, câmera, microfone, uma tela compartilhada e navegação de retorno.
4. Repetir no Safari disponível no Mac/iPhone; verificar a captura de tela somente nos navegadores que a suportam.
5. Abrir uma chamada, publicar uma atualização e voltar à janela: ela não deve recarregar automaticamente. Reabrir depois e confirmar a versão nova.

A validação de arquivos e TypeScript não comprova permissões ou instalação no sistema operacional. Esses fluxos precisam de uma URL publicada e teste no navegador/dispositivo real.

Referências técnicas: [manifesto no Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest), [instalação de PWAs no MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [instalação via ação da pessoa](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
