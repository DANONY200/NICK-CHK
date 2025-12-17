const $ = id => document.getElementById(id);

/* =======================
   ESTADO CENTRAL OTIMIZADO
======================= */
const state = {
    running: false,
    found: 0,
    attempts: 0,
    target: 0,
    startTs: 0,
    active: 0,
    cache: new Set(),
    queue: [],
    currentBatch: [],
    controller: null,
    statsInterval: null
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
    progressFill: $('progressFill'),
    progressText: $('progressText'),
    copyCount: $('#copyCount'),
    downloadCount: $('#downloadCount')
};

/* =======================
   SISTEMA DE NOTIFICAÇÕES
======================= */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
}

/* =======================
   VALIDAÇÃO COM FEEDBACK
======================= */
function validateInputs() {
    const min = +dom.min.value;
    const max = +dom.max.value;
    const amt = +dom.amt.value;
    const pre = dom.pre.value.trim();
    
    const errors = [];
    
    if (isNaN(min) || isNaN(max) || min < 3 || max > 16) {
        errors.push('Tamanho deve ser entre 3 e 16');
    }
    
    if (min > max) {
        errors.push('Tamanho mínimo não pode ser maior que o máximo');
    }
    
    if (amt <= 0 || amt > 10000) {
        errors.push('Quantidade deve ser entre 1 e 10000');
    }
    
    if (pre.length > 3) {
        errors.push('Prefixo pode ter no máximo 3 caracteres');
    }
    
    if (pre && !/^[a-zA-Z]*$/.test(pre)) {
        errors.push('Prefixo só pode conter letras');
    }
    
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        return false;
    }
    
    return true;
}

/* =======================
   GERAÇÃO DE NICKS OTIMIZADA
======================= */
const chars = {
    v: 'aeiou',
    c: 'bcdfghjklmnpqrstvwxyz',
    a: 'abcdefghijklmnopqrstuvwxyz',
    n: '0123456789'
};

// Arrays pré-calculados para performance
const charArrays = {
    v: chars.v.split(''),
    c: chars.c.split(''),
    a: chars.a.split(''),
    n: chars.n.split(''),
    mixed: (chars.a + chars.n).split('')
};

function getRandomChar(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function makeNick(min, max, type, pre, useUnd) {
    const len = min + Math.floor(Math.random() * (max - min + 1));
    let nick = pre.toLowerCase();
    
    if (nick.length >= len) {
        return nick.slice(0, len);
    }
    
    let remaining = len - nick.length;
    
    switch(type) {
        case 'pronounce':
            let isVowel = nick.length ? 
                !chars.v.includes(nick.slice(-1)) : 
                Math.random() > 0.5;
            
            for (let i = 0; i < remaining; i++) {
                nick += isVowel ? 
                    getRandomChar(charArrays.v) : 
                    getRandomChar(charArrays.c);
                isVowel = !isVowel;
            }
            break;
            
        case 'num_suffix':
            for (let i = 0; i < remaining - 1; i++) {
                nick += getRandomChar(charArrays.n);
            }
            nick += getRandomChar(charArrays.a);
            break;
            
        default:
            const pool = type === 'mixed' ? charArrays.mixed : charArrays.a;
            for (let i = 0; i < remaining; i++) {
                nick += getRandomChar(pool);
            }
    }
    
    if (useUnd && nick.length > 3 && !nick.includes('_') && Math.random() > 0.65) {
        const pos = Math.floor(Math.random() * (nick.length - 2)) + 1;
        nick = nick.slice(0, pos) + '_' + nick.slice(pos);
    }
    
    return nick.toLowerCase();
}

/* =======================
   VERIFICAÇÃO MULTI-API CONCORRENTE
======================= */
function checkWithTimeout(url, timeout = 1500, method = 'image') {
    return new Promise(resolve => {
        if (method === 'image') {
            const img = new Image();
            let done = false;
            
            const finish = (result) => {
                if (!done) {
                    done = true;
                    img.src = '';
                    clearTimeout(timer);
                    resolve(result);
                }
            };
            
            img.onload = () => finish(false);
            img.onerror = () => finish(true);
            img.src = `${url}?t=${Date.now()}`;
            
            const timer = setTimeout(() => finish(false), timeout);
        } else {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            
            fetch(url, { 
                signal: controller.signal,
                cache: 'no-store'
            })
            .then(response => {
                clearTimeout(timer);
                resolve(response.status === 404 || response.status === 204);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(false);
            });
        }
    });
}

async function verifyNickConcurrently(nick) {
    const normalized = nick.toLowerCase();
    
    // Verificação rápida de cache
    if (state.cache.has(normalized)) {
        return false;
    }
    
    // URLs para verificação concorrente
    const urls = [
        `https://crafatar.com/avatars/${normalized}?overlay&size=32`,
        `https://minotar.net/helm/${normalized}/32.png`,
        `https://api.ashcon.app/mojang/v2/user/${normalized}`
    ];
    
    // Executar todas as verificações simultaneamente
    const promises = [
        checkWithTimeout(urls[0], 1200, 'image'),
        checkWithTimeout(urls[1], 1200, 'image'),
        checkWithTimeout(urls[2], 2000, 'fetch')
    ];
    
    try {
        const results = await Promise.all(promises);
        
        // Para ser considerado livre, deve passar em pelo menos 2 das 3 verificações
        const freeCount = results.filter(Boolean).length;
        
        if (freeCount >= 2) {
            // Verificação final com timeout mais curto
            const finalCheck = await checkWithTimeout(
                `https://api.mojang.com/users/profiles/minecraft/${normalized}`,
                1500,
                'fetch'
            );
            
            return finalCheck;
        }
        
        return false;
    } catch (error) {
        console.warn('Erro na verificação:', error);
        return false;
    } finally {
        state.cache.add(normalized);
        
        // Limpar cache se ficar muito grande
        if (state.cache.size > 100000) {
            const array = Array.from(state.cache);
            state.cache = new Set(array.slice(-50000));
        }
    }
}

/* =======================
   SISTEMA DE FILA DE TRABALHO
======================= */
class WorkQueue {
    constructor(maxConcurrent = 20) {
        this.maxConcurrent = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }
    
    add(task) {
        this.queue.push(task);
        this.process();
    }
    
    async process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        
        this.running++;
        const task = this.queue.shift();
        
        try {
            await task();
        } catch (error) {
            // Ignorar erros silenciosamente
        } finally {
            this.running--;
            setTimeout(() => this.process(), 10);
        }
    }
    
    clear() {
        this.queue = [];
        this.running = 0;
    }
    
    get pending() {
        return this.queue.length;
    }
}

