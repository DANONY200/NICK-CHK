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
    cache: new Set(),
    workers: []
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
   VALIDAÇÃO SIMPLES
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
   GERAÇÃO DE NICKS (OTIMIZADA)
======================= */
const chars = {
    v: 'aeiou',
    c: 'bcdfghjklmnpqrstvwxyz',
    a: 'abcdefghijklmnopqrstuvwxyz',
    n: '0123456789'
};

// Pré-calculado para performance
const charArray = {
    v: chars.v.split(''),
    c: chars.c.split(''),
    a: chars.a.split(''),
    n: chars.n.split(''),
    mixed: (chars.a + chars.n).split('')
};

const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

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
            nick += rnd(vowel ? charArray.v : charArray.c);
            vowel = !vowel;
        }
    } else if (type === 'num_suffix') {
        while (rem-- > 1) nick += rnd(charArray.n);
        nick += rnd(charArray.a);
    } else {
        let pool = type === 'mixed' ? charArray.mixed : charArray.a;
        while (rem--) nick += rnd(pool);
    }

    if (useUnd && nick.length > 3 && !nick.includes('_') && Math.random() > 0.65) {
        const i = Math.floor(Math.random() * (nick.length - 2)) + 1;
        nick = nick.slice(0, i) + '_' + nick.slice(i + 1);
    }

    return nick.toLowerCase();
}

/* =======================
   VERIFICAÇÃO DUPLA (CONFIABILIDADE)
======================= */
async function checkImage(url, timeout = 1500) {
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
        img.onerror = () => finish(true);  // Livre
        img.src = `${url}&t=${Date.now()}`;

        setTimeout(() => finish(false), timeout);
    });
}

async function checkFetch(url, timeout = 1000) {
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

// Nova API para verificação extra
async function checkMineTools(nick) {
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
        img.src = `https://minotar.net/helm/${nick}/32.png?t=${Date.now()}`;

        setTimeout(() => finish(false), 1000);
    });
}

async function verifyNick(nick) {
    const normalized = nick.toLowerCase();
    
    // Cache rápido para evitar repetições
    if (state.cache.has(normalized)) return false;
    
    // PRIMEIRA VERIFICAÇÃO: Crafatar (rápido)
    const freeCrafatar = await checkImage(
        `https://crafatar.com/avatars/${normalized}?overlay&size=32`
    );
    
    if (!freeCrafatar) {
        state.cache.add(normalized);
        return false;
    }
    
    // SEGUNDA VERIFICAÇÃO: MineTools (concorrente)
    const freeMineTools = await checkMineTools(normalized);
    
    if (!freeMineTools) {
        state.cache.add(normalized);
        return false;
    }
    
    // TERCEIRA VERIFICAÇÃO: API Ashcon (definitivo)
    const freeAshcon = await checkFetch(
        `https://api.ashcon.app/mojang/v2/user/${normalized}`
    );
    
    // Se passou nas 3 verificações, é válido
    if (freeAshcon) {
        return true;
    }
    
    state.cache.add(normalized);
    return false;
}

/* =======================
   UI (RÁPIDA)
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
   ENGINE ULTRA RÁPIDO
======================= */
async function engineLoop() {
    const maxConc = dom.turbo.checked ? 50 : 25; // Aumentado para mais velocidade
    const batchSize = dom.turbo.checked ? 10 : 5; // Processamento em batch
    
    while (true) {
        if (!state.running || state.found >= state.target) break;

        if (state.active >= maxConc) {
            await new Promise(r => setTimeout(r, 20)); // Reduzido delay
            continue;
        }

        // Processar em batch para maior velocidade
        const batchPromises = [];
        
        for (let i = 0; i < batchSize && state.running && state.found < state.target && state.active < maxConc; i++) {
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
            } while (state.cache.has(nick) && safety < 50); // Reduzido safety

            if (safety >= 50) {
                state.active--;
                continue;
            }

            state.cache.add(nick);
            if (state.cache.size > 100000) { // Cache maior para evitar repetições
                const arr = Array.from(state.cache);
                state.cache = new Set(arr.slice(-50000));
            }

            batchPromises.push(
                verifyNick(nick).then(free => {
                    state.attempts++;
                    if (free && state.running && state.found < state.target) {
                        state.found++;
                        uiAdd(nick);
                    }
                }).catch(() => {
                    // Ignorar erros para não parar o fluxo
                }).finally(() => {
                    state.active--;
                })
            );
        }
        
        // Aguardar batch atual sem bloquear loop principal
        if (batchPromises.length > 0) {
            Promise.allSettled(batchPromises);
        }
        
        // Pequeno delay para não sobrecarregar
        if (state.active >= maxConc * 0.8) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    // Aguardar conclusão final
    const waitEnd = setInterval(() => {
        if (!state.running || state.active === 0) {
            clearInterval(waitEnd);
            toggle(false);
        }
    }, 100);
}

/* =======================
   STATS (OTIMIZADO)
======================= */
let statsAnimationFrame = null;
function statsLoop() {
    if (!state.running) {
        if (statsAnimationFrame) {
            cancelAnimationFrame(statsAnimationFrame);
            statsAnimationFrame = null;
        }
        return;
    }
    
    const t = (Date.now() - state.startTs) / 1000;
    dom.rate.textContent = Math.floor(state.attempts / (t || 1));
    dom.count.textContent = `${state.found} / ${state.target}`;
    
    // Otimizado: atualizar a cada 250ms ao invés de 60fps
    setTimeout(() => {
        statsAnimationFrame = requestAnimationFrame(statsLoop);
    }, 250);
}

/* =======================
   CONTROLES (SIMPLES)
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
        dom.copy.disabled = true;
        dom.save.disabled = true;

        engineLoop();
        statsLoop();
    } else {
        state.cache.clear();
        if (statsAnimationFrame) {
            cancelAnimationFrame(statsAnimationFrame);
            statsAnimationFrame = null;
        }
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
    dom.copy.textContent = 'Copiado!';
    setTimeout(() => dom.copy.textContent = 'Copiar Lista', 1000);
};

dom.save.onclick = () => {
    const txt = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nicks_${Date.now()}.txt`;
    a.click();
    dom.save.textContent = 'Baixado!';
    setTimeout(() => dom.save.textContent = 'Baixar .txt', 1000);
};

/* =======================
   INICIALIZAÇÃO RÁPIDA
======================= */
// Pre-aquece o cache
setTimeout(() => {
    for (let i = 0; i < 1000; i++) {
        state.cache.add(Math.random().toString(36).substring(2, 10));
    }
}, 1000);
