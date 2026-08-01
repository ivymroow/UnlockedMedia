let state={view:'welcome',query:'',player:null,mode:'standalone',prevState:null,user:null,_title:'',_year:'',_poster:'',_savedSeason:null,_savedEpisode:null,_sources:null}
const cache=new Map()
let backendUrl=localStorage.getItem('um_backend')||''
let token=localStorage.getItem('um_token')||''
let refreshToken=localStorage.getItem('um_refresh')||''

async function tryRefreshSession(){
  if(!refreshToken||!token)return false
  try{const r=await fetch(`${backendUrl||''}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh:refreshToken})});if(r.ok){const d=await r.json();token=d.token;refreshToken=d.refresh;localStorage.setItem('um_token',token);localStorage.setItem('um_refresh',refreshToken);return true}}catch{}
  return false
}

async function detect(){
  for(let i=0;i<3;i++){
    try{const r=await fetch('/api/status',{signal:AbortSignal.timeout(5000)});if(r.ok){state.mode='backend';state.backendUrl='';return}}catch{}
    if(i<2)await new Promise(r=>setTimeout(r,2000));
  }
  if(backendUrl){try{const r=await fetch(`${backendUrl}/api/status`,{signal:AbortSignal.timeout(5000)});if(r.ok){state.mode='backend';state.backendUrl=backendUrl;return}}catch{}}
  state.mode='standalone';state.backendUrl='';
}

async function api(method,path,body,noAuth){
  if(state.mode==='backend'){
    const base=state.backendUrl||'';const opts={headers:{'Content-Type':'application/json'}}
    if(token&&!noAuth)opts.headers.Authorization='Bearer '+token
    if(body)opts.body=JSON.stringify(body)
    const r=await fetch(`${base}${path}`,{...opts,method})
    if(!r.ok){if(r.status===401&&refreshToken){const refreshed=await tryRefreshSession();if(refreshed)return api(method,path,body,noAuth)}const e=await r.json().catch(()=>({error:`HTTP ${r.status}`}));throw new Error(e.error)}
    return r.json()
  }
  return standalone(path)
}
async function standalone(path){
  if(path==='/api/status')return{mode:'standalone'}
  const p=new URLSearchParams(path.split('?')[1]||'')
  if(path.startsWith('/api/search')){const q=p.get('q');if(!q)return[];const r=await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`);const d=await r.json();return(d.d||[]).filter(i=>i.id).map(i=>({id:i.id,title:i.l,year:i.y||null,stars:i.s||'',poster:i.i?.[0]||'',type:(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}))}
  if(path==='/api/trending'||path.startsWith('/api/popular'))return[]
  const mid=path.match(/\/api\/movie\/(tt\d+)(\/sources)?(\?|$)/)
  if(mid){const id=mid[1];if(mid[2]==='/sources')return srcs(p.get('title'),p.get('year'),id);return imdbDetails(id)}
  throw new Error('Backend required')
}
async function imdbDetails(id){const k=`d:${id}`;const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let d={id,title:'',year:null,poster:'',overview:'',genres:[],runtime:null,cast:[],rating:null,type:'movie'};try{const r=await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`);const j=await r.json();const i=j.d?.find(x=>x.id===id)||j.d?.[0];if(i){d.title=i.l||'';d.year=i.y||null;d.poster=i.i?.[0]||'';d.cast=i.s?i.s.split(', '):[];d.type=(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}}catch{}try{const r=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(d.title+(d.year?' '+d.year:'')+' film')}`);const w=await r.json();if(w.extract)d.overview=w.extract;if(!d.poster&&w.thumbnail?.source)d.poster=w.thumbnail.source}catch{}sessionStorage.setItem(k,JSON.stringify(d));return d}
async function srcs(title,year,imdbId){const k=`s:${imdbId||title}`;const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let src=[];try{const r=await fetch(`https://${atob('dG9ycmVudGlvLnN0cmVtLmZ1bg==')}/stream/movie/${imdbId}.json`);const d=await r.json();if(d?.streams)for(const s of d.streams){const seedM=s.title?.match(/👤\s*(\d+)/);const sizeM=s.title?.match(/💾\s*([\d.]+)\s*(GB|MB)/);src.push({provider:'TSX',quality:((s.title||s.name||'').includes('4K')?'4K':(s.title||'').includes('1080')?'1080p':(s.title||'').includes('720')?'720p':'Unknown'),size:sizeM?sizeM[1]+' '+sizeM[2]:'',seeds:seedM?parseInt(seedM[1]):0,peers:0,hash:s.infoHash,fileIndex:s.fileIdx||0})}}catch{}src.sort((a,b)=>(b.seeds||0)-(a.seeds||0));sessionStorage.setItem(k,JSON.stringify(src));return src}
function qs(s){return document.querySelector(s)}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function img(p){return p||''}
function fmt(s){if(!s)return'';const m=s.match(/^[\d.]+/);if(!m)return s;const n=parseFloat(m[0]);return s.includes('GB')?`${(n*1024).toFixed(0)} MB`:`${Math.round(n)} MB`}
function title(i){return i.title||i.name||'Unknown'}
function year(i){return i.year||''}
function rating(i){return i.rating||i.vote_average?(i.rating||i.vote_average).toFixed(1):null}