// Inicializar fila de trabalho
const workQueue = new WorkQueue(dom.turbo.checked ? 40 : 20);

/* =======================
   UI FUNCTIONS OTIMIZADAS
======================= */
function uiAdd(nick) {
    const li = document.createElement('li');
    li.className = 'nick-item';
    
    const id = `nick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    li.innerHTML = `
        <div>
            <span class="nick-text">${nick}</span>
            <span class="api-tag">✓ VERIFICADO</span>
        </div>
        <button class="copy-btn" data-nick="${nick}" data-id="${id}">Copiar</button>
    `;
    
    // Adicionar evento de clique uma vez
    li.querySelector('.copy-btn').addEventListener('click', function(e) {
        const btn = e.target;
        const nickToCopy = btn.getAttribute('data-nick');
        
        navigator.clipboard.writeText(nickToCopy)
            .then(() => {
                const originalText = btn.textContent;
                btn.textContent = '✓ Copiado';
                btn.style.borderColor = '#22c55e';
                btn.style.color = '#22c55e';
                
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.borderColor = '';
                    btn.style.color = '';
                }, 1500);
            })
            .catch(err => {
                console.error('Erro ao copiar:', err);
                btn.textContent = '❌ Erro';
                setTimeout(() => btn.textContent = 'Copiar', 1500);
            });
    });
    
    dom.list.prepend(li);
    
    // Limitar lista a 500 itens
    if (dom.list.children.length > 500) {
        dom.list.removeChild(dom.list.lastChild);
    }
    
    // Atualizar contadores
    updateCounters();
}

function updateCounters() {
    const count = state.found;
    dom.copyCount.textContent = `(${count})`;
    dom.downloadCount.textContent = `(${count})`;
    dom.copy.disabled = count === 0;
    dom.save.disabled = count === 0;
}

function updateProgress() {
    if (!state.running) {
        dom.progressFill.style.width = '0%';
        dom.progressText.textContent = 'Pronto para iniciar';
        return;
    }
    
    const progress = state.target > 0 ? (state.found / state.target) * 100 : 0;
    dom.progressFill.style.width = `${progress}%`;
    dom.progressText.textContent = `${state.found}/${state.target} encontrados (${Math.round(progress)}%)`;
}

/* =======================
   ENGINE PRINCIPAL OTIMIZADO
======================= */
async function generateNickBatch(batchSize = 50) {
    const batch = [];
    const min = +dom.min.value;
    const max = +dom.max.value;
    const type = dom.algo.value;
    const pre = dom.pre.value.trim();
    const und = dom.und.checked;
    
    for (let i = 0; i < batchSize; i++) {
        let nick;
        let attempts = 0;
        
        do {
            nick = makeNick(min, max, type, pre, und);
            attempts++;
        } while (state.cache.has(nick) && attempts < 10);
        
        if (attempts < 10) {
            batch.push(nick);
            state.cache.add(nick);
        }
    }
    
    return batch;
}

async function processBatch(batch) {
    for (const nick of batch) {
        if (!state.running || state.found >= state.target) {
            break;
        }
        
        workQueue.add(async () => {
            try {
                const isFree = await verifyNickConcurrently(nick);
                state.attempts++;
                
                if (isFree && state.running && state.found < state.target) {
                    state.found++;
                    requestAnimationFrame(() => uiAdd(nick));
                }
            } catch (error) {
                // Ignorar erro e continuar
            }
        });
    }
}

async function engineMainLoop() {
    while (state.running && state.found < state.target) {
        // Gerar batch de nicks
        const batchSize = dom.turbo.checked ? 100 : 50;
        const batch = await generateNickBatch(batchSize);
        
        // Processar batch
        await processBatch(batch);
        
        // Pequena pausa para não sobrecarregar
        if (workQueue.pending > 100) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    // Aguardar conclusão de todas as tarefas
    await waitForCompletion();
}

async function waitForCompletion() {
    return new Promise(resolve => {
        const check = setInterval(() => {
            if (workQueue.pending === 0 && workQueue.running === 0) {
                clearInterval(check);
                resolve();
            }
        }, 100);
    });
}

/* =======================
   SISTEMA DE STATS
======================= */
function startStatsTracker() {
    if (state.statsInterval) {
        clearInterval(state.statsInterval);
    }
    
    state.statsInterval = setInterval(() => {
        if (!state.running) {
            clearInterval(state.statsInterval);
            state.statsInterval = null;
            return;
        }
        
        const elapsed = (Date.now() - state.startTs) / 1000;
        const rate = elapsed > 0 ? Math.floor(state.attempts / elapsed) : 0;
        
        dom.rate.textContent = rate.toLocaleString();
        dom.count.textContent = `${state.found} / ${state.target}`;
        updateProgress();
    }, 500); // Atualizar a cada 500ms
}

/* =======================
   CONTROLES PRINCIPAIS
======================= */
function startSearch() {
    if (state.running) return;
    
    if (!validateInputs()) {
        return;
    }
    
    // Configurar estado
    state.running = true;
    state.found = 0;
    state.attempts = 0;
    state.target = +dom.amt.value;
    state.startTs = Date.now();
    state.cache.clear();
    state.controller = new AbortController();
    
    // Configurar fila de trabalho
    workQueue.maxConcurrent = dom.turbo.checked ? 40 : 20;
    workQueue.clear();
    
    // Limpar lista
    dom.list.innerHTML = '';
    updateCounters();
    updateProgress();
    
    // Atualizar UI
    dom.start.style.display = 'none';
    dom.stop.style.display = 'block';
    dom.copy.disabled = true;
    dom.save.disabled = true;
    
    // Iniciar processos
    startStatsTracker();
    engineMainLoop().then(() => {
        if (state.running) {
            stopSearch();
            showToast(`✅ Busca concluída! ${state.found} nicks encontrados.`, 'success');
        }
    }).catch(error => {
        console.error('Erro no motor:', error);
        stopSearch();
        showToast('❌ Erro durante a busca', 'error');
    });
}

function stopSearch() {
    if (!state.running) return;
    
    state.running = false;
    
    // Parar controller
    if (state.controller) {
        state.controller.abort();
    }
    
    // Parar stats
    if (state.statsInterval) {
        clearInterval(state.statsInterval);
        state.statsInterval = null;
    }
    
    // Limpar fila
    workQueue.clear();
    
    // Atualizar UI
    dom.start.style.display = 'block';
    dom.stop.style.display = 'none';
    updateProgress();
    
    if (state.found > 0) {
        showToast(`Busca interrompida. ${state.found} nicks encontrados.`, 'info');
    }
}

/* =======================
   EVENT LISTENERS
======================= */
dom.start.addEventListener('click', startSearch);
dom.stop.addEventListener('click', stopSearch);

dom.copy.addEventListener('click', () => {
    const nicks = Array.from(dom.list.querySelectorAll('.nick-text'))
        .map(el => el.textContent)
        .join('\n');
    
    if (!nicks) {
        showToast('Nenhum nick para copiar', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(nicks)
        .then(() => {
            showToast(`✅ ${state.found} nicks copiados!`, 'success');
            dom.copy.textContent = '✓ Copiado!';
            setTimeout(() => {
                dom.copy.textContent = '📋 Copiar Lista';
            }, 2000);
        })
        .catch(err => {
            console.error('Erro ao copiar:', err);
            showToast('❌ Erro ao copiar', 'error');
        });
});

dom.save.addEventListener('click', () => {
    const nicks = Array.from(dom.list.querySelectorAll('.nick-text'))
        .map(el => el.textContent)
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
        a.download = `nicks_${Date.now()}_${state.found}_encontrados.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`✅ Arquivo baixado com ${state.found} nicks!`, 'success');
        dom.save.textContent = '✓ Baixado!';
        setTimeout(() => {
            dom.save.textContent = '💾 Baixar .txt';
        }, 2000);
    } catch (error) {
        console.error('Erro ao baixar:', error);
        showToast('❌ Erro ao baixar arquivo', 'error');
    }
});

// Atualizar contadores em tempo real
dom.turbo.addEventListener('change', () => {
    if (state.running) {
        workQueue.maxConcurrent = dom.turbo.checked ? 40 : 20;
    }
});

// Prevenir comportamento padrão do formulário
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.running) {
        e.preventDefault();
    }
});

// Inicialização
window.addEventListener('load', () => {
    updateProgress();
    updateCounters();
    showToast('✅ MC Nick Checker v7 carregado!', 'success', 2000);
    
    // Pré-aquecer cache
    for (let i = 0; i < 1000; i++) {
        state.cache.add(Math.random().toString(36).substring(2, 10));
    }
})
