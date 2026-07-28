let state={view:'home',query:'',player:null,mode:'standalone',prevState:null,user:null}
const cache=new Map()
const itemCache=new Map()
let backendUrl=localStorage.getItem('um_backend')||''
let token=localStorage.getItem('um_token')||''
let wt=null
const WT=['wss://tracker.webtorrent.dev','wss://tracker.openwebtorrent.com']

async function detect(){
  for(let i=0;i<3;i++){
    try{
      const r=await fetch('/api/status',{signal:AbortSignal.timeout(5000)});
      if(r.ok){state.mode='backend';state.backendUrl='';return}
    }catch{}
    if(i<2)await new Promise(r=>setTimeout(r,2000));
  }
  // Fallback: try configured backend URL
  if(backendUrl){
    try{
      const r=await fetch(`${backendUrl}/api/status`,{signal:AbortSignal.timeout(5000)});
      if(r.ok){state.mode='backend';state.backendUrl=backendUrl;return}
    }catch{}
  }
  state.mode='standalone';state.backendUrl='';
}

async function api(method,path,body){
  if(state.mode==='backend'){
    const base=state.backendUrl||'';const opts={headers:{'Content-Type':'application/json'}}
    if(token)opts.headers.Authorization='Bearer '+token
    if(body)opts.body=JSON.stringify(body)
    const r=await fetch(`${base}${path}`,{...opts,method})
    if(!r.ok){const e=await r.json().catch(()=>({error:`HTTP ${r.status}`}));throw new Error(e.error)}
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
  if(mid){const id=mid[1];if(mid[2]==='/sources')return sources(p.get('title'),p.get('year'),id);return imdbDetails(id)}
  throw new Error('Backend required')
}
async function imdbDetails(id){const k=`d:${id}`;const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let d={id,title:'',year:null,poster:'',overview:'',genres:[],runtime:null,cast:[],rating:null,type:'movie'};try{const r=await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`);const j=await r.json();const i=j.d?.find(x=>x.id===id)||j.d?.[0];if(i){d.title=i.l||'';d.year=i.y||null;d.poster=i.i?.[0]||'';d.cast=i.s?i.s.split(', '):[];d.type=(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}}catch{}try{const r=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(d.title+(d.year?' '+d.year:'')+' film')}`);const w=await r.json();if(w.extract)d.overview=w.extract;if(!d.poster&&w.thumbnail?.source)d.poster=w.thumbnail.source}catch{}sessionStorage.setItem(k,JSON.stringify(d));return d}
async function sources(title,year,imdbId){const k=`s:${imdbId||title}`;const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let src=[];try{const r=await fetch(`https://torrentio.strem.fun/stream/movie/${imdbId}.json`);const d=await r.json();if(d?.streams)for(const s of d.streams){const seedM=s.title?.match(/👤\s*(\d+)/);const sizeM=s.title?.match(/💾\s*([\d.]+)\s*(GB|MB)/);src.push({provider:'Torrentio',quality:((s.title||s.name||'').includes('4K')?'4K':(s.title||'').includes('1080')?'1080p':(s.title||'').includes('720')?'720p':'Unknown'),size:sizeM?sizeM[1]+' '+sizeM[2]:'',seeds:seedM?parseInt(seedM[1]):0,peers:0,hash:s.infoHash,fileIndex:s.fileIdx||0,magnet:mag(s.infoHash,(s.title||'')),})}}catch{}src.sort((a,b)=>(b.seeds||0)-(a.seeds||0));sessionStorage.setItem(k,JSON.stringify(src));return src}
function mag(h,n){const tr=WT.map(t=>`tr=${encodeURIComponent(t)}`).join('&');return `magnet:?xt=urn:btih:${h}&dn=${encodeURIComponent(n)}&${tr}`}
function qs(s){return document.querySelector(s)}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}

function navigate(v,d){
  state.prevState={view:state.view,data:state.data};state.view=v;state.data=d
  const hash=v==='search'?'#q='+encodeURIComponent(state.query||'') : v==='detail'?'#id='+(d?.id||'')+(d?.type==='tv'?'&type=tv':'')+(d?.title?'&t='+encodeURIComponent(d.title):'')+(d?.year?'&y='+d.year:'') : '#'
  history.replaceState(null,'',hash)
  render()
}

