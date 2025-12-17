const $ = id => document.getElementById(id);

/* =======================
   ESTADO CENTRAL
======================= */
const state = {
    running: false,
    found: 0,
    attempts: 0,
    target: 0,
    startTs: 0,
    active: 0,
    cache: new Set()
};

/* =======================
   ELEMENTOS
======================= */
const dom = {
    start: $('btnStart'),
    stop: $('btnStop'),
    list: $('list'),
    rate: $('statRate'),
    count: $('statFound'),
    copy: $('btnCopy'),
    save: $('btnDown'),
    min: $('lenMin'),
    max: $('lenMax'),
    amt: $('amount'),
    pre: $('prefix'),
    algo: $('algo'),
    und: $('underscore'),
    turbo: $('turbo'),
    formError: $('formError')
};

/* =======================
   VALIDAÇÃO
======================= */
function setFormError(msg) {
    dom.formError.textContent = msg || '';
}

function sanitizePrefix(str) {
    // Mantém apenas letras e números, minúsculos, max 3 chars
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 3);
}

function validateInputs() {
    const min = +dom.min.value;
    const max = +dom.max.value;
    const amt = +dom.amt.value;

    if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(amt)) {
        setFormError('Preencha todos os campos numéricos corretamente.');
        return false;
    }
    if (min < 3 || max > 16) {
        setFormError('O tamanho do nick deve ser entre 3 e 16 caracteres.');
        return false;
    }
    if (min > max) {
        setFormError('O tamanho mínimo não pode ser maior que o máximo.');
        return false;
    }
    if (amt <= 0 || amt > 5000) {
        setFormError('Quantidade inválida (máx 5000).');
        return false;
    }
    setFormError('');
    return true;
}

/* =======================
   GERAÇÃO DE NICKS
======================= */
const chars = {
    v: 'aeiou',
    c: 'bcdfghjklmnpqrstvwxyz',
    a: 'abcdefghijklmnopqrstuvwxyz',
    n: '0123456789'
};

const rnd = str => str[Math.floor(Math.random() * str.length)];

function makeNick(min, max, type, preRaw, useUnd) {
    const pre = sanitizePrefix(preRaw);
    const len = Math.floor(Math.random() * (max - min + 1)) + min;
    let nick = pre;

    if (nick.length >= len) return nick.slice(0, len);
    let rem = len - nick.length;

    if (type === 'pronounce') {
        let vowel = nick.length
            ? !chars.v.includes(nick.slice(-1))
            : Math.random() > 0.5;

        while (rem--) {
            nick += rnd(vowel ? chars.v : chars.c);
            vowel = !vowel;
        }
    } else if (type === 'num_suffix') {
        while (rem-- > 1) nick += rnd(chars.n);
        nick += rnd(chars.a);
    } else {
        let pool = chars.a + (type === 'mixed' ? chars.n : '');
        while (rem--) nick += rnd(pool);
    }

    if (
        useUnd &&
        nick.length > 3 &&
        !nick.includes('_') &&
        Math.random() > 0.65
    ) {
        const i = Math.floor(Math.random() * (nick.length - 2)) + 1;
        nick = nick.slice(0, i) + '_' + nick.slice(i + 1);
    }

    return nick.toLowerCase();
}

/* =======================
   VERIFICAÇÃO
======================= */
function checkImage(url, timeout = 2000) {
    return new Promise(resolve => {
        const img = new Image();
        let done = false;

        const finish = res => {
            if (!done) {
                done = true;
                img.src = '';
                resolve(res);
            }
        };

        img.onload = () => finish(false); // Ocupado
        img.onerror = () => finish(true);  // Livre (assumido)
        img.src = `${url}&t=${Date.now()}`;

        setTimeout(() => finish(false), timeout);
    });
}

async function checkFetch(url, timeout = 1500) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: ctrl.signal
        });

        // 404/204 = livre (API específica)
        return res.status === 404 || res.status === 204;
    } catch {
        // Em erro de rede, não marcamos como livre para evitar falsos positivos
        return false;
    } finally {
        clearTimeout(id);
    }
}

