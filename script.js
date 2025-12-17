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
    abortController: new AbortController(),
    requestQueue: {
        queue: [],
        processing: 0,
        maxConcurrent: 8,
        async process() {
            if (this.processing >= this.maxConcurrent || this.queue.length === 0) return;
            
            this.processing++;
            const task = this.queue.shift();
            
            try {
                await task();
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn('Task failed:', error);
                }
            } finally {
                this.processing--;
                setTimeout(() => this.process(), 50);
            }
        }
    }
};

/* =======================
   RATE LIMITER
======================= */
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async wait() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const oldest = this.requests[0];
            const waitTime = this.timeWindow - (now - oldest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.wait();
        }
        
        this.requests.push(now);
    }
}

const apiLimiter = new RateLimiter(10, 1000);

/* =======================
   LOGGER
======================= */
const logger = {
    debug: (...args) => console.debug('[DEBUG]', ...args),
    info: (...args) => console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
};

/* =======================
   ELEMENTOS DOM
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
    progressContainer: $('progressContainer'),
    progressFill: $('progressFill'),
    progressText: $('progressText'),
    systemStatus: $('systemStatus'),
    statusText: document.querySelector('.status-text'),
    statusIcon: document.querySelector('.status-icon'),
    lenError: $('lenError'),
    amountError: $('amountError'),
    prefixError: $('prefixError')
};

/* =======================
   NOTIFICAÇÕES
======================= */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* =======================
   VALIDAÇÃO MELHORADA
======================= */
function validateInputs() {
    const min = +dom.min.value;
    const max = +dom.max.value;
    const amt = +dom.amt.value;
    const pre = dom.pre.value.trim();
    
    // Reset errors
    dom.lenError.style.display = 'none';
    dom.amountError.style.display = 'none';
    dom.prefixError.style.display = 'none';
    
    const errors = [];
    
    // Validação de tamanho
    if (isNaN(min) || isNaN(max) || min < 3 || max > 16) {
        dom.lenError.textContent = 'O tamanho deve ser entre 3 e 16.';
        dom.lenError.style.display = 'block';
        errors.push('Tamanho inválido');
    }
    
    if (min > max) {
        dom.lenError.textContent = 'O mínimo não pode ser maior que o máximo.';
        dom.lenError.style.display = 'block';
        errors.push('Tamanho mínimo maior que máximo');
    }
    
    // Validação de quantidade
    if (amt <= 0 || amt > 1000) {
        dom.amountError.textContent = 'Quantidade deve ser entre 1 e 1000.';
        dom.amountError.style.display = 'block';
        errors.push('Quantidade inválida');
    }
    
    // Validação de prefixo
    if (pre.length > 3) {
        dom.prefixError.textContent = 'Máximo 3 caracteres.';
        dom.prefixError.style.display = 'block';
        errors.push('Prefixo muito longo');
    }
    
    if (pre && !/^[a-zA-Z]*$/.test(pre)) {
        dom.prefixError.textContent = 'Somente letras são permitidas.';
        dom.prefixError.style.display = 'block';
        errors.push('Prefixo inválido');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
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
            signal: ctrl.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return res.status === 404 || res.status === 204;
    } catch {
        return false;
    } finally {
        clearTimeout(id);
    }
}

async function verifyNick(nick) {
    try {
        await apiLimiter.wait();
        
        const normalized = nick.toLowerCase();
        
        if (state.cache.has(normalized)) {
            return false;
        }
        
        const freeCrafatar = await checkImage(
            `https://crafatar.com/avatars/${normalized}?overlay&size=32`
        );

        if (!freeCrafatar) return false;

        const freeMojang = await checkFetch(
            `https://api.ashcon.app/mojang/v2/user/${normalized}`
        );

        return freeMojang;
    } catch (error) {
        logger.warn('Erro na verificação:', error);
        return false;
    }
}

