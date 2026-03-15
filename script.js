const $ = id => document.getElementById(id);
const state = {
  running: false,
  cooldown: false,
  found: 0,
  attempts: 0,
  target: 10,
  activeRequests: 0,
  cache: new Set(),
  foundList: []
};
const dom = {
  start: $('btnStart'),
  stop: $('btnStop'),
  list: $('list'),
  empty: $('emptyState'),
  min: $('lenMin'),
  max: $('lenMax'),
  amt: $('amount'),
  pre: $('prefix'),
  algo: $('algo'),
  und: $('underscore'),
  turbo: $('turbo'),
  statusBar: $('statusBar'),
  statusText: $('statusText'),
  statAttempts: $('stat-attempts'),
  foundCount: $('foundCount'),
  download: $('btnDownload')
};
const chars = {
  v: 'aeiou',
  c: 'bcdfghjklmnpqrstvwxyz',
  c_end: 'mnrsxz', 
  n: '0123456789',
  a: 'abcdefghijklmnopqrstuvwxyz'
};

const rnd = s => s[Math.floor(Math.random() * s.length)];
const normalize = s => s.toLowerCase().trim();
const wait = ms => new Promise(r => setTimeout(r, ms));

function updateStatus(type, msg) {
  dom.statusBar.className = `status-bar status-${type}`;
  dom.statusText.textContent = msg;
}
function makeNick(min, max, type, pre, useUnd) {
  const len = Math.floor(Math.random() * (max - min + 1)) + min;
  let nick = normalize(pre);
  let rem = len - nick.length;
  
  if (rem <= 0) return nick.slice(0, len);

  // Lógica: Numérico + Letra Final (Pedido do usuário)
  if (type === 'num_suffix') {
    // Preenche com números até faltar 1 caractere
    while (rem > 1) {
      nick += rnd(chars.n);
      rem--;
    }
    nick += rnd(chars.a);
  } 
  else if (type === 'pronounce') {
    let isVowel = nick.length > 0 ? !chars.v.includes(nick.slice(-1)) : Math.random() > 0.5;
    while (rem > 0) {
      if (isVowel) {
        nick += rnd(chars.v);
        isVowel = false;
      } else {
        let pool = (rem === 1) ? chars.c_end : chars.c;
        nick += rnd(pool);
        isVowel = true;
      }
      rem--;
    }
  } 
  else {
    let pool = chars.a + (type === 'mixed' ? chars.n : '');
    while (rem--) nick += rnd(pool);
  }
  if (useUnd && nick.length > 4 && !nick.includes('_') && Math.random() > 0.7) {
    const pos = Math.floor(Math.random() * (nick.length - 2)) + 1;
    nick = nick.slice(0, pos) + '_' + nick.slice(pos);
  }

  return nick;
}
function checkImage(nick) {
  return new Promise(resolve => {
    const img = new Image();
    const to = setTimeout(() => resolve(true), 1500);
    img.onload = () => { clearTimeout(to); resolve(false); };
    img.onerror = () => { clearTimeout(to); resolve(true); };
    img.src = `https://crafatar.com/avatars/${nick}?overlay&size=32&t=${Date.now()}`;
  });
}

async function checkApi(nick) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 2000);
  try {
    const res = await fetch(`https://api.ashcon.app/mojang/v2/user/${nick}`, { signal: c.signal });
    clearTimeout(id);
    if (res.status === 404) return { ok: true };
    if (res.status === 429) return { rate: true };
    return { ok: false };
  } catch { return { ok: false }; }
}

async function verifyNick(nick) {
  if (!(await checkImage(nick))) return false;
  const res = await checkApi(nick);
  if (res.rate) { await handleRateLimit(); return false; }
  return res.ok;
}

async function handleRateLimit() {
  if (state.cooldown) return;
  state.cooldown = true;
  updateStatus('cooldown', '⚠️ Calma aí! Esperando 15s...');
  await wait(15000);
  state.cooldown = false;
  if(state.running) updateStatus('running', 'Buscando nicks...');
}
function uiAdd(nick) {
  dom.empty.style.display = 'none';
  const li = document.createElement('li');
  li.className = 'nick-item';
  li.innerHTML = `
    <span class="nick-text">${nick}</span>
    <button class="copy-btn" onclick="copy('${nick}', this)">Copiar</button>
  `;
  dom.list.prepend(li);
  state.foundList.push(nick);
  dom.foundCount.textContent = state.found;
  dom.download.disabled = false;
}

