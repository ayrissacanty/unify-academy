<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="look.js"></script>

<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>UNIFY Parent View</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&display=swap" media="print" onload="this.media='all'">
<style>
:root{--sheet:#EADFCB;--kraft:#F3E7CF;--edge:#C9B28A;--ink:#4A3B3F;--soft:#8A7A70;--acc:#E07A66;--blue:#4F91C7;--ui:"Fredoka","Trebuchet MS",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--sheet);color:var(--ink);font:16px/1.4 var(--ui);padding:max(16px,env(safe-area-inset-top)) 16px 32px}
main{max-width:640px;margin:0 auto}h1{font-size:24px;margin:0 0 2px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.6px;color:var(--soft);margin:22px 0 8px}
.sub{color:var(--soft);font-size:14px}.card{background:var(--kraft);border-radius:14px;padding:10px 12px;margin-bottom:8px;box-shadow:0 2px 0 var(--edge);border-left:7px solid var(--edge)}
.card b{display:block}.card small{color:var(--soft)}.done{opacity:.6;text-decoration:line-through}.chip{display:inline-block;background:#fff8;border-radius:99px;padding:1px 9px;font-size:12px}
.live-h{display:flex;align-items:center;gap:10px}.bub{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:19px;flex:none;position:relative}
.dot{display:none;width:11px;height:11px;border-radius:50%;background:var(--acc);flex:none}.dot.on{display:inline-block}.th{background:#fff8;border-radius:12px;margin-top:8px;overflow:hidden}.th>.top{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font:inherit;width:100%;border:0;background:none;text-align:left;color:inherit}
.th .pv{flex:1;min-width:0}.th .pv span{display:block;font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{font-size:11px;background:var(--blue);color:#fff;border-radius:99px;padding:1px 8px}
.log{display:none;padding:4px 10px 10px;max-height:340px;overflow:auto}.th.open .log{display:block}.m{margin-top:6px;padding:5px 9px;border-radius:10px;background:#fff;font-size:14px;overflow-wrap:anywhere}.m small{display:block;color:var(--soft);font-size:11px}.m.hl{animation:hl 2.5s ease-out}
@keyframes hl{from{background:#ffe9a8}to{background:#fff}}#live input{font:inherit;font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--edge);width:100%;margin-bottom:6px}#live button.go{font:inherit;padding:8px 14px;border-radius:11px;border:0;background:var(--acc);color:#fff;cursor:pointer}
.note{background:#fff8;border-radius:12px;padding:10px 12px;font-size:14px;margin-top:20px}.err{background:#f6d6d0;border-radius:12px;padding:12px}
</style>
</head>
<body>
<main id="m"><h1>UNIFY Parent View</h1><p class="sub">Loading…</p></main>
<section id="live" tabindex="-1" style="max-width:640px;margin:0 auto;outline:none"></section>
<script src="supabase-config.js"></script>
<script src="supabase-client.js"></script>
<script src="demo/dist/weekly.js"></script>
<script type="module">
const $=document.getElementById('m'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c]));
const hm=m=>{const h=Math.floor(m/60)%24,mm=m%60;return`${h%12||12}:${String(mm).padStart(2,'0')} ${h<12?'AM':'PM'}`;};
const SC={math:'#4F91C7',ela:'#88B89A',science:'#5E9C72',history:'#C98569',careers:'#E8A33D',life:'#7CB6A0'};
const SUBJ=[{k:'math',n:'Math',t:'Mr. Tanaka',c:'#4F91C7'},{k:'ela',n:'ELA',t:'Ms. Ayrissa',c:'#88B89A'},{k:'science',n:'Science',t:'Ms. Okafor',c:'#5E9C72'},{k:'history',n:'History',t:"Mr. O'Brien",c:'#C98569'},{k:'careers',n:'CarryingCareers',t:'Mr. Haddad',c:'#E8A33D'},{k:'life',n:'Life Lessons',t:'Dr. Larsen',c:'#7CB6A0'}];
const fail=t=>{$.innerHTML=`<h1>UNIFY Parent View</h1><div class="err">${esc(t)}</div>`;};
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}};
function paint(d,local){
  const hw=[...(d.homework||[])].sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||0)-(b.due||0)),dt=t=>new Date(t).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  $.innerHTML=`<h1>${esc(d.name||'Student')}</h1><p class="sub">${local?'On this device. ':''}Updated ${esc(dt(d.updated))}. Read only: homework, today's schedule and the next two weeks.</p>
  <h2>Homework</h2>${hw.length?hw.map(h=>`<div class="card" style="border-left-color:${SC[h.s]||'#C9B28A'}"><b class="${h.done?'done':''}">${esc(h.text)}</b><small>${h.done?'Done':(h.due<Date.now()?'Overdue · ':'Due ')+esc(dt(h.due))}</small></div>`).join(''):'<p class="sub">Nothing assigned yet. When class ends, the homework shows up here and on the phone.</p>'}
  <h2>Today's schedule</h2>${(d.schedule||[]).map(s=>`<div class="card" style="border-left-color:${esc(s.c||'#C9B28A')}"><b>${esc(s.n)}</b><small>${hm(s.s)} – ${hm(s.e)}${s.sub?' · '+esc(s.sub):''}</small></div>`).join('')||'<p class="sub">No classes picked yet.</p>'}
  <h2>Coming up</h2>${d.events&&d.events.length?d.events.sort((a,b)=>((a.date||'')+(a.time||'')).localeCompare((b.date||'')+(b.time||''))).map(e=>`<div class="card" style="border-left-color:${SC[e.s]||'#C9B28A'}"><b>${esc(e.title)}</b><small>${esc(new Date(e.date+'T12:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}))}${e.time?' · '+hm(+e.time.slice(0,2)*60+ +e.time.slice(3)):''}</small></div>`).join(''):'<p class="sub">No events in the next two weeks.</p>'}
  <p class="note">${local?'This page reads homework saved on this device. Messages stay on the phone.':'Messages and anything else on the phone are never shared. Your child can stop sharing at any time from Settings.'}</p>`;
}
function localSnap(){
  const settings=read('flip.settings')||{}, social=read('unify.social.v1'), prog=read('unify.progress.v1')||{};
  const name=(settings.name&&settings.name!=='You')?settings.name:(social&&social.profile&&social.profile.name)||'Student';
  const rawHw=read('flip.homework');
  const HW=(Array.isArray(rawHw)?rawHw:[]).filter(h=>h&&typeof h.text==='string').map(h=>({s:h.s||'',text:h.text,due:h.due||0,done:!!h.done}));
  const n=new Date(),key=ymd(n),day=(prog.days||{})[key]||{};
  const pk=Object.keys(day).map(x=>({k:x.replace('-extra',''),x:x.indexOf('-extra')>0,min:day[x].min})).sort((a,b)=>a.min-b.min);
  const schedule=pk.length?pk.map(p=>{const sj=SUBJ.find(x=>x.k===p.k)||SUBJ[0];return{n:(p.x?'Extra lesson: ':'Class: ')+sj.n,s:p.min,e:p.min+50,sub:sj.t+' · '+sj.n,c:sj.c};}):[{n:"Walk into a class to start today's lesson",s:9*60,e:9*60+50,sub:'Homework is assigned when the lesson ends',c:'#C9B28A'}];
  const today=key,lim=ymd(new Date(Date.now()+14*864e5));
  const rawEv=read('flip.events');
  const events=(Array.isArray(rawEv)?rawEv:[]).filter(e=>e&&e.date>=today&&e.date<=lim).map(e=>({title:e.title,date:e.date,time:e.time||'',s:e.s||''}));
  return{name,updated:Date.now(),homework:HW,schedule,events};
}
const code=(new URLSearchParams(location.search).get('code')||'').trim().toUpperCase();
if(!code){paint(localSnap(),true);addEventListener('storage',e=>{if(!e.key||e.key==='flip.homework'||e.key==='flip.events'||e.key==='unify.progress.v1'||e.key==='flip.settings')paint(localSnap(),true);});}
else if(!/^[A-Z0-9]{8,16}$/.test(code))fail('This link is missing its code. Ask your child to share it again from Settings on their phone.');
else try{
 let shareJson=null;
 if(window.__SUPABASE){const r=await fetch(window.__SUPABASE.url+'/rest/v1/rpc/get_share',{method:'POST',headers:{apikey:window.__SUPABASE.key,Authorization:'Bearer '+window.__SUPABASE.key,'Content-Type':'application/json'},body:JSON.stringify({p_code:code})});if(!r.ok)throw new Error('share lookup failed');const rows=await r.json();shareJson=rows&&rows[0]?rows[0].data:null;}
 if(!shareJson)fail('This link has stopped working. Ask your child to share it again from Settings on their phone.');
 else paint(JSON.parse(shareJson),false);
}catch(e){fail('Could not load this page. Check your connection and try again.');}
</script>
<script type="module">
const L=document.getElementById('live'),qs=new URLSearchParams(location.search),wantLive=qs.get('live')==='1';
if(wantLive&&!qs.get('code'))document.getElementById('m').hidden=true;
const el=(t,c,p,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;if(p)p.appendChild(e);return e;};
const gname=g=>g==null?'':g===0?'Kindergarten':'Grade '+g;
const tfmt=t=>{const d=new Date(+t);return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
el('h2','',L,'Live chats');
el('p','sub',L,"Live view: you can always see your children's chats. Nothing here can be changed or deleted.");
const mailNote=el('div','note',L);mailNote.style.marginTop='8px';el('span','',mailNote,'Mail is overseen in the Mail app ("Family mail" tab). ');el('button','go',mailNote,'Open Mail').onclick=()=>{location.href='mail.html';};
mailNote.lastChild.className='go';mailNote.lastChild.style.cssText='font:inherit;padding:4px 12px;border-radius:11px;border:0;background:var(--blue);color:#fff;cursor:pointer';
const body=el('div','',L);
const say=(t)=>{body.textContent='';el('p','sub',body,t);};
const focusLive=()=>{if(wantLive){L.scrollIntoView();L.focus({preventScroll:true});}};
const missing=e=>/42P01|PGRST205|PGRST200|does not exist|Could not find|relation/i.test((e&&(e.code+' '+e.message))||'');
let c=null,timer=null,chan=null;
async function start(){
 if(timer){clearInterval(timer);timer=null;}
 if(chan&&c){try{c.removeChannel(chan);}catch(e){}chan=null;}
 if(!window.__SUPABASE||!window.__supa){say("Sign in with your family account to see your children's chats and mail. (Accounts aren't set up on this page.)");focusLive();return;}
 let session=null;
 try{c=await window.__supa();session=(await c.auth.getSession()).data.session;}catch(e){say("Sign in with your family account to see your children's chats and mail. (Can't reach the service right now.)");focusLive();return;}
 const u=session&&session.user,ok=u&&!u.is_anonymous&&!/@unify\.mail$/i.test(u.email||'');
 if(!ok){signIn(u&&!u.is_anonymous?"That is a student sign-in. Parents sign in with the family account.":"");focusLive();return;}
 await view(u.id);focusLive();
}
function signIn(extra){
 body.textContent='';if(extra)el('p','sub',body,extra);
 el('p','sub',body,"Sign in with your family account to see your children's chats and mail.");
 const em=el('input','',body);em.type='email';em.placeholder='Parent email';em.autocomplete='email';
 const pw=el('input','',body);pw.type='password';pw.placeholder='Password';pw.autocomplete='current-password';
 const er=el('div','sub',body);er.style.color='#a8322a';const go=el('button','go',body,'Sign in');
 const run=async()=>{er.textContent='';go.disabled=true;try{const r=await c.auth.signInWithPassword({email:em.value.trim(),password:pw.value});if(r.error)throw r.error;await start();return;}catch(e){er.textContent=/invalid/i.test(e&&e.message||'')?'Wrong email or password.':'Could not sign in. Check your connection and try again.';}go.disabled=false;};
 go.onclick=run;pw.onkeydown=e=>{if(e.key==='Enter')run();};
}
async function view(uid){
 body.textContent='';el('p','sub',body,'Loading…');
 let kids=[],threads=[];
 try{
  let r=await c.from('kids').select('id,name,icon,color,grade,login_email').order('created');
  if(r.error)r=await c.from('kids').select('id,name,icon,color').order('created');
  if(r.error)throw r.error;kids=r.data||[];
  const t=await c.from('net_threads').select('*').contains('owners',[uid]);if(t.error)throw t.error;threads=t.data||[];
 }catch(e){say(missing(e)?"Live chats aren't switched on yet. Ask the school owner to apply the latest update.":"Couldn't load the chats right now. Check your connection and reload.");return;}
 const byTid={},msgs={},seen=new Set(),users={},cards={};let last=0,ready=false;
 body.textContent='';
 const empty=el('p','sub',body,'');
 const kidOf=nid=>kids.find(k=>uid+'_'+k.id===nid);
 const cardFor=(k)=>{
  const key=k?k.id:'_me';if(cards[key])return cards[key];
  const d=el('div','card',body);d.style.borderLeftColor=(k&&k.color)||'#C9B28A';
  const h=el('div','live-h',d);const b=el('span','bub',h,k?(k.icon||k.name.slice(0,1).toUpperCase()):'👪');b.style.background=(k&&k.color)||'#8A7A70';
  const nb=el('div','',h);nb.style.flex='1';el('b','',nb,k?k.name:'Your own chats');el('small','',nb,k?[gname(k.grade),k.login_email?'own sign-in':''].filter(Boolean).join(' · '):'');
  const dot=el('span','dot',h);dot.title='New messages';const list=el('div','',d);
  return cards[key]={d,dot,list,n:0};
 };
 kids.forEach(k=>cardFor(k));
 kids.forEach(k=>week(uid,k,cardFor(k)));
  const week=async(fam,k,cd)=>{
  try{
   const r=await c.from('kid_data').select('key,json').eq('family',fam).eq('kid',k.id).in('key',['unify.progress.v1','unify.quests.v1','unify.pet.v1','unify.dormrewards.v1']);
   if(r.error||!window.__weekly)return;const m={};(r.data||[]).forEach(x=>m[x.key]=x.json);
   if(!Object.keys(m).length)return;
   const w=window.__weekly.weekly({progress:m['unify.progress.v1'],quests:m['unify.quests.v1'],pet:m['unify.pet.v1'],rewards:m['unify.dormrewards.v1']});
   const b=document.createElement('div');b.className='week';b.style.cssText='margin:8px 0 6px;padding:8px 10px;border-radius:10px;background:#FFF6EA;font-size:13px;line-height:1.45';
   const h=document.createElement('b');h.textContent='This week';b.appendChild(h);
   w.lines.forEach(t=>{const p=document.createElement('div');p.textContent='• '+t;b.appendChild(p);});
   cd.d.insertBefore(b,cd.list);
  }catch(e){/* the summary is a bonus; chats keep working without it */}
 };
 const nameOf=id=>(users[id]&&users[id].name)||id;
 const bubble=(t,m,fresh)=>{const b=el('div','m'+(fresh?' hl':''),t.log);el('small','',b,nameOf(m.from_id)+' · '+tfmt(m.at));el('span','',b,m.text);if(fresh)setTimeout(()=>b.classList.remove('hl'),2600);t.log.scrollTop=t.log.scrollHeight;};
 const prev=t=>{const a=msgs[t.tid]||[],m=a[a.length-1];t.pv.textContent=m?(nameOf(m.from_id)+': '+m.text):'No messages yet';t.tm.textContent=m?tfmt(m.at):'';};
 const buildThread=th=>{
  const mine=kidOf(th.a)||kidOf(th.b),k=kidOf(th.a)||kidOf(th.b),otherId=kidOf(th.a)?th.b:th.a,o=users[otherId]||{};
  const cd=cardFor(k||null),t={tid:th.tid,cd,unread:false};
  t.el=el('div','th',cd.list);const top=el('button','top',t.el);top.type='button';
  const pv=el('div','pv',top);const nm=el('b','',pv,(o.name||otherId)+(o.handle?' @'+o.handle:'')+(o.grade!=null?' · '+gname(o.grade):''));
  if((th.owners||[]).some(x=>x!==uid))el('span','badge',nm,'other family').style.marginLeft='6px';
  t.pv=el('span','',pv);t.tm=el('small','',top);t.dot=el('span','dot',top);t.log=el('div','log',t.el);
  top.onclick=()=>{const open=t.el.classList.toggle('open');if(open){t.log.textContent='';(msgs[t.tid]||[]).forEach(m=>bubble(t,m,false));t.unread=false;t.dot.classList.remove('on');cd.dot.classList.toggle('on',Object.values(byTid).some(x=>x.cd===cd&&x.unread));t.log.scrollTop=t.log.scrollHeight;}};
  byTid[th.tid]=t;prev(t);return t;
 };
 const addThreads=async(rows)=>{
  const fresh=rows.filter(x=>!byTid[x.tid]);if(!fresh.length)return;
  const ids=[...new Set(fresh.flatMap(x=>[x.a,x.b]))].filter(i=>!users[i]);
  if(ids.length){const r=await c.from('net_users').select('id,name,handle,role,grade').in('id',ids);(r.data||[]).forEach(x=>{users[x.id]=x;});}
  for(const th of fresh){
   const r=await c.from('net_msgs').select('*').eq('tid',th.tid).order('at',{ascending:false}).limit(80);
   msgs[th.tid]=(r.data||[]).reverse();msgs[th.tid].forEach(m=>{seen.add(m.id);last=Math.max(last,+m.at);});
   buildThread(th);
  }
  empty.textContent=Object.keys(byTid).length?'':'No conversations yet. They show up here the moment your children start chatting.';
 };
 const addMsg=async m=>{
  if(!m||seen.has(m.id))return;
  if(!byTid[m.tid]){await refresh();if(!byTid[m.tid])return;}
  if(seen.has(m.id))return;seen.add(m.id);last=Math.max(last,+m.at);
  const t=byTid[m.tid];(msgs[m.tid]=msgs[m.tid]||[]).push(m);msgs[m.tid].sort((a,b)=>a.at-b.at);
  if(!users[m.from_id]){const r=await c.from('net_users').select('id,name,handle,role,grade').eq('id',m.from_id);(r.data||[]).forEach(x=>{users[x.id]=x;});}
  prev(t);
  if(t.el.classList.contains('open'))bubble(t,m,true);else if(ready){t.unread=true;t.dot.classList.add('on');t.cd.dot.classList.add('on');}
 };
 const refresh=async()=>{const r=await c.from('net_threads').select('*').contains('owners',[uid]);if(!r.error)await addThreads(r.data||[]);};
 const poll=async()=>{
  try{await refresh();const tids=Object.keys(byTid);if(!tids.length)return;
   const r=await c.from('net_msgs').select('*').in('tid',tids).gt('at',last-60000).order('at');
   for(const m of (r.data||[]))await addMsg(m);}catch(e){}
 };
 try{await addThreads(threads);}catch(e){say(missing(e)?"Live chats aren't switched on yet. Ask the school owner to apply the latest update.":"Couldn't load the chats right now. Check your connection and reload.");return;}
 ready=true;
 try{chan=c.channel('parent-live-'+uid).on('postgres_changes',{event:'INSERT',schema:'public',table:'net_msgs'},p=>{addMsg(p.new).catch(()=>{});}).on('postgres_changes',{event:'INSERT',schema:'public',table:'net_threads'},()=>{refresh().catch(()=>{});}).subscribe();}catch(e){}
 timer=setInterval(()=>{if(document.visibilityState==='visible')poll();},4000);
}
start().catch(()=>{say("Sign in with your family account to see your children's chats and mail.");focusLive();});
</script>
</body>
</html>