// Listen for back/forward navigation
window.addEventListener('popstate',()=>{
  if(state.player)return // don't mess with player
  const hash=window.location.hash.slice(1)
  if(!hash||hash==='/'||hash===''){state.view='home';render();return}
  const params=new URLSearchParams(hash)
  if(params.has('q')){state.query=params.get('q');qs('#searchInput').value=state.query;render()}
  else if(params.has('id')){state.view='detail';state.data={id:params.get('id'),type:params.get('type')||'movie'};render()}
})
function goBack(){if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;render()}else navigate('home')}
function img(p){return p||''}
function fmt(s){if(!s)return'';const m=s.match(/^[\d.]+/);if(!m)return s;const n=parseFloat(m[0]);return s.includes('GB')?`${n.toFixed(1)} GB`:`${Math.round(n)} MB`}
function title(i){return i.title||i.name||'Unknown'}
function year(i){return i.year||''}
function rating(i){return i.rating||i.vote_average?(i.rating||i.vote_average).toFixed(1):null}

function toggleSettings(){
  const m=qs('#settings-modal');const s=m.style.display!=='flex'
  m.style.display=s?'flex':'none'
  if(s){
    qs('#settingsBackendInput').value=backendUrl
    const acct=qs('#settingsAccount')
    if(acct)acct.innerHTML=state.user?`<label>Account</label><p style="font-size:14px;color:var(--text);margin-top:4px">${esc(state.user.username||state.user.email)}</p><button class="auth-btn" style="margin-top:8px" onclick="signOut();toggleSettings()">Sign Out</button>`:'<label>Account</label><p class="hint" style="margin-top:4px">Not signed in. <a href="#" onclick="showAuth();toggleSettings();return false">Sign in</a> to save progress.</p>'
  }
}

function saveSettingsBackend(){const b=qs('#settingsBackendInput')?.value.trim()||'';if(b){localStorage.setItem('um_backend',b);backendUrl=b}qs('#settings-modal').style.display='none';location.reload()}

async function render(){renderUserSection();const m=qs('#main');try{if(state.view==='home'){m.innerHTML=H();L()}else if(state.view==='search'){m.innerHTML=S();LS()}else if(state.view==='detail'){m.innerHTML=D();LD()}}catch(e){m.innerHTML=E(e.message)}}

function renderUserSection(){
  const el=qs('#userSection')
  if(!el)return
  if(state.user){
    const display=state.user.username||state.user.email
    el.innerHTML=`<div class="user-menu"><span class="user-email">${esc(display)}</span><button class="auth-btn" onclick="signOut()">Sign Out</button></div>`
  }else{
    el.innerHTML=`<button class="auth-btn" onclick="showAuth()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign In</button>`
  }
}

function H(){return `
<div class="section" id="wlSection" style="display:none"><h2 class="section-title">📋 My Watchlist</h2><div class="grid" id="wlGrid"></div></div>
<div class="section" id="cwSection" style="display:none"><h2 class="section-title">⏯ Continue Watching</h2><div class="grid" id="cwGrid"></div></div>
<div class="section" id="wdSection" style="display:none"><h2 class="section-title">✅ Watched</h2><div class="grid" id="wdGrid"></div></div>
<div class="section"><h2 class="section-title">🔥 Trending</h2><div class="grid" id="g0"></div></div>
<div class="section"><h2 class="section-title">📋 Popular Movies</h2><div class="grid" id="g1"></div></div>
<div class="section"><h2 class="section-title">📺 Popular Shows</h2><div class="grid" id="g2"></div></div>
<div class="loading-screen" id="HL"><div class="spinner"></div><p>Loading...</p></div>`}