function navigate(v,d){
  state.prevState={view:state.view,data:state.data};state.view=v;state.data=d
  let hash='#'
  if(v==='search')hash='#q='+encodeURIComponent(state.query||'')
  else if(v==='detail'){
    const ep=selectedEpisode?`&s=${selectedSeason}&e=${selectedEpisode}`:(d?.season?`&s=${d.season}&e=${d.episode||1}`:'')
    hash='#id='+(d?.id||'')+(d?.type==='tv'?'&type=tv':'')+(d?.title?'&t='+encodeURIComponent(d.title):'')+(d?.year?'&y='+d.year:'')+ep
  }else if(v==='profile')hash='#profile'
  history.replaceState(null,'',hash)
  render()
}
window.addEventListener('popstate',()=>{
  if(state.player)return
  const hash=window.location.hash.slice(1)
  if(!hash||hash==='/'||hash===''){state.view='home';render();return}
  if(hash==='profile'){state.view='profile';render();return}
  const params=new URLSearchParams(hash)
  if(params.has('q')){state.query=params.get('q');qs('#searchInput').value=state.query;render()}
  else if(params.has('id')){
    state.view='detail';const se=parseInt(params.get('s')),ep=parseInt(params.get('e'))
    if(se&&ep){selectedSeason=se;selectedEpisode=ep}
    state.data={id:params.get('id'),type:params.get('type')||'movie',title:params.get('t')||'',year:params.get('y')||'',season:se||null,episode:ep||null}
    render()
  }
})
function goBack(){if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;render()}else navigate('home')}

function toggleSettings(){
  const m=qs('#settings-modal');const s=m.style.display!=='flex'
  m.style.display=s?'flex':'none'
  if(s){qs('#settingsBackendInput').value=backendUrl;const acct=qs('#settingsAccount');if(acct)acct.innerHTML=state.user?`<label>Account</label><p style="font-size:14px;color:var(--text);margin-top:4px">${esc(state.user.username||state.user.email)}</p><button class="auth-btn" style="margin-top:8px" onclick="signOut();toggleSettings()">Sign Out</button>`:'<label>Account</label><p class="hint" style="margin-top:4px">Not signed in. <a href="#" onclick="showAuth();toggleSettings();return false">Sign in</a> to save progress.</p>'}
}
function saveSettingsBackend(){const b=qs('#settingsBackendInput')?.value.trim()||'';if(b){localStorage.setItem('um_backend',b);backendUrl=b}qs('#settings-modal').style.display='none';location.reload()}
async function render(){renderUserSection();const m=qs('#main');try{if(state.view==='welcome'){m.innerHTML=W()}else if(state.view==='home'){m.innerHTML=H();L()}else if(state.view==='search'){m.innerHTML=S();LS()}else if(state.view==='detail'){m.innerHTML=D();LD()}else if(state.view==='profile'){m.innerHTML=PR();PL()}}catch(e){m.innerHTML=E(e.message)}}

function renderUserSection(){
  const el=qs('#userSection')
  if(!el)return
  if(state.user){const display=state.user.username||state.user.email;el.innerHTML=`<div class="user-menu"><button class="auth-btn" onclick="navigate('profile')">${esc(display)}</button><button class="auth-btn" onclick="signOut()">Sign Out</button></div>`}
  else{el.innerHTML=`<button class="auth-btn" onclick="showAuth()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign In</button>`}
}
function H(){return `<div class="section" id="wlSection" style="display:none"><h2 class="section-title">📋 My Watchlist</h2><div class="grid" id="wlGrid"></div></div><div class="section" id="cwSection" style="display:none"><h2 class="section-title">⏯ Continue Watching</h2><div class="grid" id="cwGrid"></div></div><div class="section" id="wdSection" style="display:none"><h2 class="section-title">✅ Watched</h2><div class="grid" id="wdGrid"></div></div><div class="section"><h2 class="section-title">🔥 Trending</h2><div class="grid" id="g0"></div></div><div class="section"><h2 class="section-title">📋 Popular Movies</h2><div class="grid" id="g1"></div></div><div class="section"><h2 class="section-title">📺 Popular Shows</h2><div class="grid" id="g2"></div></div><div class="loading-screen" id="HL"><div class="spinner"></div><p>Loading...</p></div>`}
async function L(){
  try{
    if(token){(async()=>{try{const[wl,cw,wd]=await Promise.all([api('GET','/api/watchlist/list'),api('GET','/api/progress/list?status=watching'),api('GET','/api/progress/list?status=watched')]);if(wl?.length){qs('#wlSection').style.display='';G('wlGrid',wl.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type})))}if(cw?.length){qs('#cwSection').style.display='';G('cwGrid',cw.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type,progress:i.watched&&i.duration?i.watched/i.duration:0})))}if(wd?.length){qs('#wdSection').style.display='';G('wdGrid',wd.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type})))} }catch{}})()}
    const[a,b,c]=await Promise.all([api('GET','/api/trending'),api('GET','/api/popular'),api('GET','/api/popular?type=tv')])
    qs('#HL').style.display='none';G('g0',a);G('g1',b);G('g2',c)
    if(!a.length&&!b.length&&!c.length)qs('#HL').querySelector('p').textContent='No backend connected. Try searching!'
  }catch{}
}
function S(){return`<div class="section"><h2 class="section-title">🔍 Results for "${esc(state.query)}"</h2><div class="grid" id="sg"></div><div class="loading-screen" id="sL"><div class="spinner"></div><p>Searching...</p></div></div>`}
async function LS(){try{const r=await api('GET',`/api/search?q=${encodeURIComponent(state.query)}`);qs('#sL').style.display='none';G('sg',r)}catch(e){qs('#main').innerHTML=E(e.message)}}
function D(){return`<div class="detail"><button class="detail-back" onclick="navigate('home')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="loading-screen" id="dL"><div class="spinner"></div><p>Loading...</p></div></div>`}