/* =======================
   UI FUNCTIONS
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
        navigator.clipboard.writeText(nick).then(() => {
            e.target.textContent = 'Copiado!';
            e.target.style.borderColor = '#22c55e';
            e.target.style.color = '#22c55e';
            setTimeout(() => {
                e.target.textContent = 'Copiar';
                e.target.style.borderColor = '';
                e.target.style.color = '';
            }, 1000);
        }).catch(err => {
            console.error('Erro ao copiar:', err);
            showToast('Erro ao copiar para área de transferência', 'error');
        });
    };

    dom.list.prepend(li);
    if (dom.list.children.length > 200) {
        dom.list.lastChild.remove();
    }
    dom.copy.disabled = dom.save.disabled = false;
}

function updateProgress() {
    if (!state.running) {
        dom.progressContainer.style.display = 'none';
        dom.systemStatus.style.display = 'none';
        return;
    }
    
    dom.progressContainer.style.display = 'block';
    dom.systemStatus.style.display = 'flex';
    
    const progress = state.target > 0 ? (state.found / state.target) * 100 : 0;
    dom.progressFill.style.width = `${progress}%`;
    dom.progressText.textContent = `${state.found}/${state.target} encontrados`;
    
    if (dom.statusText && dom.statusIcon) {
        if (state.active > 0) {
            dom.statusText.textContent = `Verificando ${state.active} nicks...`;
            dom.statusIcon.textContent = '⚡';
        } else {
            dom.statusText.textContent = 'Aguardando...';
            dom.statusIcon.textContent = '⏳';
        }
    }
}

/* =======================
   ENGINE LOOP
======================= */
async function engineLoop() {
    state.requestQueue.maxConcurrent = dom.turbo.checked ? 15 : 8;
    
    while (state.running && state.found < state.target) {
        if (state.requestQueue.processing >= state.requestQueue.maxConcurrent) {
            await new Promise(r => setTimeout(r, 50));
            continue;
        }
        
        const task = async () => {
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
                return;
            }
            
            state.cache.add(nick);
            if (state.cache.size > 10000) {
                state.cache.clear();
            }
            
            const free = await verifyNick(nick);
            
            if (state.abortController.signal.aborted) {
                return;
            }
            
            state.attempts++;
            
            if (free && state.running && state.found < state.target) {
                state.found++;
                uiAdd(nick);
            }
        };
        
        state.requestQueue.queue.push(task);
        state.requestQueue.process();
        
        await new Promise(r => setTimeout(r, 10));
    }
    
    // Aguardar conclusão de todas as tarefas
    const waitForCompletion = setInterval(() => {
        if (!state.running || (state.requestQueue.processing === 0 && state.requestQueue.queue.length === 0)) {
            clearInterval(waitForCompletion);
            if (!state.running) {
                toggle(false);
            }
        }
    }, 300);
}

/* =======================
   STATS LOOP
======================= */
function statsLoop() {
    if (!state.running) {
        updateProgress();
        return;
    }
    
    const t = (Date.now() - state.startTs) / 1000;
    dom.rate.textContent = Math.floor(state.attempts / (t || 1));
    dom.count.textContent = `${state.found} / ${state.target}`;
    updateProgress();
    
    if (state.running) {
        requestAnimationFrame(statsLoop);
    }
}

/* =======================
   CONTROLES
======================= */
function toggle(on) {
    if (state.running === on) return;

    if (on) {
        const validation = validateInputs();
        if (!validation.valid) {
            showToast('Corrija os erros antes de iniciar', 'error');
            return;
        }
        
        state.running = true;
        state.found = 0;
        state.attempts = 0;
        state.active = 0;
        state.target = +dom.amt.value;
        state.startTs = Date.now();
        state.cache.clear();
        state.abortController = new AbortController();
        state.requestQueue.queue = [];
        state.requestQueue.processing = 0;
        
        dom.list.innerHTML = '';
        dom.start.style.display = 'none';
        dom.stop.style.display = 'block';
        dom.copy.disabled = true;
        dom.save.disabled = true;
        
        showToast('Busca iniciada', 'info');
        engineLoop();
        statsLoop();
    } else {
        state.running = false;
        state.abortController.abort();
        state.requestQueue.queue = [];
        
        dom.start.style.display = 'block';
        dom.stop.style.display = 'none';
        
        updateProgress();
        
        if (state.found > 0) {
            showToast(`Busca finalizada. ${state.found} nicks encontrados.`, 'info');
        }
    }
}

/* =======================
   EVENT LISTENERS
======================= */
dom.start.onclick = () => toggle(true);
dom.stop.onclick = () => toggle(false);

dom.copy.onclick = () => {
    const nicks = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent)
        .join('\n');
    
    if (!nicks) {
        showToast('Nenhum nick para copiar', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(nicks).then(() => {
        showToast('Lista copiada para área de transferência', 'success');
    }).catch(err => {
        console.error('Erro ao copiar:', err);
        showToast('Erro ao copiar', 'error');
    });
};

dom.save.onclick = () => {
    const nicks = [...dom.list.querySelectorAll('.nick-text')]
        .map(e => e.textContent)
        .join('\n');
    
    if (!nicks) {
        showToast('Nenhum nick para baixar', 'warning');
        return;
    }
    
    try {
        const blob = new Blob([nicks], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nicks_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Arquivo baixado com sucesso', 'success');
    } catch (error) {
        console.error('Erro ao baixar:', error);
        showToast('Erro ao baixar arquivo', 'error');
    }
};

/* =======================
   INPUT VALIDATION EVENTS
======================= */
function setupInputValidation() {
    const validateDebounced = debounce(() => {
        validateInputs();
    }, 300);
    
    dom.min.addEventListener('input', validateDebounced);
    dom.max.addEventListener('input', validateDebounced);
    dom.amt.addEventListener('input', validateDebounced);
    dom.pre.addEventListener('input', validateDebounced);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/* =======================
   ERROR HANDLING
======================= */
window.addEventListener('unhandledrejection', event => {
    logger.error('Promise rejeitada não tratada:', event.reason);
    if (state.running) {
        showToast('Erro na execução. Reinicie a busca.', 'error');
    }
});

window.addEventListener('error', event => {
    logger.error('Erro global:', event.error);
    showToast('Erro inesperado ocorreu', 'error');
});

/* =======================
   INICIALIZAÇÃO
======================= */
document.addEventListener('DOMContentLoaded', () => {
    setupInputValidation();
    updateProgress();
    
    showToast('Aplicativo carregado. Configure e inicie a busca.', 'info');
    
    logger.info('Aplicativo inicializado');
});