async function L(){
  try{
    if(token){
      (async()=>{
        try{
          const[wl,cw,wd]=await Promise.all([
            api('GET','/api/watchlist/list'),
            api('GET','/api/progress/list?status=watching'),
            api('GET','/api/progress/list?status=watched'),
          ])
          if(wl?.length){qs('#wlSection').style.display='';G('wlGrid',wl.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type})))}
          if(cw?.length){qs('#cwSection').style.display='';G('cwGrid',cw.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type,progress:i.watched&&i.duration?i.watched/i.duration:0})))}
          if(wd?.length){qs('#wdSection').style.display='';G('wdGrid',wd.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type})))}
        }catch{}
      })()
    }
    const[a,b,c]=await Promise.all([api('GET','/api/trending'),api('GET','/api/popular'),api('GET','/api/popular?type=tv')])
    qs('#HL').style.display='none';G('g0',a);G('g1',b);G('g2',c)
    if(!a.length&&!b.length&&!c.length)qs('#HL').querySelector('p').textContent='No backend connected. Try searching!'
  }catch{}
}

function S(){return`<div class="section"><h2 class="section-title">🔍 Results for "${esc(state.query)}"</h2><div class="grid" id="sg"></div><div class="loading-screen" id="sL"><div class="spinner"></div><p>Searching...</p></div></div>`}
async function LS(){try{const r=await api('GET',`/api/search?q=${encodeURIComponent(state.query)}`);qs('#sL').style.display='none';G('sg',r)}catch(e){qs('#main').innerHTML=E(e.message)}}

function D(){return`<div class="detail"><button class="detail-back" onclick="navigate('home')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="loading-screen" id="dL"><div class="spinner"></div><p>Loading...</p></div></div>`}

async function LD(){
  const{id,type,title:t, year:y}=state.data
  const tHint = t || '';
  const yHint = y || '';
  try{
    const d=await api('GET',`/api/movie/${id}?type=${type}&title=${encodeURIComponent(tHint)}&year=${yHint}`)
    state.data._title=d.title||'';state.data._year=d.year||'';state.data._poster=d.poster||''
    if(d.type==='tv'||type==='tv'){const eps=await api('GET',`/api/show/${id}/episodes?title=${encodeURIComponent(d.title||'')}`);RD(d,null,eps)}
    else{const s=await api('GET',`/api/movie/${id}/sources?title=${encodeURIComponent(d.title||'')}&year=${d.year||''}&type=${type}`);RD(d,s,null)}
  }catch(e){qs('#dL').outerHTML=`<p style="color:var(--text2);padding:20px">${esc(e.message)}</p>`}
}

let selectedSeason=1,selectedEpisode=1

async function loadEpisodeSources(id,season,episode){
  const title=state.data?._title||'';const year=state.data?._year||''
  const list=qs('#sl');if(!list)return
  list.innerHTML='<div class="loading-screen" style="padding:16px"><div class="spinner"></div><p>Searching...</p></div>'
  const q = `S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
  let sources=null
  // Try backend
  try{sources=await api('GET',`/api/show/${id}/sources?title=${encodeURIComponent(title)}&year=${year}&type=tv&season=${season}&episode=${episode}&_=${Date.now()}`)}catch{}
  // Fallback: Torrentio directly from browser
  if(!sources||!sources.length){
    try{
      const r=await fetch(`https://torrentio.strem.fun/stream/series/${id}:${season}:${episode}.json`);
      const d=await r.json();
      if(d?.streams)sources=d.streams.map(x=>{
          const t=x.title||'';
          const seedM=t.match(/👤\s*(\d+)/);
          const sizeM=t.match(/💾\s*([\d.]+)\s*(GB|MB)/);
          return {
            provider:'Torrentio',
            quality:t.includes('4K')?'4K':t.includes('1080')?'1080p':t.includes('720')?'720p':'Unknown',
            size:sizeM?sizeM[1]+' '+sizeM[2]:'',
            seeds:seedM?parseInt(seedM[1]):0,peers:0,hash:x.infoHash,fileIndex:x.fileIdx||0,
            magnet:`magnet:?xt=urn:btih:${x.infoHash}`,
          };
        });
    }catch{}
  }
  if(!sources||!sources.length){list.innerHTML=`<p style="color:var(--text3);font-size:14px;padding:8px 0">No sources for ${title} ${q}.</p>`;return}
  sources.sort((a,b)=>(b.seeds||0)-(a.seeds||0))
  list.innerHTML=sources.map(src=>{
    const dead = (src.seeds||0) === 0 && (src.peers||0) === 0
    return `<div class="source-item${dead?' dead-source':''}"><div class="source-info"><span class="source-quality">${src.quality}</span><span class="source-size">${fmt(src.size)}</span><span class="source-seeds">⬆ ${src.seeds||0}</span><span class="source-peers">⬇ ${src.peers||0}</span><span style="color:var(--text3);font-size:11px">${src.provider||''}</span></div><button class="source-play" onclick="play('${src.hash}',${src.fileIndex||0},'${esc(title)} ${q}','${src.quality}',${src.seeds||0})">${dead?'⚠ Try':'▶ Play'}</button>${dead?'<span style="font-size:11px;color:var(--text3);margin-left:8px">0 seeds</span>':''}</div>`
  }).join('')
}

