const $ = i => document.getElementById(i);

// Estado Global
const state = {
    running: false,
    found: 0,
    target: 0,
    attempts: 0,
    startTs: 0,
    cache: new Set()
};

// Elementos da UI
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

// Algoritmos de Geração
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
    
    // Inserção inteligente de Underscore
    if (useUnd && n.length > 3 && !n.includes('_') && Math.random() > 0.65) {
        let idx = Math.floor(Math.random() * (n.length - 2)) + 1;
        n = n.slice(0, idx) + '_' + n.slice(idx + 1);
    }
    return n;
}

// === NÚCLEO DE VERIFICAÇÃO (CORS BYPASS) ===
// Usamos carregamento de imagem para Crafatar/Minotar pois não sofrem bloqueio de CORS
// Usamos fetch normal para APIs que permitem (Ashcon/Mush)

function checkImage(url) {
    return new Promise(resolve => {
        const img = new Image();
        // Se carregar, o player existe (Nick Ocupado) -> Retorna FALSE
        img.onload = () => resolve(false);
        // Se der erro (404), o player não existe (Nick Livre) -> Retorna TRUE
        img.onerror = () => resolve(true);
        // Timeout de segurança
        setTimeout(() => { img.src = ""; resolve(false); }, 2500);
        img.src = url;
    });
}

async function checkFetch(url) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 1500);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(id);
        if (res.status === 404 || res.status === 204) return true; // Livre
        return false;
    } catch {
        return false; // Erro de rede ou CORS assumimos como falha
    }
}

async function verifyNick(nick) {
    // 1. Método preferido: Crafatar (Via Imagem - 100% Sem CORS)
    // Se a API do Crafatar retornar 404 na imagem, o nick é livre.
    const isFreeCrafatar = await checkImage(`https://crafatar.com/avatars/${nick}?overlay&size=32`);
    
    if (isFreeCrafatar) {
        // Se o Crafatar disse que é livre, fazemos uma confirmação rápida na Ashcon se possível
        // Se a Ashcon falhar (CORS), confiamos no Crafatar.
        const doubleCheck = await checkFetch(`https://api.ashcon.app/mojang/v2/user/${nick}`);
        return doubleCheck; // Se ambos concordarem (ou Ashcon der 404), é sucesso.
    }
    
    return false;
}

// === INTERFACE ===

function uiAdd(nick) {
    const li = document.createElement('li');
    li.className = 'nick-item';
    li.innerHTML = `
        <div>
            <span class="nick-text">${nick}</span>
            <span class="api-tag">LIVRE</span>
        </div>
        <button class="copy-btn">Copiar</button>`;
    
    li.querySelector('button').onclick = (e) => {
        navigator.clipboard.writeText(nick);
        e.target.textContent = 'Copiado';
        e.target.style.color = 'var(--success)';
        e.target.style.borderColor = 'var(--success)';
        setTimeout(() => {
            e.target.textContent = 'Copiar';
            e.target.style = '';
        }, 1000);
    };
    
    dom.list.insertBefore(li, dom.list.firstChild);
    if (dom.list.children.length > 100) dom.list.lastChild.remove();
    dom.copy.disabled = false;
    dom.save.disabled = false;
}

async function engine() {
    // Reduzido levemente para garantir que o navegador aguente as requisições de imagem
    const maxConc = dom.turbo.checked ? 60 : 15; 
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
            // Gera um nick único que não foi testado recentemente
            do {
                nick = makeNick(min, max, type, pre, und);
                safety++;
            } while (state.cache.has(nick) && safety < 50);
            
            state.cache.add(nick);
            if (state.cache.size > 50000) state.cache.clear();

            verifyNick(nick).then(isFree => {
                state.attempts++;
                if (isFree && state.running && state.found < state.target) {
                    state.found++;
                    uiAdd(nick);
                }
            }).finally(() => {
                active--;
                worker(); // Chama o próximo imediatamente
            });
            
            worker(); // Tenta encher a fila
        } else {
            setTimeout(worker, 50); // Espera um pouco se estiver cheio
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
    dom.start.style.display = on ? 'none' : 'block';
    dom.stop.style.display = on ? 'block' : 'none';
    
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
    a.download = `nicks_${Date.now()}.txt`;
    a.click();
};