async function LD(){
  const{id,type,title:t,year:y,season:hashSeason,episode:hashEpisode}=state.data
  const tHint=t||'',yHint=y||''
  if(hashSeason&&hashEpisode){selectedSeason=hashSeason;selectedEpisode=hashEpisode}
  if(type==='movie'&&state.mode==='backend'){(async()=>{try{const src=await api('GET',`/api/movie/${id}/sources?title=${encodeURIComponent(tHint)}&year=${yHint}&type=${type}`);const best=src?.sort((a,b)=>(b.seeds||0)-(a.seeds||0))[0];if(best?.hash)fetch(`${state.backendUrl||''}/api/download`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:best.hash,fileIndex:best.fileIndex||0})}).catch(()=>{})}catch{}})()}
  try{
    const d=await api('GET',`/api/movie/${id}?type=${type}&title=${encodeURIComponent(tHint)}&year=${yHint}`)
    state.data._title=d.title||'';state.data._year=d.year||'';state.data._poster=d.poster||''
    if(d.type==='tv'||type==='tv'){const eps=await api('GET',`/api/show/${id}/episodes?title=${encodeURIComponent(d.title||'')}`);RD(d,null,eps)}
    else{const s=await api('GET',`/api/movie/${id}/sources?title=${encodeURIComponent(d.title||'')}&year=${d.year||''}&type=${type}`);RD(d,s,null)}
  }catch(e){qs('#dL').outerHTML=`<p style="color:var(--text2);padding:20px">${esc(e.message)}</p>`}
}

let selectedSeason=1,selectedEpisode=1

async function loadEpisodeSources(id,season,episode){
  const title=state.data?._title||'',year=state.data?._year||'',list=qs('#sl')
  if(!list)return
  list.innerHTML='<div class="loading-screen" style="padding:16px"><div class="spinner"></div><p>Searching...</p></div>'
  const q=`S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
  let srcs=null
  try{srcs=await api('GET',`/api/show/${id}/sources?title=${encodeURIComponent(title)}&year=${year}&type=tv&season=${season}&episode=${episode}&_=${Date.now()}`)}catch{}
  if(!srcs||!srcs.length){try{const r=await fetch(`https://${atob('dG9ycmVudGlvLnN0cmVtLmZ1bg==')}/stream/series/${id}:${season}:${episode}.json`);const d=await r.json();if(d?.streams)srcs=d.streams.map(x=>{const t=x.title||'',seedM=t.match(/👤\s*(\d+)/),sizeM=t.match(/💾\s*([\d.]+)\s*(GB|MB)/);return{provider:'TSX',quality:t.includes('4K')?'4K':t.includes('1080')?'1080p':t.includes('720')?'720p':'Unknown',size:sizeM?sizeM[1]+' '+sizeM[2]:'',seeds:seedM?parseInt(seedM[1]):0,peers:0,hash:x.infoHash,fileIndex:x.fileIdx||0}})}catch{}}
  if(!srcs||!srcs.length){list.innerHTML=`<p style="color:var(--text3);font-size:14px;padding:8px 0">No sources for ${title} ${q}.</p>`;return}
  srcs.sort((a,b)=>(b.seeds||0)-(a.seeds||0))
  state._sources=srcs
  const alive=srcs.filter(s=>(s.seeds||0)>0||(s.peers||0)>0)
  list.innerHTML=`${alive.length>0?`<button class="play-btn" style="width:100%;justify-content:center;margin-bottom:10px" onclick="playBest()">▶ Play Best Source</button>`:''}${srcs.map(src=>{const dead=(src.seeds||0)===0&&(src.peers||0)===0;return`<div class="source-item${dead?' dead-source':''}"><div class="source-info"><span class="source-quality">${src.quality}</span><span class="source-size">${fmt(src.size)}</span><span class="source-seeds">⬆ ${src.seeds||0}</span><span class="source-peers">⬇ ${src.peers||0}</span><span style="color:var(--text3);font-size:11px">${src.provider||''}</span></div><button class="source-play" onclick="playSource('${src.hash}',${src.fileIndex||0},'${esc(title)} ${q}')">${dead?'⚠ Try':'▶ Play'}</button></div>`}).join('')}`
}