function RD(d,sources,episodes){
  const t=d.title||'Unknown';const y=d.year||'';const rt=d.runtime?`${Math.floor(d.runtime/60)}h ${d.runtime%60}m`:'';const r=d.rating?d.rating.toFixed(1):'';const o=d.overview||'No overview available.';const g=d.genres||[];const c=d.cast&&d.cast.length?d.cast.join(', '):'';const isTv=episodes&&episodes.length>0
  document.title=`${t} · UnlockedMedia`
  const posterUrl=d.poster||''
  
  // Watchlist button
  let wlBtn=''
  if(token){
    wlBtn=`<button class="wl-btn" id="wlBtn" onclick="toggleWatchlist()">⏳ Loading...</button>`
    // Check watchlist status
    setTimeout(async()=>{
      try{const r=await api('GET',`/api/watchlist/check?id=${d.id}`);const b=qs('#wlBtn');if(b){b.textContent=r.inList?'✓ In Watchlist':'+ Watchlist';b.className='wl-btn'+(r.inList?' in-list':'')}}catch{}
    },50)
  }

  let episodeHTML=''
  if(isTv){
    // Restore saved season/episode from player, or default to first
    if (state._savedSeason && state._savedEpisode) {
      selectedSeason = state._savedSeason;
      selectedEpisode = state._savedEpisode;
      state._savedSeason = null;
      state._savedEpisode = null;
    } else {
      selectedSeason = episodes[0]?.season || 1;
      selectedEpisode = episodes[0]?.episodes?.[0]?.number || 1;
    }
    window._eps=episodes
    episodeHTML=`<div class="episode-picker"><div class="sources-title">Select Episode</div><div class="episode-controls"><select id="seasonSelect">${episodes.map(s=>`<option value="${s.season}">Season ${s.season} (${s.episodes.length} eps)</option>`).join('')}</select><select id="episodeSelect"></select></div><div id="episodeInfo" class="episode-info"></div><div class="sources-section" style="margin-top:12px"><div class="sources-title">Sources</div><div class="sources-list" id="sl"><div class="loading-screen" style="padding:12px"><div class="spinner"></div></div></div></div></div>`
  }

  qs('#dL').outerHTML=`<div class="detail-hero"><div class="detail-poster">${posterUrl?`<img src="${posterUrl}" alt="${esc(t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=placeholder style=padding:80px;text-align:center;color:var(--text3);font-size:48px>🎬</div>'">`:'<div class="placeholder" style="padding:80px;text-align:center;color:var(--text3);font-size:48px">🎬</div>'}</div><div class="detail-info"><h1 class="detail-title">${esc(t)}</h1><div class="detail-meta">${y?`<span>📅 ${y}</span>`:''}${rt?`<span>⏱ ${rt}</span>`:''}</div><div class="detail-genres">${g.map(x=>`<span>${x}</span>`).join('')}</div>${r?`<div class="detail-rating"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${r}/10</div>`:''}${wlBtn?`<div style="margin-top:12px">${wlBtn}</div>`:''}<p class="detail-overview">${esc(o)}</p>${c?`<p class="detail-cast"><strong>Stars:</strong> ${esc(c)}</p>`:''}${episodeHTML||`<div class="sources-section"><div class="sources-title">Available Sources</div><div class="sources-list" id="sl"></div></div>`}</div></div>`

  if(isTv){
    const initEpisodes = () => {
      const ss = qs('#seasonSelect');
      if (!ss) { setTimeout(initEpisodes, 100); return; }
      ss.onchange = function() { fillEpisodes(true); };
      fillEpisodes();
    };
    setTimeout(initEpisodes, 50);
  }else{
    const list=qs('#sl')
    if(!sources||!sources.length){if(list)list.innerHTML='<p style="color:var(--text3);font-size:14px;padding:8px 0">No sources found.</p>';return}
    if(list){
          }
    if(list)list.innerHTML=sources.map(s=>{
      const dead = (s.seeds||0) === 0 && (s.peers||0) === 0
      return `<div class="source-item${dead?' dead-source':''}"><div class="source-info"><span class="source-quality">${s.quality}</span><span class="source-size">${fmt(s.size)}</span><span class="source-seeds">⬆ ${s.seeds||0}</span><span class="source-peers">⬇ ${s.peers||0}</span><span style="color:var(--text3);font-size:11px">${s.provider||''}</span></div><button class="source-play" onclick="play('${s.hash}',${s.fileIndex||0},'${esc(t)}','${s.quality}',${s.seeds||0})">${dead?'⚠ Try':'▶ Play'}</button>${dead?'<span style="font-size:11px;color:var(--text3);margin-left:8px">0 seeds</span>':''}</div>`
    }).join('')
  }
}

