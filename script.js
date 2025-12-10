const $ = i => document.getElementById(i);
const c = (t,p) => document.createElement(t);

const state = {
    running: false,
    found: 0,
    target: 0,
    attempts: 0,
    startTs: 0,
    cache: new Set(),
    apiIndex: 0
};

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

const apis = [
    u => `https://api.ashcon.app/mojang/v2/user/${u}`,
    u => `https://mush.com.br/api/player/${u}`
];

const chars = {
    v: 'aeiou',
    c: 'bcdfghjklmnpqrstvwxyz',
    a: 'abcdefghijklmnopqrstuvwxyz',
    n: '0123456789'
};

const getUrl = (nick) => {
    state.apiIndex = (state.apiIndex + 1) % apis.length;
    return apis[state.apiIndex](nick);
};

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }

function makeNick(min, max, type, pre, useUnd) {
    const len = Math.floor(Math.random() * (max - min + 1)) + min;
    let n = pre ? pre.toLowerCase() : '';
    
    if (n.length >= len) return n.substring(0, len);

    const rem = len - n.length;

    if (type === 'pronounce') {
        let isV = n.length > 0 ? !chars.v.includes(n.slice(-1)) : Math.random() > 0.5;
        for (let i = 0; i < rem; i++) {
            n += rnd(isV ? chars.v : chars.c);
            isV = !isV;
        }
    } else {
        let pool = chars.a;
        if (type === 'mixed') pool += chars.n;
        if (type === 'og') pool = chars.a;
        
        for (let i = 0; i < rem; i++) n += rnd(pool);
    }

    if (useUnd && n.length > 3 && !n.includes('_') && Math.random() > 0.7) {
        const pos = Math.floor(Math.random() * (n.length - 2)) + 1;
        n = n.slice(0, pos) + '_' + n.slice(pos + 1);
    }
    return n;
}

async function check(nick) {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(getUrl(nick), { signal: controller.signal });
        clearTimeout(id);
        
        if (res.status === 404) return true;
        if (res.status === 200) return false;
        return false;
    } catch {
        return false;
    }
}

function uiAdd(nick) {
    const li = document.createElement('li');
    li.className = 'nick-item';
    li.innerHTML = `<span class="nick-text">${nick}</span><button class="copy-btn">Copiar</button>`;
    
    li.querySelector('button').onclick = (e) => {
        navigator.clipboard.writeText(nick);
        e.target.textContent = 'Feito!';
        setTimeout(() => e.target.textContent = 'Copiar', 1000);
    };
    
    dom.list.insertBefore(li, dom.list.firstChild);
    if (dom.list.children.length > 100) dom.list.lastChild.remove();
    
    dom.copy.disabled = false;
    dom.save.disabled = false;
}

async function loop() {
    const concurrency = dom.turbo.checked ? 150 : 30;
    let active = 0;

    const tick = async () => {
        if (!state.running || state.found >= state.target) return;

        if (active < concurrency) {
            active++;
            const min = +dom.min.value;
            const max = +dom.max.value;
            const type = dom.algo.value;
            const pre = dom.pre.value.trim();
            const und = dom.und.checked;

            let nick;
            do {
                nick = makeNick(min, max, type, pre, und);
            } while (state.cache.has(nick));
            
            state.cache.add(nick);
            if (state.cache.size > 50000) state.cache.clear();

            check(nick).then(free => {
                state.attempts++;
                if (free) {
                    state.found++;
                    uiAdd(nick);
                }
            }).finally(() => {
                active--;
                tick();
            });

            tick();
        } else {
            setTimeout(tick, 10);
        }
    };

    tick();
}

function updateStats() {
    if (!state.running) return;
    const now = Date.now();
    const sec = (now - state.startTs) / 1000;
    const pps = Math.round(state.attempts / (sec || 1));
    dom.rate.textContent = `${pps} PPS`;
    dom.count.textContent = `${state.found} / ${state.target}`;
    
    if (state.found < state.target) {
        requestAnimationFrame(updateStats);
    } else {
        toggle(false);
    }
}

function toggle(on) {
    state.running = on;
    dom.start.style.display = on ? 'none' : 'block';
    dom.stop.style.display = on ? 'block' : 'none';
    
    if (on) {
        state.found = 0;
        state.attempts = 0;
        state.target = +dom.amt.value;
        state.startTs = Date.now();
        dom.list.innerHTML = '';
        state.cache.clear();
        loop();
        updateStats();
    }
}

dom.start.onclick = () => toggle(true);
dom.stop.onclick = () => toggle(false);

dom.copy.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')].map(s => s.textContent).join('\n');
    navigator.clipboard.writeText(txt);
    dom.copy.textContent = 'Copiado!';
    setTimeout(() => dom.copy.textContent = 'Copiar Tudo', 2000);
};

dom.save.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')].map(s => s.textContent).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {type: 'text/plain'}));
    a.download = `nicks_${Date.now()}.txt`;
    a.click();
};