function RD(d,srces,episodes){
  const t=d.title||'Unknown',y=d.year||'',rt=d.runtime?`${Math.floor(d.runtime/60)}h ${d.runtime%60}m`:'',r=d.rating?d.rating.toFixed(1):'',o=d.overview||'No overview available.',g=d.genres||[],c=d.cast&&d.cast.length?d.cast.join(', '):'',isTv=episodes&&episodes.length>0
  document.title=`${t} · web-streaming`
  const posterUrl=d.poster||''
  let wlBtn=''
  if(token){wlBtn=`<button class="wl-btn" id="wlBtn" onclick="toggleWatchlist()">⏳ Loading...</button>`;setTimeout(async()=>{try{const r=await api('GET',`/api/watchlist/check?id=${d.id}`);const b=qs('#wlBtn');if(b){b.textContent=r.inList?'✓ In Watchlist':'+ Watchlist';b.className='wl-btn'+(r.inList?' in-list':'')}}catch{}},50)}
  let episodeHTML=''
  if(isTv){
    if(state.data?.season&&state.data?.episode){selectedSeason=state.data.season;selectedEpisode=state.data.episode;state.data.season=null;state.data.episode=null}
    else if(!selectedSeason||!episodes.some(s=>s.season===selectedSeason)){selectedSeason=episodes[0]?.season||1;selectedEpisode=episodes[0]?.episodes?.[0]?.number||1}
    window._eps=episodes
    episodeHTML=`<div class="episode-picker"><div class="sources-title">Select Episode</div><div class="episode-controls"><select id="seasonSelect">${episodes.map(s=>`<option value="${s.season}">Season ${s.season} (${s.episodes.length} eps)</option>`).join('')}</select><select id="episodeSelect"></select></div><div id="episodeInfo" class="episode-info"></div><div class="sources-section" style="margin-top:12px"><div class="sources-title">Sources</div><div class="sources-list" id="sl"><div class="loading-screen" style="padding:12px"><div class="spinner"></div></div></div></div></div>`
  }
  qs('#dL').outerHTML=`<div class="detail-hero"><div class="detail-poster">${posterUrl?`<img src="${posterUrl}" alt="${esc(t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=placeholder style=padding:80px;text-align:center;color:var(--text3);font-size:48px>🎬</div>'">`:'<div class="placeholder" style="padding:80px;text-align:center;color:var(--text3);font-size:48px">🎬</div>'}</div><div class="detail-info"><h1 class="detail-title">${esc(t)}</h1><div class="detail-meta">${y?`<span>📅 ${y}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}</div><div class="detail-genres">${g.map(x=>`<span>${x}</span>`).join('')}</div>${r?`<div class="detail-rating"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${r}/10</div>`:''}${wlBtn?`<div style="margin-top:12px">${wlBtn}</div>`:''}<p class="detail-overview">${esc(o)}</p>${c?`<p class="detail-cast"><strong>Stars:</strong> ${esc(c)}</p>`:''}${episodeHTML||`<div class="sources-section"><div class="sources-title">Sources</div><div class="sources-list" id="sl"></div></div>`}</div></div>`

  if(isTv){const ie=()=>{const ss=qs('#seasonSelect');if(!ss){setTimeout(ie,100);return};ss.value=selectedSeason;ss.onchange=function(){fillEpisodes(true)};fillEpisodes()};setTimeout(ie,50)}
  else{
    const list=qs('#sl')
    if(!srces||!srces.length){if(list)list.innerHTML='<p style="color:var(--text3);font-size:14px;padding:8px 0">No sources found.</p>';return}
    state._sources=srces
    const alive=srces.filter(s=>(s.seeds||0)>0||(s.peers||0)>0)
    if(list)list.innerHTML=`${alive.length>0?`<button class="play-btn" style="width:100%;justify-content:center;margin-bottom:10px" onclick="playBest()">▶ Play Best Source</button>`:''}${srces.map(s=>{const dead=(s.seeds||0)===0&&(s.peers||0)===0;return`<div class="source-item${dead?' dead-source':''}"><div class="source-info"><span class="source-quality">${s.quality}</span><span class="source-size">${fmt(s.size)}</span><span class="source-seeds">⬆ ${s.seeds||0}</span><span class="source-peers">⬇ ${s.peers||0}</span><span style="color:var(--text3);font-size:11px">${s.provider||''}</span></div><button class="source-play" onclick="playSource('${s.hash}',${s.fileIndex||0},'${esc(t)}')">${dead?'⚠ Try':'▶ Play'}</button></div>`}).join('')}`
  }
}

async function toggleWatchlist(){
  const id=state.data?.id;if(!id)return;const btn=qs('#wlBtn');if(!btn)return;const wasIn=btn.textContent.includes('In')||btn.textContent.includes('✓');btn.textContent='...'
  try{if(wasIn){await api('POST','/api/watchlist/remove',{id});btn.textContent='+ Watchlist';btn.className='wl-btn'}else{const d=state.data;await api('POST','/api/watchlist/add',{id,title:d._title||'',poster:d._poster||'',type:d.type||'movie'});btn.textContent='✓ In Watchlist';btn.className='wl-btn in-list'}}catch{btn.textContent='Error';btn.className='wl-btn'}
}

function fillEpisodes(isSeasonChange){
  const eps=window._eps;if(!eps)return;const ss=qs('#seasonSelect');if(!ss)return;const season=parseInt(ss.value);selectedSeason=season;const epData=eps.find(s=>s.season===season);if(!epData)return;const es=qs('#episodeSelect');if(!es)return
  es.innerHTML=epData.episodes.map(e=>`<option value="${e.number}">${e.number}. ${esc(e.name)}${e.airdate?' ('+e.airdate+')':''}</option>`).join('')
  if(isSeasonChange||!epData.episodes.some(e=>e.number===selectedEpisode))selectedEpisode=epData.episodes[0]?.number||1
  es.value=selectedEpisode;es.onchange=function(){selectedEpisode=parseInt(this.value);updateEpisodeInfo();updateHashForEpisode();loadEpisodeSources(state.data.id,selectedSeason,selectedEpisode)}
  updateEpisodeInfo();loadEpisodeSources(state.data.id,selectedSeason,selectedEpisode)
}
function updateHashForEpisode(){if(!state.data)return;const id=state.data.id||'',title=state.data._title||'',year=state.data._year||'',type=state.data.type||'movie';history.replaceState(null,'',`#id=${id}&type=${type}&t=${encodeURIComponent(title)}&y=${year}&s=${selectedSeason}&e=${selectedEpisode}`)}
function updateEpisodeInfo(){const eps=window._eps;if(!eps)return;const epData=eps.find(s=>s.season===selectedSeason);if(!epData)return;const ep=epData.episodes.find(e=>e.number===selectedEpisode);const info=qs('#episodeInfo');if(info&&ep)info.innerHTML=ep.summary?`<p style="font-size:13px;color:var(--text2);margin-top:8px">${esc(ep.summary.slice(0,300))}</p>`:''}

