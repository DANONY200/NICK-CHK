const $ = id => document.getElementById(id);

/* =======================
   ESTADO GLOBAL
======================= */
const state = {
  running: false,
  cooldown: false, // Novo: pausa temporária
  found: 0,
  attempts: 0,
  target: 10,
  activeRequests: 0,
  cache: new Set(),
  foundList: [] // Para download
};

/* =======================
   DOM ELEMENTS
======================= */
const dom = {
  start: $('btnStart'),
  stop: $('btnStop'),
  list: $('list'),
  min: $('lenMin'),
  max: $('lenMax'),
  amt: $('amount'),
  pre: $('prefix'),
  algo: $('algo'),
  und: $('underscore'),
  turbo: $('turbo'),
  status: $('statusBar'),
  statAttempts: $('stat-attempts'),
  foundCount: $('foundCount'),
  download: $('btnDownload')
};

/* =======================
   UTILITÁRIOS E DADOS
======================= */
const chars = {
  v: 'aeiou',
  c: 'bcdfghjklmnpqrstvwxyz',
  c_end: 'mnrsxz', // Consoantes boas para terminar nicks
  n: '0123456789',
  a: 'abcdefghijklmnopqrstuvwxyz'
};

const rnd = s => s[Math.floor(Math.random() * s.length)];
const normalize = s => s.toLowerCase().trim();
const wait = ms => new Promise(r => setTimeout(r, ms));

function updateStatus(type, msg) {
  dom.status.className = `status-bar status-${type}`;
  dom.status.textContent = msg;
}

/* =======================
   GERADOR DE NICKS (Lógica Refinada)
======================= */
function makeNick(min, max, type, pre, useUnd) {
  const len = Math.floor(Math.random() * (max - min + 1)) + min;
  let nick = normalize(pre);
  let rem = len - nick.length;
  
  if (rem <= 0) return nick.slice(0, len);

  if (type === 'pronounce') {
    // Começa com vogal ou consoante aleatoriamente se não tiver prefixo
    let isVowel = nick.length > 0 ? !chars.v.includes(nick.slice(-1)) : Math.random() > 0.5;
    
    while (rem > 0) {
      if (isVowel) {
        nick += rnd(chars.v);
        isVowel = false;
        rem--;
      } else {
        // Se for a última letra, usa um pool de consoantes finais melhores
        let pool = (rem === 1) ? chars.c_end : chars.c;
        nick += rnd(pool);
        isVowel = true;
        rem--;
      }
    }
  } 
  else if (type === 'num_suffix') {
    while (rem-- > 1) nick += rnd(chars.n);
    nick += rnd(chars.a); // Termina sempre com letra para "estilo"
  } 
  else {
    let pool = chars.a + (type === 'mixed' ? chars.n : '');
    while (rem--) nick += rnd(pool);
  }

  // Inserção inteligente de Underscore
  if (useUnd && nick.length > 4 && !nick.includes('_') && Math.random() > 0.7) {
    const pos = Math.floor(Math.random() * (nick.length - 2)) + 1;
    nick = nick.slice(0, pos) + '_' + nick.slice(pos);
  }

  return nick;
}

/* =======================
   SISTEMA DE VERIFICAÇÃO (Com Anti-Rate Limit)
======================= */

// Passo 1: Verifica imagem (Rápido, sem rate limit severo)
function checkImage(nick) {
  return new Promise(resolve => {
    const img = new Image();
    const timeout = setTimeout(() => resolve(true), 1500); // Se travar, assume livre pra não bloquear
    
    img.onload = () => { clearTimeout(timeout); resolve(false); }; // Carregou = Existe (Indisponível)
    img.onerror = () => { clearTimeout(timeout); resolve(true); }; // Erro = Não existe avatar (Provável Disponível)
    
    img.src = `https://crafatar.com/avatars/${nick}?overlay&size=32&t=${Date.now()}`;
  });
}

