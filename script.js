const $ = i => document.getElementById(i);

const state = {
    running: false,
    found: 0,
    target: 0,
    attempts: 0,
    startTs: 0,
    cache: new Set()
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
    { url: u => `https://api.ashcon.app/mojang/v2/user/${u}`, type: 'json' },
    { url: u => `https://mush.com.br/api/player/${u}`, type: 'json' },
    { url: u => `https://dl.labymod.net/usernames/${u}`, type: 'json' },
    { url: u => `https://crafatar.com/avatars/${u}`, type: 'img' },
    { url: u => `https://minotar.net/avatar/${u}`, type: 'img' }
];

const chars = {
    v: 'aeiou',
    c: 'bcdfghjklmnpqrstvwxyz',
    a: 'abcdefghijklmnopqrstuvwxyz',
    n: '0123456789'
};

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeNick(min, max, type, pre, useUnd) {
    let len = Math.floor(Math.random() * (max - min + 1)) + min;
    let n = pre ? pre.toLowerCase() : '';
    if (n.length >= len) return n.substring(0, len);
    let rem = len - n.length;

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
    if (useUnd && n.length > 3 && !n.includes('_') && Math.random() > 0.6) {
        let idx = Math.floor(Math.random() * (n.length - 2)) + 1;
        n = n.slice(0, idx) + '_' + n.slice(idx + 1);
    }
    return n;
}

async function fetchApi(nick, apiIdx) {
    const api = apis[apiIdx];
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 2000);
    try {
        const res = await fetch(api.url(nick), { signal: ctrl.signal });
        clearTimeout(id);
        
        if (api.type === 'img') {
            return res.status === 404; 
        }
        return res.status === 404; 
    } catch {
        return false; 
    }
}

async function verifyNick(nick) {
    const idx1 = Math.floor(Math.random() * apis.length);
    const free1 = await fetchApi(nick, idx1);
    
    if (!free1) return false;

    let idx2 = (idx1 + 1) % apis.length;
    const free2 = await fetchApi(nick, idx2);
    
    return free2;
}

function uiAdd(nick) {
    const li = document.createElement('li');
    li.className = 'nick-item';
    li.innerHTML = `
        <div>
            <span class="nick-text">${nick}</span>
            <span class="verified-icon" title="Verificado em múltiplas APIs">✓ VERIFICADO</span>
        </div>
        <button class="copy-btn">Copiar</button>`;
    
    li.querySelector('button').onclick = (e) => {
        navigator.clipboard.writeText(nick);
        e.target.textContent = 'Copiado';
        e.target.style.borderColor = 'var(--success)';
        e.target.style.color = 'var(--success)';
        setTimeout(() => {
            e.target.textContent = 'Copiar';
            e.target.style = '';
        }, 1500);
    };
    
    dom.list.insertBefore(li, dom.list.firstChild);
    if (dom.list.children.length > 150) dom.list.lastChild.remove();
    dom.copy.disabled = false;
    dom.save.disabled = false;
}

async function engine() {
    const maxConc = dom.turbo.checked ? 100 : 20;
    let active = 0;

    const worker = async () => {
        if (!state.running || state.found >= state.target) return;

        if (active < maxConc) {
            active++;
            
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
            
            state.cache.add(nick);
            if (state.cache.size > 100000) state.cache.clear();

            verifyNick(nick).then(isFree => {
                state.attempts++;
                if (isFree && state.running && state.found < state.target) {
                    state.found++;
                    uiAdd(nick);
                }
            }).finally(() => {
                active--;
                worker();
            });
            
            worker();
        } else {
            setTimeout(worker, 50);
        }
    };
    worker();
}

function statsLoop() {
    if (!state.running) return;
    const elap = (Date.now() - state.startTs) / 1000;
    dom.rate.textContent = Math.floor(state.attempts / (elap || 1));
    dom.count.textContent = `${state.found} / ${state.target}`;
    
    if (state.found < state.target) {
        requestAnimationFrame(statsLoop);
    } else {
        toggle(false);
    }
}

function toggle(on) {
    state.running = on;
    dom.start.style.display = on ? 'none' : 'flex';
    dom.stop.style.display = on ? 'flex' : 'none';
    
    if (on) {
        state.found = 0;
        state.attempts = 0;
        state.target = +dom.amt.value;
        state.startTs = Date.now();
        dom.list.innerHTML = '';
        state.cache.clear();
        engine();
        statsLoop();
    }
}

dom.start.onclick = () => toggle(true);
dom.stop.onclick = () => toggle(false);

dom.copy.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')].map(s => s.textContent).join('\n');
    navigator.clipboard.writeText(txt);
    dom.copy.textContent = 'Copiado!';
    setTimeout(() => dom.copy.textContent = 'Copiar Lista', 2000);
};

dom.save.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')].map(s => s.textContent).join('\n');
    const blob = new Blob([txt], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nicks_verificados_${Date.now()}.txt`;
    a.click();
};