function playerHTML(title){return`<div class="player-container"><button class="player-back" onclick="cp()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="player-wrapper" id="pw"><div class="player-loading" id="pl"><div class="spinner"></div><p id="plText">Connecting...</p><span class="player-progress-text" id="ps">Initializing</span></div><video id="player" crossorigin="anonymous" style="display:none;width:100%;height:100%;background:#000"></video><div id="customControls" style="display:none;position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.9));padding:40px 16px 8px;z-index:5"><div style="display:flex;align-items:center;gap:10px;width:100%"><button id="ppBtn" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%">▶</button><span id="timeDisplay" style="color:#ccc;font-size:13px;font-family:monospace;white-space:nowrap">0:00 / 0:00</span><div style="flex:1;height:6px;background:rgba(255,255,255,.15);border-radius:3px;cursor:pointer;position:relative" id="seekBar"><div id="seekFill" style="height:100%;width:0%;background:var(--primary);border-radius:3px;pointer-events:none"></div><div id="seekThumb" style="display:none;position:absolute;top:-3.5px;width:13px;height:13px;border-radius:50%;background:var(--primary);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 4px rgba(0,0,0,.5)"></div></div><div style="display:flex;align-items:center;gap:6px"><button id="ccBtn" title="Captions" style="background:var(--primary);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.5"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 12h2m3 0h6"/><path d="M7 15h1.5m3.5 0h6"/></svg></button><button id="volBtn" style="background:var(--primary);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></button><input type="range" id="volSlider" min="0" max="1" step="0.05" value="1" style="width:60px;accent-color:var(--primary);cursor:pointer;height:4px"><button id="fsBtn" style="background:var(--primary);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button></div></div></div></div></div>`}

async function playBest(){
  if(!state._sources||!state._sources.length)return
  if(state.mode!=='backend'){alert('Backend required');return}
  const alive=state._sources.filter(s=>(s.seeds||0)>0||(s.peers||0)>0)
  if(!alive.length){alert('No viable sources');return}
  const title=state.data?._title||''
  state.view='player';document.title=`${title} · web-streaming`;qs('#app').innerHTML=playerHTML(title)
  const ps=qs('#ps'),pl=qs('#plText');if(pl)pl.textContent='Finding source...';if(ps)ps.textContent='Testing '+alive.length+' sources'

  try{
    const base=state.backendUrl||''
    const rr=await fetch(`${base}/api/race`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:alive.map(s=>({hash:s.hash,fileIndex:s.fileIndex||0}))})})
    const race=await rr.json()
    if(!race.found){perr('No viable source found');return}
    if(race.error){perr(race.error);return}
    if(pl)pl.textContent='Buffering...'
    const result=await pollDownload(race.id,ps,pl,race.hash)
    if(!result)return
    finishPlayer(result.blob,race.hash,result.dlId)
  }catch(e){perr(e.message)}
}

async function playSource(hash,fi,title){
  if(state.mode!=='backend'){alert('Backend required');return}
  state.view='player';document.title=`${title} · web-streaming`;qs('#app').innerHTML=playerHTML(title)
  const ps=qs('#ps'),pl=qs('#plText');if(pl)pl.textContent='Connecting...';if(ps)ps.textContent=''
  try{
    const result=await pollDownload(null,ps,pl,hash,fi)
    if(!result)return
    finishPlayer(result.blob,hash,result.dlId)
  }catch(e){perr(e.message)}
}

async function pollDownload(downloadId,ps,pl,hash,fi){
  const base=state.backendUrl||''
  let dlId=downloadId
  if(!dlId){
    const r=await fetch(`${base}/api/download`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash,fileIndex:fi||0})})
    const dl=await r.json()
    if(dl.error){perr(dl.error);return null}
    dlId=dl.id
  }
  return new Promise(resolve=>{
    const iv=setInterval(async()=>{
      try{
        const sr=await fetch(`${base}/api/download/${dlId}/status`);const st=await sr.json()
        if(!st||st.error){clearInterval(iv);if(st?.error)perr(st.error);resolve(null);return}
        if(st.transcoding){if(pl)pl.textContent='Processing audio...';if(ps)ps.textContent='';return}
        if(st.done){
          clearInterval(iv);if(pl)pl.textContent='Loading subtitles...';if(ps)ps.textContent=''
          try{
            const fr=await fetch(`${base}/api/download/${dlId}/file`);const blob=await fr.blob()
            resolve({blob,dlId,infoHash:hash||''})
          }catch(e){perr('Failed: '+e.message);resolve(null)}
          return
        }
        const pct=Math.round((st.progress||0)*100),speed=st.speed?`${(st.speed/1e6).toFixed(1)} MB/s`:''
        if(pl)pl.textContent='Buffering...';if(ps)ps.textContent=`${pct}%${speed?' · '+speed:''}`
      }catch{clearInterval(iv);resolve(null)}
    },1000)
    setTimeout(()=>{clearInterval(iv);resolve(null)},480000)
  })
}