// Passo 2: Confirmação via API (Lento, sujeito a Rate Limit)
async function checkApi(nick) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`https://api.ashcon.app/mojang/v2/user/${nick}`, {
      signal: controller.signal
    });
    
    clearTimeout(id);
    
    // Status 404 = Usuário não encontrado = DISPONÍVEL
    if (res.status === 404) return { available: true, status: 404 };
    
    // Status 429 = Rate Limit
    if (res.status === 429) return { available: false, status: 429 };

    return { available: false, status: res.status };
  } catch (e) {
    return { available: false, status: 500 }; // Erro de rede
  }
}

async function verifyNick(nick) {
  // 1. Filtro de Avatar
  const likelyFree = await checkImage(nick);
  if (!likelyFree) return false;

  // 2. Confirmação de API
  const result = await checkApi(nick);

  if (result.status === 429) {
    handleRateLimit();
    return false;
  }

  return result.available;
}

/* =======================
   CONTROLE DE FLUXO
======================= */
async function handleRateLimit() {
  if (state.cooldown) return; // Já está em cooldown
  state.cooldown = true;
  
  updateStatus('cooldown', '⚠️ API Rate Limit! Aguardando 15s...');
  
  // Pausa tudo por 15 segundos
  await wait(15000);
  
  state.cooldown = false;
  if(state.running) updateStatus('running', 'Gerando e verificando...');
}

function uiAdd(nick) {
  const li = document.createElement('li');
  li.className = 'nick-item';
  li.innerHTML = `
    <span class="nick-text">${nick}</span>
    <button class="copy-btn" onclick="copy('${nick}', this)">Copiar</button>
  `;
  dom.list.prepend(li);
  
  // Atualiza contadores
  state.foundList.push(nick);
  dom.foundCount.textContent = state.found;
  dom.download.disabled = false;
}

async function loop() {
  const maxConc = dom.turbo.checked ? 30 : 10;
  
  updateStatus('running', 'Gerando e verificando...');

  while (state.running && state.found < state.target) {
    // Pausa se estiver em cooldown ou muitas requisições ativas
    if (state.cooldown || state.activeRequests >= maxConc) {
      await wait(100);
      continue;
    }

    // Gera um nick único
    let nick, tries = 0;
    do {
      nick = makeNick(+dom.min.value, +dom.max.value, dom.algo.value, dom.pre.value, dom.und.checked);
      tries++;
    } while (state.cache.has(nick) && tries < 50);

    state.cache.add(nick);
    state.activeRequests++;
    
    // Processo Assíncrono
    verifyNick(nick).then(isAvailable => {
      state.attempts++;
      dom.statAttempts.textContent = state.attempts;

      if (isAvailable && state.running) {
        state.found++;
        uiAdd(nick);
      }
    }).finally(() => {
      state.activeRequests--;
    });
    
    // Pequeno atraso artificial para não travar o navegador
    await wait(dom.turbo.checked ? 10 : 50);
  }

  // Fim do Loop
  if (!state.cooldown) {
    stopEngine();
    updateStatus('idle', `Finalizado! Encontrados: ${state.found}`);
  }
}

/* =======================
   INTERAÇÃO UI
======================= */
function stopEngine() {
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
  dom.foundCount.textContent = '0';
  dom.download.disabled = true;
  
  dom.start.style.display = 'none';
  dom.stop.style.display = 'block';
  
  loop();
};

dom.stop.onclick = () => {
  state.running = false;
  updateStatus('idle', 'Parado pelo usuário');
  stopEngine();
};

// Função Global para Copiar
window.copy = (text, btn) => {
  navigator.clipboard.writeText(text);
  const original = btn.textContent;
  btn.textContent = 'Copiado!';
  btn.style.color = 'var(--success)';
  btn.style.borderColor = 'var(--success)';
  setTimeout(() => {
    btn.textContent = original;
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 1000);
};

// Download TXT
dom.download.onclick = () => {
  if (state.foundList.length === 0) return;
  const blob = new Blob([state.foundList.join('\r\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nicks_mc_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
