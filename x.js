// SpoilerBlur — adaptador do X (Twitter)
// Lê o texto que aparece na tela (post, autor, post citado, card de link, alt das imagens).
// Reposts mostram o conteúdo do post original, então também são pegos.
(() => {
  const SB = window.SB;

  const MEDIA_SEL = '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]';

  SB.register({
    site: 'x',
    cardSel: 'article[data-testid="tweet"]',
    getId(el) {
      // o link do horário é o do post exibido (no repost, o post original)
      const time = el.querySelector('a[href*="/status/"] time');
      const a = time ? time.closest('a') : el.querySelector('a[href*="/status/"]');
      const m = a && a.getAttribute('href').match(/\/status\/(\d+)/);
      return m ? m[1] : null;
    },
    badgeHost(el) {
      return el.querySelector(MEDIA_SEL);
    }
  });
})();