async function loop() {
  const maxConc = dom.turbo.checked ? 30 : 10;
  updateStatus('running', 'Buscando nicks...');

  while (state.running && state.found < state.target) {
    if (state.cooldown || state.activeRequests >= maxConc) {
      await wait(50); continue;
    }

    let nick, t = 0;
    do {
      nick = makeNick(+dom.min.value, +dom.max.value, dom.algo.value, dom.pre.value, dom.und.checked);
      t++;
    } while (state.cache.has(nick) && t < 50);

    state.cache.add(nick);
    state.activeRequests++;

    verifyNick(nick).then(ok => {
      state.attempts++;
      dom.statAttempts.textContent = state.attempts;
      if (ok && state.running) {
        state.found++;
        uiAdd(nick);
      }
    }).finally(() => state.activeRequests--);

    await wait(dom.turbo.checked ? 10 : 40);
  }

  if (!state.cooldown) {
    stop();
    updateStatus('idle', `Finalizado! ${state.found} nicks.`);
  }
}

function stop() {
  state.running = false;
  dom.start.style.display = 'block';
  dom.stop.style.display = 'none';
}

dom.start.onclick = () => {
  if (state.running) return;
  state.running = true;
  state.found = 0;
  state.attempts = 0;
  state.cache.clear();
  state.foundList = [];
  state.target = +dom.amt.value;
  dom.list.innerHTML = '';
  dom.empty.style.display = 'block';
  dom.foundCount.textContent = '0';
  dom.start.style.display = 'none';
  dom.stop.style.display = 'block';
  loop();
};

dom.stop.onclick = () => {
  state.running = false;
  updateStatus('idle', 'Parado.');
  stop();
};

window.copy = (txt, btn) => {
  navigator.clipboard.writeText(txt);
  btn.textContent = 'Copiado!';
  btn.style.borderColor = 'var(--green)';
  btn.style.color = 'var(--green)';
  setTimeout(() => {
    btn.textContent = 'Copiar';
    btn.style = '';
  }, 1000);
};

dom.download.onclick = () => {
  const blob = new Blob([state.foundList.join('\r\n')], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'nicks_ultimate.txt';
  a.click();
};

// Config Widget
(() => {
  const panel = document.getElementById('adPanel');
  const toggle = document.getElementById('adToggle');
  const close = document.getElementById('adClose');
  const save = document.getElementById('adSave');
  const cfgAmount = document.getElementById('cfgAmount');

  const themes = {
    indigo: { primary: '#6366f1', accent: '#a855f7' },
    cyan:   { primary: '#06b6d4', accent: '#3b82f6' },
    rose:   { primary: '#f43f5e', accent: '#ec4899' }
  };

  function applyTheme(name) {
    const t = themes[name];
    if (!t) return;
    document.documentElement.style.setProperty('--primary', t.primary);
    document.documentElement.style.setProperty('--accent', t.accent);
  }

  function loadConfig() {
    const cfg = JSON.parse(localStorage.getItem('mcgen_cfg') || '{}');
    if (cfg.theme) {
      applyTheme(cfg.theme);
      document.querySelectorAll('[data-theme]').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === cfg.theme);
      });
    }
    if (cfg.speed === 'turbo') {
      document.getElementById('turbo').checked = true;
      document.querySelectorAll('[data-speed]').forEach(b => {
        b.classList.toggle('active', b.dataset.speed === 'turbo');
      });
    }
    if (cfg.amount) {
      document.getElementById('amount').value = cfg.amount;
      cfgAmount.value = cfg.amount;
    }
  }

  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  close.addEventListener('click', () => panel.classList.remove('open'));

  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  save.addEventListener('click', () => {
    const theme = document.querySelector('[data-theme].active')?.dataset.theme || 'indigo';
    const speed = document.querySelector('[data-speed].active')?.dataset.speed || 'normal';
    const amount = cfgAmount.value;

    applyTheme(theme);
    document.getElementById('turbo').checked = speed === 'turbo';
    document.getElementById('amount').value = amount;

    localStorage.setItem('mcgen_cfg', JSON.stringify({ theme, speed, amount }));

    save.textContent = 'Salvo ✓';
    setTimeout(() => { save.textContent = 'Salvar'; panel.classList.remove('open'); }, 800);
  });

  loadConfig();
})();