async function finishPlayer(blob,infoHash,dlId){
  const video=qs('#player'),pl=qs('#pl'),plText=qs('#plText')
  if(plText)plText.textContent='Loading subtitles...'
  const base=state.backendUrl||''

  if(dlId){
    try{
      const sr=await fetch(`${base}/api/download/${dlId}/subtitles`)
      if(sr.ok){
        const vtt=await sr.text()
        const sb=new Blob([vtt],{type:'text/vtt'}),url=URL.createObjectURL(sb),tr=document.createElement('track')
        tr.kind='captions';tr.label='English';tr.srclang='en';tr.src=url;tr.id='preloadedSub'
        video.appendChild(tr);for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=i===video.textTracks.length-1?'showing':'hidden'
      }
    }catch{}
  }

  if(plText)plText.textContent='Starting...'
  pl.style.display='none';video.style.display='block'
  video.muted=false;video.volume=1
  video.src=URL.createObjectURL(blob)
  initCustomPlayer(video,base,infoHash)
  if(video._enableSeek)video._enableSeek()
}

function initCustomPlayer(video,baseUrl,infoHash){
  const pp=qs('#ppBtn'),seek=qs('#seekBar'),fill=qs('#seekFill'),thumb=qs('#seekThumb'),timeD=qs('#timeDisplay'),volBtn=qs('#volBtn'),volSlider=qs('#volSlider'),fs=qs('#fsBtn'),ccBtn=qs('#ccBtn')
  let audioCtx,audioSrc
  function ul(){if(audioSrc||!video)return;try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioSrc=audioCtx.createMediaElementSource(video);audioSrc.connect(audioCtx.destination);audioCtx.resume()}catch{}video.muted=false;video.volume=parseFloat(volSlider?.value||'1');video.play().catch(()=>{})}
  let se=true
  video.oncanplay=()=>{qs('#pl').style.display='none';video.style.display='block';qs('#customControls').style.display='flex';ul();video.play().catch(()=>{})}
  video.onplaying=()=>{qs('#pl').style.display='none';qs('#customControls').style.display='flex'}
  pp.onclick=()=>{if(video.paused){video.play();pp.textContent='⏸'}else{video.pause();pp.textContent='▶'}}
  video.onplay=()=>{pp.textContent='⏸'};video.onpause=()=>{pp.textContent='▶'};video.onended=()=>{pp.textContent='▶'}
  video.ontimeupdate=()=>{
    if(!video.duration)return;const pct=(video.currentTime/video.duration)*100
    if(fill)fill.style.width=pct+'%';if(thumb){thumb.style.display='';thumb.style.left=pct+'%'}
    if(timeD)timeD.textContent=fmtTime(video.currentTime)+' / '+fmtTime(video.duration)
    if(token&&state.data?.id){const se2=state.data.type==='tv'?selectedSeason:0,ep2=state.data.type==='tv'?selectedEpisode:0;clearTimeout(window._st);window._st=setTimeout(async()=>{try{await fetch(`${baseUrl}/api/progress/save`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({id:state.data.id,title:state._title||'',poster:state._poster||'',type:state.data.type||'movie',season:se2,episode:ep2,duration:Math.round(video.duration),watched:Math.round(video.currentTime),status:video.currentTime/video.duration>0.9?'watched':'watching'})})}catch{}},5000)}
  }
  let seeking=false;function ds(cx){if(!video.duration||!se)return;const rc=seek.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(cx-rc.left)/rc.width));video.currentTime=pct*video.duration}
  seek.title=se?'Seek':'Seeking available after download completes';seek.onmousedown=e=>{if(!se)return;seeking=true;ds(e.clientX)};seek.onmousemove=e=>{if(seeking)ds(e.clientX)};document.addEventListener('mouseup',()=>{seeking=false});seek.addEventListener('touchstart',e=>{if(!se)return;seeking=true;ds(e.touches[0].clientX)},{passive:true});seek.addEventListener('touchmove',e=>{if(seeking)ds(e.touches[0].clientX)},{passive:true});seek.addEventListener('touchend',()=>{seeking=false})
  video._enableSeek=()=>{se=true;seek.title='Seek';seek.style.cursor='pointer'}
  const volSvg=volBtn.querySelector('svg');volSlider.addEventListener('input',()=>{const v=parseFloat(volSlider.value);video.volume=v;video.muted=(v===0);uI()});volBtn.onclick=()=>{video.muted=!video.muted;if(!video.muted)volSlider.value=video.volume;uI()};video.onvolumechange=()=>{volSlider.value=video.muted?0:video.volume;uI()}
  function uI(){if(!volSvg)return;if(video.muted||video.volume===0)volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13 0l-1.5 1.5L16 12l-1.5 1.5L16 15l1.5-1.5L19 12l1.5 1.5L22 12l-1.5-1.5L22 9l-1.5 1.5L19 9l-1.5 1.5L16 9z"/>';else if(video.volume<0.5)volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13 1.5L14.5 12l1.5 1.5V10.5z"/>';else volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'}
  fs.onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.body.requestFullscreen()}
  let cc=false;if(ccBtn){ccBtn.onclick=()=>{cc=!cc;ccBtn.style.opacity=cc?'1':'.5';for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=cc?(i===video.textTracks.length-1?'showing':'hidden'):'hidden'}}
  document.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{})},{once:true})
}

