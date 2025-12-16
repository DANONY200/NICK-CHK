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
    turbo: $('turbo')
};

/* =======================
   VALIDAÇÃO
======================= */
function validateInputs() {
    const min = +dom.min.value;
    const max = +dom.max.value;
    const amt = +dom.amt.value;

    if (min < 3 || max > 16) {
        alert('O tamanho do nick deve ser entre 3 e 16.');
        return false;
    }
    if (min > max) {
        alert('O tamanho mínimo não pode ser maior que o máximo.');
        return false;
    }
    if (amt <= 0 || amt > 5000) {
        alert('Quantidade inválida (máx 5000).');
        return false;
    }
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

function makeNick(min, max, type, pre, useUnd) {
    const len = Math.floor(Math.random() * (max - min + 1)) + min;
    let nick = pre.toLowerCase();

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

    if (useUnd && nick.length > 3 && !nick.includes('_') && Math.random() > 0.65) {
        const i = Math.floor(Math.random() * (nick.length - 2)) + 1;
        nick = nick.slice(0, i) + '_' + nick.slice(i + 1);
    }

    return nick;
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

        img.onload = () => finish(false);
        img.onerror = () => finish(true);
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
        return res.status === 404 || res.status === 204;
    } catch {
        return false;
    } finally {
        clearTimeout(id);
    }
}

async function verifyNick(nick) {
    const free = await checkImage(`https://crafatar.com/avatars/${nick}?size=32`);
    if (!free) return false;
    return checkFetch(`https://api.ashcon.app/mojang/v2/user/${nick}`);
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
        <button class="copy-btn">Copiar</button>
    `;

    li.querySelector('button').onclick = e => {
        navigator.clipboard.writeText(nick);
        e.target.textContent = 'Copiado';
        setTimeout(() => e.target.textContent = 'Copiar', 1000);
    };

    dom.list.prepend(li);
    if (dom.list.children.length > 200) dom.list.lastChild.remove();
    dom.copy.disabled = dom.save.disabled = false;
}

/* =======================
   ENGINE
======================= */
async function engineLoop() {
    const maxConc = dom.turbo.checked ? 35 : 15;

    while (true) {
        if (!state.running || state.found >= state.target) break;

        if (state.active >= maxConc) {
            await new Promise(r => setTimeout(r, 40));
            continue;
        }

        state.active++;

        const min = +dom.min.value;
        const max = +dom.max.value;
        const type = dom.algo.value;
        const pre = dom.pre.value.trim();
        const und = dom.und.checked;

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
function toggle(on) {
    if (state.running === on) return;

    state.running = on;
    dom.start.style.display = on ? 'none' : 'block';
    dom.stop.style.display = on ? 'block' : 'none';

    if (on) {
        if (!validateInputs()) return toggle(false);

        state.found = 0;
        state.attempts = 0;
        state.active = 0;
        state.target = +dom.amt.value;
        state.startTs = Date.now();
        state.cache.clear();
        dom.list.innerHTML = '';

        engineLoop();
        statsLoop();
    }
}

dom.start.onclick = () => toggle(true);
dom.stop.onclick = () => toggle(false);

/* =======================
   AÇÕES
======================= */
dom.copy.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent).join('\n');
    navigator.clipboard.writeText(txt);
};

dom.save.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nicks_${Date.now()}.txt`;
    a.click();
};
