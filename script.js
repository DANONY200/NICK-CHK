const $ = id => document.getElementById(id);

/* =======================
   ESTADO
======================= */
const state = {
  running:false,
  found:0,
  attempts:0,
  target:0,
  active:0,
  cache:new Set(),
  startTs:0
};

/* =======================
   DOM
======================= */
const dom = {
  start:$('btnStart'),
  stop:$('btnStop'),
  list:$('list'),
  min:$('lenMin'),
  max:$('lenMax'),
  amt:$('amount'),
  pre:$('prefix'),
  algo:$('algo'),
  und:$('underscore'),
  turbo:$('turbo')
};

/* =======================
   UTIL
======================= */
const chars = {
  v:'aeiou',
  c:'bcdfghjklmnpqrstvwxyz',
  a:'abcdefghijklmnopqrstuvwxyz',
  n:'0123456789'
};

const rnd = s => s[Math.floor(Math.random()*s.length)];
const normalize = s => s.toLowerCase().trim();

/* =======================
   GERADOR
======================= */
function makeNick(min,max,type,pre,useUnd){
  const len = Math.floor(Math.random()*(max-min+1))+min;
  let nick = normalize(pre);

  let rem = len - nick.length;
  if(rem <= 0) return nick.slice(0,len);

  if(type === 'pronounce'){
    let vowel = Math.random() > 0.5;
    while(rem--){
      nick += rnd(vowel ? chars.v : chars.c);
      vowel = !vowel;
    }
  }
  else if(type === 'num_suffix'){
    while(rem-- > 1) nick += rnd(chars.n);
    nick += rnd(chars.a);
  }
  else{
    let pool = chars.a + (type === 'mixed' ? chars.n : '');
    while(rem--) nick += rnd(pool);
  }

  if(useUnd && nick.length > 3 && !nick.includes('_') && Math.random() > .65){
    const i = Math.floor(Math.random()*(nick.length-2))+1;
    nick = nick.slice(0,i)+'_'+nick.slice(i);
  }

  return nick;
}

/* =======================
   VERIFICAÇÃO
======================= */
function checkImage(url,timeout=2000){
  return new Promise(res=>{
    const img=new Image();
    let done=false;
    const finish=r=>{ if(!done){done=true;res(r);} };
    img.onload=()=>finish(false);
    img.onerror=()=>finish(true);
    img.src=`${url}&t=${Date.now()}`;
    setTimeout(()=>finish(false),timeout);
  });
}

async function checkFetch(url,timeout=1500){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{signal:ctrl.signal,cache:'no-store'});
    return r.status===404;
  }catch{return false}
  finally{clearTimeout(id)}
}

async function verifyNick(nick){
  const n = normalize(nick);
  const free = await checkImage(`https://crafatar.com/avatars/${n}?overlay&size=32`);
  if(!free) return false;
  return checkFetch(`https://api.ashcon.app/mojang/v2/user/${n}`);
}

/* =======================
   UI
======================= */
function uiAdd(nick){
  const li=document.createElement('li');
  li.className='nick-item';

  const span=document.createElement('span');
  span.className='nick-text';
  span.textContent=nick;

  const btn=document.createElement('button');
  btn.className='copy-btn';
  btn.textContent='Copiar';
  btn.onclick=()=>{
    navigator.clipboard.writeText(nick);
    btn.textContent='OK';
    setTimeout(()=>btn.textContent='Copiar',800);
  };

  li.append(span,btn);
  dom.list.prepend(li);
}

/* =======================
   ENGINE
======================= */
async function loop(){
  const maxConc = dom.turbo.checked ? 35 : 15;

  while(state.running && state.found < state.target){
    if(state.active >= maxConc){
      await new Promise(r=>setTimeout(r,30));
      continue;
    }

    let nick,tries=0;
    do{
      nick = makeNick(+dom.min.value,+dom.max.value,dom.algo.value,dom.pre.value,dom.und.checked);
      tries++;
    }while(state.cache.has(nick)&&tries<50);

    state.cache.add(nick);
    state.active++;

    verifyNick(nick).then(ok=>{
      state.attempts++;
      if(ok && state.running){
        state.found++;
        uiAdd(nick);
      }
    }).finally(()=>state.active--);
  }

  dom.start.style.display='block';
  dom.stop.style.display='none';
}

/* =======================
   CONTROLES
======================= */
dom.start.onclick=()=>{
  state.running=true;
  state.found=0;
  state.attempts=0;
  state.cache.clear();
  state.target=+dom.amt.value;
  dom.list.innerHTML='';
  dom.start.style.display='none';
  dom.stop.style.display='block';
  loop();
};

dom.stop.onclick=()=>{
  state.running=false;
};