function fmtTime(s){if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
function perr(msg){const pw=qs('#pw');if(pw)pw.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center"><p style="color:#f87171;font-size:16px">${esc(msg)}</p><button class="play-btn" onclick="cp()">Go Back</button></div>`}
function cp(){if(state.player)state.player=null;if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;qs('#app').innerHTML='<main id="main"><div class="loading-screen" id="loadingScreen"><div class="spinner"></div><p>Loading...</p></div></main>';render()}else location.reload()}

function G(id,items){
  const el=qs(`#${id}`);if(!items||!items.length){el.innerHTML='';return}
  el.innerHTML=items.map(i=>{const p=img(i.poster),t=title(i),y=year(i),r=rating(i),tp=i.type==='tv'?'TV':'Movie',prog=i.progress?`<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(i.progress*100,100)}%"></div></div>`:'';return`<div class="card" onclick="navigate('detail',{id:'${i.id}',type:'${tp==='TV'?'tv':'movie'}',title:'${esc(title(i))}',year:'${year(i)}'})"><div class="card-poster">${p?`<img src="${p}" alt="${esc(t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=placeholder>🎬</div>'">`:'<div class="placeholder">🎬</div>'}<span class="card-type">${tp}</span></div><div class="card-body"><h3 title="${esc(t)}">${esc(t)}</h3><div class="card-meta">${y?`<span>${y}</span>`:''}${r?`<span class="card-rating"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${r}</span>`:''}</div>${prog}</div></div>`}).join('')
}
function E(m){return`<div class="error-view"><h2>Something went wrong</h2><p>${esc(m)}</p><button class="play-btn" onclick="location.reload()">Try Again</button></div>`}

function W(){return`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px"><div style="max-width:640px;text-align:center"><h1 style="font-size:32px;font-weight:800;margin-bottom:8px">web-streaming <span style="font-size:16px;color:var(--primary);font-weight:600">beta</span></h1><p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:24px">I am currently a solo dev with no money or servers or anything. I want to make a simple streaming site that:</p><ul style="list-style:none;padding:0;color:var(--text2);font-size:14px;line-height:2;margin-bottom:24px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto"><li>✅ doesn't spam ads</li><li>✅ doesn't break half the time</li><li>✅ doesn't steal your info lmao</li><li>✅ has original UI and functionality</li></ul><p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:8px">Currently this depends on torrents and peers. I want to do direct streaming but I'm seriously broke and API keys cost monies man.</p><p style="color:var(--text3);font-size:12px;margin-bottom:24px"><a href="https://github.com/ivymroow/webstreaming/blob/main/notice.md" target="_blank" style="color:var(--primary)">View full project notice &amp; source →</a></p><button onclick="enterSite()" style="padding:14px 48px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius);font-size:16px;font-weight:700;cursor:pointer">Enter</button></div></div>`}
function enterSite(){state.view='home';navigate('home')}

function showAuth(){qs('#auth-modal').style.display='flex'}
function hideAuth(){qs('#auth-modal').style.display='none'}
let authMode='signin'
async function doAuth(){
  const username=qs('#authUsername').value.trim(),pass=qs('#authPassword').value;if(!username||!pass)return
  const body={username,password:pass};if(authMode==='signup'){const email=qs('#authEmail').value.trim();if(email)body.email=email}
  try{const r=await api('POST',authMode==='signup'?'/api/auth/signup':'/api/auth/signin',body,true);if(r.token){localStorage.setItem('um_token',r.token);token=r.token;if(r.refresh){localStorage.setItem('um_refresh',r.refresh);refreshToken=r.refresh}state.user=r.user}hideAuth();render()}catch(e){qs('#authError').textContent=e.message}
}
function toggleAuthMode(){authMode=authMode==='signin'?'signup':'signin';qs('#authModalTitle').textContent=authMode==='signin'?'Sign In':'Sign Up';qs('#authToggle').innerHTML=authMode==='signin'?'Don\'t have an account? <a href="#" onclick="toggleAuthMode();return false">Sign Up</a>':'Already have an account? <a href="#" onclick="toggleAuthMode();return false">Sign In</a>';qs('#emailField').style.display=authMode==='signup'?'block':'none';qs('#pwWarning').style.display='block';qs('#authError').textContent=''}
function signOut(){localStorage.removeItem('um_token');localStorage.removeItem('um_refresh');token='';refreshToken='';state.user=null;navigate('home')}

function PR(){return`<div class="profile"><button class="detail-back" onclick="navigate('home')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><h1>Profile</h1><div class="profile-search"><input type="text" id="psInput" class="profile-search-input" placeholder="Search movies & shows to add..." autocomplete="off"><div class="profile-search-drop" id="psDrop" style="display:none"></div></div><div class="profile-tabs"><button class="profile-tab active" data-tab="watching">Continue Watching</button><button class="profile-tab" data-tab="watchlist">Watchlist</button><button class="profile-tab" data-tab="watched">Watched</button><button class="profile-tab" data-tab="planned">Plan to Watch</button></div><div class="grid" id="profileGrid"></div><div class="loading-screen" id="pLd"><div class="spinner"></div><p>Loading...</p></div></div>`}
async function PL(){
  if(!token){qs('#profileGrid').innerHTML='<p style="color:var(--text2);padding:40px;text-align:center">Sign in to manage your watchlist.</p>';qs('#pLd').style.display='none';return}
  document.title='Profile · web-streaming'
  async function lt(tab){qs('#pLd').style.display='';qs('#profileGrid').innerHTML='';qs('#psDrop').style.display='none';const tabs=document.querySelectorAll('.profile-tab');tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===tab))
    try{let items=[];if(tab==='watchlist')items=await api('GET','/api/watchlist/list');else items=await api('GET',`/api/progress/list?status=${tab}`);G('profileGrid',items.map(i=>({id:i.item_id||i.id,title:i.title,poster:i.poster,year:null,type:i.type,progress:tab==='watching'&&i.watched&&i.duration?i.watched/i.duration:0})));if(!items.length)qs('#profileGrid').innerHTML='<p style="color:var(--text2);padding:40px;text-align:center;grid-column:1/-1">Nothing here yet.</p>'}catch(e){qs('#profileGrid').innerHTML=`<p style="color:#f87171;padding:40px;text-align:center">${esc(e.message)}</p>`}
    qs('#pLd').style.display='none'}
  qs('.profile-tab[data-tab="watching"]').onclick=()=>lt('watching');qs('.profile-tab[data-tab="watchlist"]').onclick=()=>lt('watchlist');qs('.profile-tab[data-tab="watched"]').onclick=()=>lt('watched');qs('.profile-tab[data-tab="planned"]').onclick=()=>lt('planned')
  let st;qs('#psInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){qs('#psDrop').style.display='none';return};st=setTimeout(async()=>{try{let results;if(state.mode==='backend')results=await api('GET',`/api/search?q=${encodeURIComponent(q)}`);else{const r=await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`);const d=await r.json();results=(d.d||[]).filter(i=>i.id).map(i=>({id:i.id,title:i.l,year:i.y||null,poster:i.i?.[0]||'',type:(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}))}const drop=qs('#psDrop');if(!results||!results.length){drop.style.display='none';return};drop.innerHTML=results.slice(0,8).map(i=>`<div class="ps-drop-item" onclick="addToWatchlistFromProfile('${i.id}','${esc(i.title||'')}','${i.poster||''}','${i.type||'movie'}')"><img src="${i.poster||''}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 60%22><rect fill=%22%231a1a26%22 width=%2240%22 height=%2260%22/><text x=%2220%22 y=%2235%22 text-anchor=%22middle%22 font-size=%2218%22>🎬</text></svg>'" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"><div><div style="font-weight:600;font-size:13px">${esc(i.title||'')}</div><div style="font-size:11px;color:var(--text3)">${i.year||''} · ${i.type==='tv'?'TV':'Movie'}</div></div></div>`).join('');drop.style.display='block'}catch{}},300)});document.addEventListener('click',e=>{const d=qs('#psDrop'),inp=qs('#psInput');if(d&&!d.contains(e.target)&&e.target!==inp)d.style.display='none'})
  lt('watching')
}
async function addToWatchlistFromProfile(id,title,poster,type){try{await api('POST','/api/watchlist/add',{id,title,poster,type});qs('#psInput').value='';qs('#psDrop').style.display='none';alert('Added!')}catch(e){alert(e.message)}}