async function toggleWatchlist(){
  const id=state.data?.id;if(!id)return
  const btn=qs('#wlBtn');if(!btn)return
  const wasIn=btn.textContent.includes('In')||btn.textContent.includes('✓')
  btn.textContent='...'
  try{
    if(wasIn){await api('POST','/api/watchlist/remove',{id});btn.textContent='+ Watchlist';btn.className='wl-btn'}
    else{await api('POST','/api/watchlist/add',{id,title:state.data._title||'',poster:state.data._poster||'',type:state.data.type||'movie'});btn.textContent='✓ In Watchlist';btn.className='wl-btn in-list'}
  }catch{btn.textContent='Error';btn.className='wl-btn'}
}

function fillEpisodes(isSeasonChange){
  const eps=window._eps;if(!eps)return
  const ss=qs('#seasonSelect');if(!ss)return
  const season=parseInt(ss.value)
  const epData=eps.find(s=>s.season===season)
  if(!epData)return
  const es=qs('#episodeSelect')
  if(!es)return
  
  // Populate episode dropdown
  es.innerHTML=epData.episodes.map(e=>`<option value="${e.number}">${e.number}. ${esc(e.name)}${e.airdate?' ('+e.airdate+')':''}</option>`).join('')
  
  // When season changes or current episode not in new season, reset to first
  if(isSeasonChange || !epData.episodes.some(e=>e.number===selectedEpisode)){
    selectedEpisode = epData.episodes[0]?.number || 1
  }
  
  es.value = selectedEpisode
  es.onchange=function(){selectedEpisode=parseInt(this.value);updateEpisodeInfo();loadEpisodeSources(state.data.id,season,selectedEpisode)}
  
  selectedSeason=season
  updateEpisodeInfo()
  // Force fresh source load with cache buster
  loadEpisodeSources(state.data.id, season, selectedEpisode)
}
function updateEpisodeInfo(){const eps=window._eps;if(!eps)return;const epData=eps.find(s=>s.season===selectedSeason);if(!epData)return;const ep=epData.episodes.find(e=>e.number===selectedEpisode);const info=qs('#episodeInfo');if(info&&ep)info.innerHTML=ep.summary?`<p style="font-size:13px;color:var(--text2);margin-top:8px">${esc(ep.summary.slice(0,300))}</p>`:''}