async function verifyNick(nick) {
    const normalized = nick.toLowerCase();

    const freeCrafatar = await checkImage(
        `https://crafatar.com/avatars/${normalized}?overlay&size=32`
    );

    if (!freeCrafatar) return false;

    return checkFetch(
        `https://api.ashcon.app/mojang/v2/user/${normalized}`
    );
}

/* =======================
   UI
======================= */
function uiAdd(nick) {
    const li = document.createElement('li');
    li.className = 'nick-item';
    li.innerHTML = `
        <div>
            <span class="nick-text">${nick}</span>
            <span class="api-tag">LIVRE</span>
        </div>
        <button class="copy-btn" type="button">Copiar</button>
    `;

    const btn = li.querySelector('button');
    btn.onclick = e => {
        navigator.clipboard.writeText(nick).then(() => {
            e.target.textContent = 'Copiado';
            setTimeout(() => e.target.textContent = 'Copiar', 1000);
        }).catch(() => {
            e.target.textContent = 'Erro';
            setTimeout(() => e.target.textContent = 'Copiar', 1000);
        });
    };

    dom.list.prepend(li);
    if (dom.list.children.length > 200) dom.list.lastChild.remove();
    dom.copy.disabled = dom.save.disabled = dom.list.children.length === 0;
}

/* =======================
   ENGINE
======================= */
async function engineLoop() {
    const maxConc = dom.turbo.checked ? 35 : 15;

    // Snapshot de config no início da execução
    const min = +dom.min.value;
    const max = +dom.max.value;
    const type = dom.algo.value;
    const pre = dom.pre.value.trim();
    const und = dom.und.checked;

    while (state.running && state.found < state.target) {
        if (state.active >= maxConc) {
            await new Promise(r => setTimeout(r, 40));
            continue;
        }

        state.active++;

        let nick;
        let safety = 0;
        do {
            nick = makeNick(min, max, type, pre, und);
            safety++;
        } while (state.cache.has(nick) && safety < 100);

        if (safety >= 100) {
            state.active--;
            await new Promise(r => setTimeout(r, 100));
            continue;
        }

        state.cache.add(nick);
        if (state.cache.size > 50000) state.cache.clear();

        verifyNick(nick).then(free => {
            state.attempts++;
            if (free && state.running && state.found < state.target) {
                state.found++;
                uiAdd(nick);
            }
        }).finally(() => {
            state.active--;
        });
    }

    // Espera os checks pendentes finalizarem
    const waitEnd = setInterval(() => {
        if (!state.running || state.active === 0) {
            clearInterval(waitEnd);
            toggle(false);
        }
    }, 300);
}

/* =======================
   STATS
======================= */
function statsLoop() {
    if (!state.running) return;
    const t = (Date.now() - state.startTs) / 1000;
    dom.rate.textContent = Math.floor(state.attempts / (t || 1));
    dom.count.textContent = `${state.found} / ${state.target}`;
    requestAnimationFrame(statsLoop);
}

/* =======================
   CONTROLES
======================= */
function resetStateForRun() {
    state.found = 0;
    state.attempts = 0;
    state.active = 0;
    state.target = +dom.amt.value;
    state.startTs = Date.now();
    state.cache.clear();
    dom.list.innerHTML = '';
    dom.copy.disabled = true;
    dom.save.disabled = true;
}

function toggle(on) {
    // Antes de mudar o estado, valida se vamos ligar
    if (on) {
        if (!validateInputs()) return; // não inicia
    }

    if (state.running === on) return;

    state.running = on;
    dom.start.style.display = on ? 'none' : 'block';
    dom.stop.style.display = on ? 'block' : 'none';

    if (on) {
        resetStateForRun();
        engineLoop();
        statsLoop();
    }
}

/* =======================
   EVENTOS
======================= */
dom.start.onclick = () => toggle(true);
dom.stop.onclick = () => toggle(false);

dom.copy.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent)
        .join('\n');
    if (!txt) return;
    navigator.clipboard.writeText(txt);
};

dom.save.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent)
        .join('\n');
    if (!txt) return;
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nicks_${Date.now()}.txt`;
    a.click();
};