function restoreFromHash(){const hash=window.location.hash.slice(1);if(!hash||hash==='/'||hash==='')return;if(hash==='profile'){state.view='profile';return};const params=new URLSearchParams(hash);if(params.has('q')){state.query=params.get('q');state.view='search'}else if(params.has('id')){state.view='detail';const se=parseInt(params.get('s')),ep=parseInt(params.get('e'));if(se&&ep){selectedSeason=se;selectedEpisode=ep};state.data={id:params.get('id'),type:params.get('type')||'movie',title:params.get('t')||'',year:params.get('y')||'',season:se||null,episode:ep||null}}else state.view='home'}

async function init(){
  try{
    if(token&&refreshToken&&!state.user){const refreshed=await tryRefreshSession();if(refreshed){try{const u=await api('GET','/api/auth/user');state.user=u}catch{}}};if(!state.user&&token){try{const u=await api('GET','/api/auth/user');state.user=u}catch{localStorage.removeItem('um_token');token=''}};await detect();const badge=qs('#modeBadge');if(badge){badge.textContent='[WIP]';badge.className='mode-badge';badge.style.display='inline-block'};if(state.mode==='standalone'&&!navigator.onLine){qs('#setup').style.display='flex';return};qs('#setup').style.display='none';restoreFromHash();if(state.view==='search'&&state.query)qs('#searchInput').value=state.query;render()}catch(e){console.error('Init error:',e);const main=qs('#main');if(main)main.innerHTML='<div class="error-view"><h2>Failed to load</h2><p>'+esc(e.message||'Unknown error')+'</p><button class="play-btn" onclick="location.reload()">Retry</button></div>'}
}

let searchTimer;qs('#searchInput').addEventListener('input',function(){clearTimeout(searchTimer);const q=this.value.trim();if(!q){navigate('home');return};searchTimer=setTimeout(()=>{state.query=q;navigate('search')},300)});qs('#searchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(searchTimer);const q=this.value.trim();if(q){state.query=q;navigate('search')}}});init();