async function play(hash,fi,title,quality,seeds){
  if (seeds !== undefined && seeds === 0 && state.mode === 'backend' && !confirm('This source has 0 seeders — likely dead. Try a different source?')) return;
  state._savedSeason = selectedSeason;
  state._savedEpisode = selectedEpisode;
  state.view='player'
  state._dlId = null;
  qs('#app').innerHTML='<div class="player-container"><button class="player-back" onclick="cp()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="player-wrapper" id="pw"><div class="player-loading" id="pl"><div class="spinner"></div><p>Connecting to stream...</p><span class="player-progress-text" id="ps">Initializing</span></div><video id="player" style="display:none;width:100%;height:100%;background:#000"></video><div id="customControls" style="display:none;position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.9));padding:40px 16px 8px;z-index:5"><div style="display:flex;align-items:center;gap:10px;width:100%"><button id="ppBtn" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%">▶</button><span id="timeDisplay" style="color:#ccc;font-size:13px;font-family:monospace;white-space:nowrap">0:00 / 0:00</span><div style="flex:1;height:6px;background:rgba(255,255,255,.15);border-radius:3px;cursor:pointer;position:relative" id="seekBar"><div id="seekFill" style="height:100%;width:0%;background:var(--primary);border-radius:3px;pointer-events:none"></div><div id="seekThumb" style="display:none;position:absolute;top:-3.5px;width:13px;height:13px;border-radius:50%;background:var(--primary);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 4px rgba(0,0,0,.5)"></div></div><div style="display:flex;align-items:center;gap:6px"><button id="volBtn" style="background:var(--primary);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></button><input type="range" id="volSlider" min="0" max="1" step="0.05" value="1" style="width:50px;height:4px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.2);border-radius:2px;outline:none;cursor:pointer" /></div><button id="fsBtn" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button></div></div></div></div>'

  if(state.mode==='backend'){
    const base=state.backendUrl||''
    const video=qs('#player')
    video.muted=false;video.volume=1;
    video.src=`${base}/api/stream/${hash}?fileIndex=${fi}`;
    initCustomPlayer(video,base);
  } else {
    perr('Streaming requires a backend server. Set your Render URL in Settings.');
  }
}

async function browserTorrent(hash,title){
  const ps=qs('#ps');if(!ps)return
  try{
    if(!wt)wt=new WebTorrent()
    // Avoid duplicate by reusing existing torrent
    const existing=wt.torrents?.find(t=>t.infoHash?.toLowerCase()===hash.toLowerCase());
    if(existing){await playTorrentFile(existing,ps);return;}
    const tor=wt.add(mag(hash,title));ps.textContent='Connecting...'
    tor.on('warning',e=>ps.textContent=e.message);
    tor.on('wire',()=>ps.textContent=`${tor.numPeers} peer(s)`);
    tor.on('download',()=>ps.textContent=`⬇ ${(tor.downloadSpeed/1e6).toFixed(1)} MB/s · ${(tor.progress*100).toFixed(0)}%`);
    await playTorrentFile(tor,ps);
  }catch(e){perr(e.message)}
}
async function playTorrentFile(tor,ps){
  if(tor.files?.length){ps.textContent='Starting...';return renderFile(tor,ps);}
  await new Promise((resolve,reject)=>{
    tor.on('metadata',()=>{if(tor.files?.length)resolve();});
    setTimeout(()=>reject(new Error('No metadata')),30000);
  });
  renderFile(tor,ps);
}
function renderFile(tor,ps){
  const file=tor.files?.find(x=>/\.(mp4|mkv|webm|avi|mov)$/i.test(x.name))||tor.files?.[0];
  if(!file)return perr('No video file');
  ps.textContent=`Playing ${file.name}...`;
  file.renderTo('#player',{autoplay:true,controls:true},(err)=>{if(err)perr('Error: '+err.message);else{const v=qs('#player');if(v){v.style.display='block';v.removeAttribute('controls')}}});
}

function initCustomPlayer(video, baseUrl){
  const cc = qs('#customControls');
  if (cc) cc.style.display = '';
  const pp = qs('#ppBtn');
  const seek = qs('#seekBar');
  const fill = qs('#seekFill');
  const thumb = qs('#seekThumb');
  const timeD = qs('#timeDisplay');
  const volBtn = qs('#volBtn');
  const volSlider = qs('#volSlider');
  const fs = qs('#fsBtn');

  // Audio context — unlock on first interaction
  let audioCtx, audioSrc;
  function unlockAudio() {
    if (audioSrc || !video) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioSrc = audioCtx.createMediaElementSource(video);
      audioSrc.connect(audioCtx.destination);
      audioCtx.resume();
    } catch {}
    video.muted = false;
    video.volume = parseFloat(volSlider?.value || '1');
    video.play().catch(() => {});
  }

  // Wait for full file to load before enabling interaction
  let seekEnabled = false;
  video.oncanplay = () => {
    qs('#pl').style.display='none';
    video.style.display='block';
    qs('#customControls').style.display='flex';
    unlockAudio();
    video.play().catch(() => {});
  };
  video.onplaying = () => { qs('#pl').style.display='none'; video.style.display='block'; qs('#customControls').style.display='flex'; };

  // Play/pause
  pp.onclick = () => {
    if (video.paused) { video.play(); pp.textContent = '⏸'; }
    else { video.pause(); pp.textContent = '▶'; }
  };
  video.onplay = () => { pp.textContent = '⏸'; };
  video.onpause = () => { pp.textContent = '▶'; };
  video.onended = () => { pp.textContent = '▶'; };

  // Time display + seek bar + progress save
  video.ontimeupdate = () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (fill) fill.style.width = pct + '%';
    if (thumb) { thumb.style.display = ''; thumb.style.left = pct + '%'; }
    if (timeD) timeD.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
    if (token && state.data?.id) {
      clearTimeout(window._saveTimer);
      window._saveTimer = setTimeout(async () => {
        try { await fetch(`${baseUrl}/api/progress/save`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({id:state.data.id,title:state.data._title||'',poster:state.data._poster||'',type:state.data.type||'movie',duration:Math.round(video.duration),watched:Math.round(video.currentTime),status:video.currentTime/video.duration>0.9?'watched':'watching'}) }); } catch {}
      }, 5000);
    }
  };

  // Seek — disabled during stream, enabled after full download
  let seeking = false;
  function doSeek(clientX) {
    if (!video.duration || !seekEnabled) return;
    const rect = seek.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
  }
  seek.title = seekEnabled ? 'Seek' : 'Seeking available after download completes';
  seek.onmousedown = (e) => { if (!seekEnabled) return; seeking = true; doSeek(e.clientX); };
  seek.onmousemove = (e) => { if (seeking) doSeek(e.clientX); };
  document.addEventListener('mouseup', () => { seeking = false; });
  seek.addEventListener('touchstart', (e) => { if (!seekEnabled) return; seeking = true; doSeek(e.touches[0].clientX); }, {passive:true});
  seek.addEventListener('touchmove', (e) => { if (seeking) doSeek(e.touches[0].clientX); }, {passive:true});
  seek.addEventListener('touchend', () => { seeking = false; });

  // Expose method for download completion to enable seeking
  video._enableSeek = () => { seekEnabled = true; seek.title = 'Seek'; seek.style.cursor = 'pointer'; };

  // Volume slider + SVG button
  const volSvg = volBtn.querySelector('svg');
  volSlider.addEventListener('input', () => {
    const v = parseFloat(volSlider.value);
    video.volume = v;
    video.muted = (v === 0);
    updateVolIcon();
  });
  volBtn.onclick = () => {
    video.muted = !video.muted;
    if (!video.muted) volSlider.value = video.volume;
    updateVolIcon();
  };
  video.onvolumechange = () => {
    volSlider.value = video.muted ? 0 : video.volume;
    updateVolIcon();
  };
  function updateVolIcon() {
    if (!volSvg) return;
    if (video.muted || video.volume === 0) {
      volSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13 0l-1.5 1.5L16 12l-1.5 1.5L16 15l1.5-1.5L19 12l1.5 1.5L22 12l-1.5-1.5L22 9l-1.5 1.5L19 9l-1.5 1.5L16 9z"/>';
    } else if (video.volume < 0.5) {
      volSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13 1.5L14.5 12l1.5 1.5V10.5z"/>';
    } else {
      volSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  // Fullscreen
  fs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.body.requestFullscreen();
  };

  // Retry autoplay on any click (handles strict autoplay policies)
  document.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); }, { once: true });
}

function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function perr(msg){
  const pw=qs('#pw');
  if(pw)pw.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center"><p style="color:#f87171;font-size:16px">${esc(msg)}</p><button class="play-btn" onclick="cp()">Go Back</button></div>`;
}
function cp(){if(state.player){state.player=null}if(wt){try{wt.destroy()}catch{}wt=null};if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;qs('#app').innerHTML='<main id="main"><div class="loading-screen" id="loadingScreen"><div class="spinner"></div><p>Loading...</p></div></main>';render()}else location.reload()}

function G(id,items){
  const el=qs(`#${id}`)
  if(!items||!items.length){el.innerHTML='';return}
  el.innerHTML=items.map(i=>{
    const p=img(i.poster);const t=title(i);const y=year(i);const r=rating(i);const tp=i.type==='tv'?'TV':'Movie'
    const progress=i.progress?`<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(i.progress*100,100)}%"></div></div>`:''
    return `<div class="card" onclick="navigate('detail',{id:'${i.id}',type:'${tp==='TV'?'tv':'movie'}',title:'${esc(title(i))}',year:'${year(i)}'})"><div class="card-poster">${p?`<img src="${p}" alt="${esc(t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=placeholder>🎬</div>'">`:'<div class="placeholder">🎬</div>'}<span class="card-type">${tp}</span></div><div class="card-body"><h3 title="${esc(t)}">${esc(t)}</h3><div class="card-meta">${y?`<span>${y}</span>`:''}${r?`<span class="card-rating"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${r}</span>`:''}</div>${progress}</div></div>`
  }).join('')
}

function E(m){return`<div class="error-view"><h2>Something went wrong</h2><p>${esc(m)}</p><button class="play-btn" onclick="location.reload()">Try Again</button></div>`}

/* AUTH */
function showAuth(){qs('#auth-modal').style.display='flex'}
function hideAuth(){qs('#auth-modal').style.display='none'}
let authMode='signin'
async function doAuth(){
  const username=qs('#authUsername').value.trim();const pass=qs('#authPassword').value
  if(!username||!pass)return
  const body={username,password:pass}
  if(authMode==='signup'){const email=qs('#authEmail').value.trim();if(email)body.email=email}
  try{
    const r=await api('POST',authMode==='signup'?'/api/auth/signup':'/api/auth/signin',body)
    if(r.token){localStorage.setItem('um_token',r.token);token=r.token;state.user=r.user}
    hideAuth();render()
  }catch(e){qs('#authError').textContent=e.message}
}
function toggleAuthMode(){authMode=authMode==='signin'?'signup':'signin';qs('#authModalTitle').textContent=authMode==='signin'?'Sign In':'Sign Up';qs('#authToggle').innerHTML=authMode==='signin'?'Don\'t have an account? <a href="#" onclick="toggleAuthMode();return false">Sign Up</a>':'Already have an account? <a href="#" onclick="toggleAuthMode();return false">Sign In</a>';qs('#emailField').style.display=authMode==='signup'?'block':'none';qs('#pwWarning').style.display='block';qs('#authError').textContent=''}
function signOut(){localStorage.removeItem('um_token');token='';state.user=null;render()}

function restoreFromHash(){
  const hash=window.location.hash.slice(1)
  if(!hash||hash==='/'||hash===''){state.view='home';return}
  const params=new URLSearchParams(hash)
  if(params.has('q')){state.query=params.get('q');state.view='search'}
  else if(params.has('id')){state.view='detail';state.data={id:params.get('id'),type:params.get('type')||'movie',title:params.get('t')||'',year:params.get('y')||''}}
  else state.view='home'
}

/* INIT */
async function init(){
  try {
    await detect()
    const badge=qs('#modeBadge');if(badge){badge.textContent='[WIP]';badge.className='mode-badge';badge.style.display='inline-block'}
    if(state.mode==='standalone'&&!navigator.onLine){qs('#setup').style.display='flex';return}
    qs('#setup').style.display='none'
    // Token check — don't block render if it fails
    if(token){try{const u=await api('GET','/api/auth/user');state.user=u}catch{localStorage.removeItem('um_token');token=''}}
    restoreFromHash()
    if(state.view==='search'&&state.query)qs('#searchInput').value=state.query
    render()
  } catch(e) {
    console.error('Init error:', e);
    const main=qs('#main');
    if(main) main.innerHTML='<div class="error-view"><h2>Failed to load</h2><p>'+esc(e.message||'Unknown error')+'</p><button class="play-btn" onclick="location.reload()">Retry</button></div>';
  }
}

let st
qs('#searchInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){navigate('home');return};st=setTimeout(()=>{state.query=q;navigate('search')},300)})
qs('#searchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(st);const q=this.value.trim();if(q){state.query=q;navigate('search')}}})
init();
