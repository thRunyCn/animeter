/* Two builds share this file: the claude.ai artifact (hash routes, built-in db) and the standalone
   web/ site (one static page per route, data.js + config.js alongside, Supabase for reports). */
const STATIC = !!window.ANIMETER;
const SERIES = STATIC ? window.ANIMETER.series : /*SERIES*/[];
const DETAILS = STATIC ? window.ANIMETER.details : /*DETAILS*/{};
const FETCHED = STATIC ? window.ANIMETER.fetched : /*FETCHED*/"";
const ROOT = STATIC ? (document.body.dataset.root || "") : "";
const homeHref = () => STATIC ? (ROOT || "./") : "#";
const profileHref = () => STATIC ? `${ROOT}profile/` : "#profile";
const STATUSES = [["watching","Watching"],["completed","Completed"],["planned","Plan to watch"],["dropped","Dropped"]];
const seriesHref = (id, tab) => { const t = tab && tab!=="overview" ? tab : "";
  return STATIC ? `${ROOT}${id}/${t ? t+"/" : ""}` : `#${id}${t ? "."+t : ""}`; };
const byId = Object.fromEntries(SERIES.map(s=>[s.id,s]));
const M_MIN = 5, PER_PAGE = 25;
const TABS = [["overview","Overview"],["seasons","Seasons"],["arcs","Arcs"],["events","Key events"],["filler","Filler"],["manga","Manga"]];
let sortBy = "anilist", view = "list", query = "", page = 1, spoilers = false;
let reports = {}, myId = null, db = null, canWrite = true, dbState = "loading";
try { const v = localStorage.getItem("view"); if (v==="list"||v==="wall") view = v; } catch(_) {}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt10 = n => (Math.round(n*10)/10).toFixed(1);
const rangeTxt = r => !r || r[0]==null ? "" : r[1]==null ? `${r[0]}+` : r[0]===r[1] ? String(r[0]) : `${r[0]}–${r[1]}`;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function coverHTML(s, kind, tag, extra=""){
  return `<div class="cover" style="--tone:${s.tone||'#4a5160'}">
    <img src="${ROOT}covers/${s.id}-${kind}.jpg" alt="" loading="lazy" onerror="this.parentNode.classList.add('nocover')">
    <div class="ph" aria-hidden="true"><b>${esc(s.title)}</b></div>${extra}
    ${tag?`<span class="tag">${tag}</span>`:""}</div>`;
}
const hasSeasons = s => (s.run?.length||0) > 1 || !!s.extras?.length;
const tabShown = (s, k) => k==="seasons" ? hasSeasons(s) : !s.unchecked || k==="overview" || k==="manga";
const handoffShort = s => s.unchecked && (s.kind==="manga"||s.kind==="novel") ? "Not checked" : s.next ? (s.unitShort||"Ch. ")+s.next : ({original:"Original",vn:"VN",novel:"Novel"}[s.kind]||"Adapted");

/* ---------- routing: "" = rankings, "#id" = series overview, "#id.tab" = series tab ---------- */
function route(){
  const h = STATIC ? (document.body.dataset.route || "") : decodeURIComponent((location.hash||"").slice(1));
  if (h === "profile") return {id:null, profile:true};
  const [id, tab] = h.split(".");
  if (byId[id]) return {id, tab: TABS.some(t=>t[0]===tab) && tabShown(byId[id], tab) ? tab : "overview"};
  return {id:null};
}
function go(hash){ if (location.hash !== hash) location.hash = hash; else render(); }
if (STATIC) window.addEventListener("hashchange", ()=>{ if (/access_token|error_description/.test(location.hash) && SB.supabaseUrl){ const err = sbFromLink(); render();
  const n = err && document.getElementById("snote"); if (n) n.textContent = "That sign-in link didn't work (" + err + "). Ask for a new one."; } });
if (!STATIC) window.addEventListener("hashchange", ()=>{ render(); window.scrollTo({top:0, behavior:"auto"}); });

/* ---------- aggregates from visitor reports ---------- */
function stats(id){
  const s = byId[id], N = s.eps, clicked = new Array(N+1).fill(0), stopped = new Array(N+1).fill(0);
  let n=0, never=0, clickList=[], ratings=[];
  for (const uid in reports){
    const r = reports[uid] && reports[uid][id]; if (!r) continue;
    if (Number.isInteger(r.rating) && r.rating>=1 && r.rating<=10) ratings.push(r.rating);
    if (r.clicked==null && r.stopped==null) continue;
    n++;
    if (r.clicked === "never") never++;
    else if (Number.isInteger(r.clicked) && r.clicked>=1 && r.clicked<=N){ clicked[r.clicked]++; clickList.push(r.clicked); }
    // A stop from someone whose list says "Watching" is where they are now, not a drop.
    if (Number.isInteger(r.stopped) && r.stopped>=1 && r.stopped<=N && r.status!=="watching") stopped[r.stopped]++;
  }
  clickList.sort((a,b)=>a-b);
  const median = clickList.length ? clickList[Math.floor((clickList.length-1)/2)] : null;
  const dropTotal = stopped.reduce((a,b)=>a+b,0);
  let peak = null; stopped.forEach((v,i)=>{ if(v && (peak===null || v>stopped[peak])) peak=i; });
  const avg = ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : null;
  return {n, never, clicked, stopped, median, dropTotal, peak, votes:ratings.length, avg};
}
let _site = null;
function siteScores(){
  if (_site) return _site;
  const all = SERIES.map(s=>({id:s.id, ...stats(s.id)}));
  const total = all.reduce((t,a)=>t+a.votes,0), sum = all.reduce((t,a)=>t+(a.votes?a.avg*a.votes:0),0);
  const C = total ? sum/total : 0, out = {};
  all.forEach(a=>{ out[a.id] = {votes:a.votes, avg:a.avg, wr: a.votes ? (a.votes/(a.votes+M_MIN))*a.avg + (M_MIN/(a.votes+M_MIN))*C : null}; });
  return _site = out;
}

/* ---------- rankings (home) ---------- */
function ranked(){
  const site = siteScores();
  const items = SERIES.map(s=>({s, site:site[s.id]}));
  const key = {anilist: x => x.s.score ?? -1, site: x => x.site.wr ?? -1, popular: x => x.s.popularity ?? -1}[sortBy];
  items.sort((a,b)=> key(b)-key(a) || (b.s.score??0)-(a.s.score??0) || a.s.title.localeCompare(b.s.title));
  items.forEach((x,i)=>x.rank=i+1);
  const q = query.trim().toLowerCase();
  return q ? items.filter(x=>x.s.title.toLowerCase().includes(q) || (x.s.jp||"").includes(q)) : items;
}
let homeWired = false;                    // prerendered pages arrive with #rk already in place, unwired
function renderHome(){
  const app = document.getElementById("app");
  if (!homeWired || !document.getElementById("rk")){
    homeWired = true;
    app.innerHTML = `
      <header class="mast"><h1><a href="${homeHref()}">Ani<span class="num">meter</span></a></h1><a class="back melink" href="${profileHref()}">My list</a></header>
      <section id="rankings">
        <div class="rk-head">
          <h2>Rankings</h2>
          <div class="controls">
            <input type="search" id="q" placeholder="Find a series" aria-label="Find a series" value="${esc(query)}">
            <div class="seg" role="group" aria-label="Rank by">
              <button type="button" data-sort="anilist">AniList</button>
              <button type="button" data-sort="site">Animeter</button>
              <button type="button" data-sort="popular">Popular</button>
            </div>
            <div class="seg" role="group" aria-label="View">
              <button type="button" data-view="list">List</button>
              <button type="button" data-view="wall">Covers</button>
            </div>
          </div>
        </div>
        <p class="rk-basis" id="basis"></p>
        <div id="rk"></div>
        <nav class="pager" id="pager" aria-label="Pages"></nav>
      </section>`;
    document.getElementById("q").addEventListener("input", e=>{ query=e.target.value; page=1; renderRankings(); });
    app.querySelectorAll("[data-sort]").forEach(b=>b.addEventListener("click", ()=>{ sortBy=b.dataset.sort; page=1; renderRankings(); }));
    app.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; try{localStorage.setItem("view",view)}catch(_){}; renderRankings(); }));
    document.getElementById("pager").addEventListener("click", e=>{
      const b = e.target.closest("button[data-page]"); if (!b || b.disabled) return;
      page = Number(b.dataset.page); renderRankings();
      document.getElementById("rankings").scrollIntoView({behavior: reduceMotion()?"auto":"smooth", block:"start"});
    });
  }
  renderRankings();
}
function renderRankings(){
  const all = ranked(), site = siteScores();
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const items = all.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const anyVotes = Object.values(site).some(v=>v.votes);
  document.getElementById("basis").textContent = {
    anilist: "Ordered by AniList's average user score.",
    site: anyVotes ? `Ordered by Animeter ratings from visitors, weighted so a series needs about ${M_MIN} votes before it can top the list (the IMDb method). Unrated series sit at the bottom.` : "No Animeter ratings yet. Open a series and rate it 1 to 10 to start this list.",
    popular: "Ordered by how many AniList users have the series on their list.",
  }[sortBy];
  document.querySelectorAll("[data-sort]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.sort===sortBy));
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.view===view));
  const box = document.getElementById("rk");
  if (!items.length){ box.innerHTML = `<div class="none">No series matches "${esc(query)}".</div>`; document.getElementById("pager").innerHTML=""; return; }
  const chip = s => `<span class="chip ${s.next?'b':'k'}">${esc(handoffShort(s))}</span>`;
  if (view==="list"){
    box.innerHTML = `<div class="hdr label"><span>#</span><span></span><span>Series</span><span>AniList</span><span class="site">Animeter</span><span class="ch">Manga</span></div><div class="list">` + items.map(({s,site,rank})=>`
      <a class="row" href="${seriesHref(s.id)}">
        <span class="rank">${rank}</span>
        ${coverHTML(s,"anime")}
        <span style="min-width:0"><span class="t">${esc(s.title)}</span><br><span class="meta">${[s.year, (s.genres||[]).slice(0,2).join(", ")].filter(Boolean).map(esc).join(" · ")}</span></span>
        <span class="sc gold"><b>${s.score?fmt10(s.score/10):"—"}</b></span>
        <span class="sc site"><b>${site.votes?fmt10(site.avg):"—"}</b><small>${site.votes} vote${site.votes===1?"":"s"}</small></span>
        <span class="ch">${chip(s)}</span>
      </a>`).join("") + `</div>`;
  } else {
    box.innerHTML = `<div class="wall">` + items.map(({s,site,rank})=>`
      <a class="card" href="${seriesHref(s.id)}">
        ${coverHTML(s,"anime","",`<span class="rk">${rank}</span>`)}
        <span class="t">${esc(s.title)}</span>
        <span class="m">${chip(s)}<span>${sortBy==="site" ? (site.votes?"★ "+fmt10(site.avg):"") : (s.score?"★ "+fmt10(s.score/10):"")}</span></span>
      </a>`).join("") + `</div>`;
  }
  const nums = [];
  for (let p=1;p<=pages;p++) if (p===1 || p===pages || Math.abs(p-page)<=1) nums.push(p); else if (nums.at(-1)!=="…") nums.push("…");
  document.getElementById("pager").innerHTML = pages<2 ? "" :
    `<button type="button" data-page="${page-1}" ${page===1?"disabled":""} aria-label="Previous page">←</button>` +
    nums.map(p=> p==="…" ? `<span class="info">…</span>` : `<button type="button" data-page="${p}" ${p===page?'aria-current="page"':""}>${p}</button>`).join("") +
    `<button type="button" data-page="${page+1}" ${page===pages?"disabled":""} aria-label="Next page">→</button>` +
    `<span class="info">${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE, all.length)} of ${all.length}</span>`;
}

/* ---------- series page ---------- */
function myProgress(s, mine){               // "You stopped at episode 24 (season 1, ep 24): 24 of 87 episodes, 28%."
  const n = Number.isInteger(mine.stopped) ? mine.stopped : null;
  if (n) return `Your report: you stopped at ${epName(s, n)}, ${n} of ${s.eps} episodes (${Math.round(n/s.eps*100)}%).`
    + (mine.status==="watching" ? " Your list says Watching, so it counts as where you are, not a drop." : n < s.eps ? " Still watching? Set My list to Watching and it won't count as a drop." : "");
  if (mine.stopped==="no") return "Your report: you didn't stop.";
  return "";
}
function epName(s, n){                      // "episode 28 (season 2, ep 3)" for multi-season runs
  const i = s.run?.length > 1 ? s.run.findIndex(r=>n>=r.from && n<r.from+r.e) : -1;
  return i<0 ? `episode ${n}` : `episode ${n} (season ${i+1}, ep ${n-s.run[i].from+1})`;
}
function paneSeasons(s){
  const run = s.run || [], ex = s.extras || [];
  const fmtName = f => ({TV:"TV",TV_SHORT:"TV short",ONA:"Web",MOVIE:"Film",OVA:"OVA",SPECIAL:"Special"}[f]||f);
  return `<h3>${run.length > 1 ? `${run.length} seasons, ${s.eps} episodes` : "Watch order"}</h3>
    <p class="sub">In airing order. Episode numbers on this site count straight through every season, so season 2 starts at episode ${run[1]?.from ?? "—"}.</p>
    <div class="arcs">${run.map((r,i)=>`
      <div class="arc"><span class="no">${i+1}</span>
        <div style="min-width:0"><span class="part">${esc([r.y, fmtName(r.f)].filter(Boolean).join(" · "))}${r.airing?' · <b class="p">Airing</b>':""}</span><h4>${esc(r.t)}</h4></div>
        <div class="rng"><span class="label">Episodes</span><b class="mono">${r.from}–${r.from+r.e-1}</b><span class="label">${r.e} ep${r.airing?" so far":""}</span></div>
      </div>`).join("")}</div>
    ${ex.length ? `<h3 style="margin-top:30px">Films, OVAs and specials</h3><p class="sub">Not counted in the episode numbers above.</p>
      <div class="arcs">${ex.map(x=>`<div class="arc"><span class="no">·</span><div style="min-width:0"><span class="part">${esc([x.y, fmtName(x.f)].filter(Boolean).join(" · "))}</span><h4>${esc(x.t)}</h4></div><div class="rng"></div></div>`).join("")}</div>` : ""}
    ${srcHTML([["AniList", run[0]?.url || ""]].filter(x=>x[1]))}`;
}
function chartSVG(s, st){
  const W=720, H=210, padL=28, padR=10, mid=104, h=78;
  const bin = Math.max(1, Math.ceil(s.eps/150)), eps = Math.ceil(s.eps/bin), bw=(W-padL-padR)/eps;
  if (bin > 1){                               // long runs: one bar per `bin` episodes
    const fold = a => Array.from({length:eps+1},(_,b)=> b===0 ? 0 : a.slice((b-1)*bin+1, b*bin+1).reduce((x,y)=>x+y,0));
    st = {...st, clicked: fold(st.clicked), stopped: fold(st.stopped)};
  }
  const max = Math.max(1, ...st.clicked, ...st.stopped);
  let g = `<line x1="${padL}" x2="${W-padR}" y1="${mid}" y2="${mid}" stroke="var(--ink)" stroke-width="2"/>`;
  if (eps>=3 && bin===1){ const x = padL + 3*bw; g += `<line x1="${x}" x2="${x}" y1="14" y2="${H-22}" stroke="var(--ink-soft)" stroke-dasharray="3 3"/><text x="${x+4}" y="22">3-episode mark</text>`; }
  (s.run||[]).slice(1).forEach((r,i)=>{ if (s.run.length > 12) return; const x = padL + (r.from-1)/bin*bw;
    g += `<line x1="${x}" x2="${x}" y1="14" y2="${H-22}" stroke="var(--rule)" stroke-width="1"/><text x="${x+3}" y="${H-24}">S${i+2}</text>`; });
  for (let e=1;e<=eps;e++){
    const x = padL + (e-1)*bw + bw*0.12, w = Math.max(1, bw*0.76), c = st.clicked[e], d = st.stopped[e];
    const lab = bin>1 ? `Eps ${(e-1)*bin+1}–${Math.min(e*bin, s.eps)}` : `Ep ${e}`;
    if (c) g += `<rect x="${x}" y="${mid - c/max*h}" width="${w}" height="${c/max*h}" fill="var(--blue)"><title>${lab}: ${c} said it clicked</title></rect>`;
    if (d) g += `<rect x="${x}" y="${mid+2}" width="${w}" height="${d/max*h}" fill="var(--pink)"><title>${lab}: ${d} stopped</title></rect>`;
  }
  const step = eps<=14?1: eps<=30?3: eps<=60?6: eps<=150?12: 30;
  for (let e=1;e<=eps;e++){ if (e===1 || e%step===0) g += `<text x="${padL+(e-0.5)*bw}" y="${H-6}" text-anchor="middle">${(e-1)*bin+1}</text>`; }
  g += `<text x="2" y="${mid-h+6}">${max}</text><text x="2" y="${mid+h}">${max}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Episodes where people said ${esc(s.title)} clicked (above the line) and where they stopped (below)">${g}</svg>`;
}
function timelineHTML(s){
  const end = s.total || Math.round((s.nextNum||s.seasons.at(-1).end) * 1.3);
  let prev = 0, segs = "", labels = `<span style="left:2%">1</span>`;
  s.seasons.forEach((se,i)=>{
    segs += `<div class="tl-seg${i%2?' alt':''}" style="left:${prev/end*100}%;width:${Math.max(0,se.end-prev)/end*100}%"></div>`;
    labels += `<span style="left:${Math.min(Math.max(se.end/end*100,8),92)}%">${se.end}</span>`;
    prev = Math.max(prev, se.end);
  });
  if (!s.total) segs += `<div class="tl-tail" style="left:${prev/end*100}%"></div>`;
  if (s.nextNum) segs += `<div class="tl-next" style="left:calc(${Math.min((s.nextNum-0.5)/end*100,99.5)}% - 1px)"></div>`;
  if (s.total && s.total !== prev) labels += `<span style="left:96%">${s.total} end</span>`;
  else if (!s.total) labels += `<span style="left:94%">ongoing</span>`;
  const key = s.seasons.map((se,i)=>`<span><i class="sw" style="background:var(${i%2?'--blue-2':'--blue'})"></i>${esc(se.l)}</span>`).join("")
    + (s.nextNum?`<span><i class="sw" style="background:var(--pink)"></i>Start reading here</span>`:"");
  return `<div class="tl"><div class="tl-track">${segs}</div><div class="tl-labels">${labels}</div><div class="key">${key}</div></div>`;
}
const srcHTML = src => src?.length ? `<div class="src">Sources: ${src.map(([t,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(", ")}</div>` : "";

function epKinds(d){
  // map episode -> "f" | "m" | "r" from filler data; return {total, kinds}
  const kinds = {}, f = d?.filler || {};
  const mark = (rs, k) => (rs||[]).forEach(([a,b])=>{ if (!Number.isInteger(a) || !Number.isInteger(b)) return; for (let e=a;e<=b;e++) kinds[e]=k; });
  mark(f.mixed,"m"); mark(f.recap,"r"); mark(f.filler,"f");
  let total = 0;
  (d?.arcs||[]).forEach(a=>{ if (a.eps && a.eps[1]!=null) total = Math.max(total, a.eps[1]); });
  ["filler","mixed","recap"].forEach(k=>(f[k]||[]).forEach(([,b])=>{ total = Math.max(total,b); }));
  return {total, kinds};
}

function paneOverview(s){
  if (s.eps < 3) return `<h3>Is it worth watching?</h3><p class="sub">The drop map is for series. Rate ${s.format==="MOVIE" ? "the film" : "it"} above to add to its Animeter score.</p>`;
  const st = stats(s.id), mine = (myId && reports[myId] && reports[myId][s.id]) || {};
  const opt = (n, label, sel) => `<option value="${n}" ${sel===n?"selected":""}>${label}</option>`;
  const epOpts = sel => s.run?.length > 1
    ? s.run.map((r,i)=>`<optgroup label="${esc(`Season ${i+1}: ${r.t}`)}">${Array.from({length:r.e},(_,k)=>opt(r.from+k, `S${i+1} E${k+1} · episode ${r.from+k}`, sel)).join("")}</optgroup>`).join("")
    : Array.from({length:s.eps},(_,i)=>opt(i+1, `Episode ${i+1}`, sel)).join("");
  const dmKey = `<div class="key"><span><i class="sw" style="background:var(--blue)"></i>It clicked for me here</span><span><i class="sw" style="background:var(--pink)"></i>I stopped watching here</span></div>`;
  const body = dbState==="loading" ? `<div class="empty"><b>Loading reports…</b>Checking what other people said about this one.</div>`
    : dbState==="off" ? `<div class="empty"><b>Reports aren't available in this view.</b>${STATIC ? (!SB.supabaseUrl ? "Voting isn't switched on yet. Check back soon." : sbErr===404 ? "Couldn't load reports: the reports table wasn't found (error 404)." : sbErr ? `Couldn't load reports (error ${sbErr}). Try again in a moment.` : "Couldn't reach the report server. Try again in a moment.") : "Sign in to claude.ai to see and add drop-map reports."}</div>`
    : st.n===0 ? `<div class="empty"><b>No reports yet.</b>Be the first: pick the episode where ${esc(s.title)} clicked for you, or where you gave up, and save.</div>`
    : `${dmKey}<div class="dm-stats">
        <div><span class="label">Reports</span><b class="mono">${st.n}</b></div>
        <div><span class="label">Clicks by</span><b class="b">${st.median ? "Ep "+st.median : "—"}</b></div>
        <div><span class="label">Dropped it</span><b class="p">${st.dropTotal}<small class="of"> of ${st.n}</small></b></div>
        <div><span class="label">Never clicked</span><b>${st.never}</b></div>
      </div><div class="chart">${chartSVG(s, st)}</div>`;
  const verdict = st.n < 5 ? (st.n ? `Not enough reports to call it yet (${st.n} so far).` : `Built from what visitors report across ${s.run?.length > 1 ? `all ${s.run.length} seasons (${s.eps} episodes)` : `all ${s.eps} episodes`}.`)
    : [st.median && `Half of the people who say it clicked felt it by ${epName(s, st.median)}.`, st.peak && `The most common place to stop is ${epName(s, st.peak)}.`].filter(Boolean).join(" ");
  const writable = STATIC ? !!(SB.supabaseUrl && myId) : dbState==="on" && canWrite;
  const form = !writable ? (STATIC && SB.supabaseUrl && !myId ? `<p class="note">Sign in with your email at the top of the page to add your report.</p>` : dbState!=="on" ? "" : STATIC && !myId ? `<p class="note">Sign in with your email at the top of the page to add your report.</p>` : `<p class="note">Your access lets you read reports but not add them.</p>`) : `
    <form class="vote" id="vote">
      <label for="clicked">It clicked for me at
        <select id="clicked"><option value="">Choose…</option><option value="never" ${mine.clicked==="never"?"selected":""}>It never clicked</option>${epOpts(mine.clicked)}</select></label>
      <label for="stopped">I stopped watching at
        <select id="stopped"><option value="">Choose…</option><option value="no" ${mine.stopped==="no"?"selected":""}>I didn't stop</option>${epOpts(mine.stopped)}</select></label>
      <button class="btn" type="submit" id="save">${mine.clicked||mine.stopped ? "Update my report" : "Save my report"}</button>
    </form><div class="note" id="note">${myProgress(s, mine)}</div>`;
  return `<h3>Is it worth pushing through?</h3><p class="sub">${esc(verdict)}</p><div class="dm">${body}</div>${form}`;
}
function paneArcs(s, d){
  if (!d?.arcs?.length) return `<div class="empty"><b>Arc guide coming soon.</b>We haven't finished the arc list for ${esc(s.title)} yet.</div>`;
  const {total, kinds} = epKinds(d);
  const fillerShare = a => { if (!a.eps || a.eps[0]==null || a.eps[1]==null) return 0; let f=0; for (let e=a.eps[0];e<=a.eps[1];e++) if (kinds[e]==="f") f++; return f/(a.eps[1]-a.eps[0]+1); };
  const withEps = d.arcs.filter(a=>a.eps && a.eps[0]!=null && a.eps[1]!=null);
  const bar = total && withEps.length ? `<div class="arcbar" aria-hidden="true">${withEps.map((a,i)=>{
      const fs = fillerShare(a); const cls = fs>=0.8 ? "f" : `c${i%2?' alt':''}`;
      return `<i class="${cls}" style="flex:${a.eps[1]-a.eps[0]+1}" title="${esc(a.name)}"></i>`; }).join("")}</div>
      <div class="key"><span><i class="sw" style="background:var(--blue)"></i>Story arc</span><span><i class="sw" style="background:var(--pink)"></i>Filler arc</span><span class="label">${total} episodes</span></div>` : "";
  return `<h3>Arcs</h3><p class="sub">${esc(d.numbering||"")}</p>${bar}
    <div class="arcs">${d.arcs.map((a,i)=>{ const fs = fillerShare(a); return `
      <div class="arc"><span class="no">${i+1}</span>
        <div style="min-width:0"><span class="part">${esc(a.part||"")}</span><h4>${esc(a.name)}</h4><p>${esc(a.summary||"")}</p></div>
        <div class="rng">${a.eps&&a.eps[0]!=null?`<span>Ep ${rangeTxt(a.eps)}</span>`:`<span>Film</span>`}${a.ch&&a.ch[0]!=null?`<span>Ch ${rangeTxt(a.ch)}</span>`:""}${fs>=0.8?`<span class="chip p">Filler</span>`:fs>0?`<span class="chip k">Some filler</span>`:""}</div>
      </div>`; }).join("")}</div>${srcHTML(d.src)}`;
}
function paneEvents(s, d){
  const groups = (d?.arcs||[]).filter(a=>a.events?.length);
  if (!groups.length) return `<div class="empty"><b>Key events coming soon.</b>We haven't written up the big moments for ${esc(s.title)} yet.</div>`;
  return `<h3>Key events</h3><p class="sub">These are spoilers. They stay blurred until you reveal them, one at a time or all at once.</p>
    <div class="ev-tools"><button type="button" class="ghost" id="spoilAll">${spoilers?"Hide spoilers":"Show all spoilers"}</button></div>
    <div class="${spoilers?"shown":""}" id="evs">${groups.map(a=>`
      <div class="evgroup"><h4>${esc(a.name)} <span class="label">${a.eps?"Ep "+rangeTxt(a.eps):"Film"}</span></h4>
        <ol>${a.events.map(e=>`<li><span class="spoil" tabindex="0" role="button" aria-label="Reveal spoiler">${esc(e)}</span></li>`).join("")}</ol></div>`).join("")}</div>`;
}
function paneFiller(s, d){
  if (!d?.filler) return `<div class="empty"><b>Filler guide coming soon.</b>We haven't checked the filler episodes for ${esc(s.title)} yet.</div>`;
  const {total, kinds} = epKinds(d);
  const count = k => Object.values(kinds).filter(v=>v===k).length;
  const nf = count("f"), nm = count("m"), nr = count("r");
  const none = !nf && !nm && !nr;
  const ranges = (d.filler.filler||[]).map(rangeTxt).join(", ");
  const grid = total ? `<div class="grid${total>400?" tiny":""}" style="--cell:${total>400?"10px":total>120?"18px":"28px"}" role="img" aria-label="${total} episodes: ${nf} filler, ${nm} mixed, ${nr} recap">${
      Array.from({length:total},(_,i)=>{ const k = kinds[i+1]||""; return `<span class="${k}" title="Ep ${i+1}${k==="f"?" · filler":k==="m"?" · mixed canon":k==="r"?" · recap":""}">${total<=400?i+1:""}</span>`; }).join("")}</div>
      <div class="key" style="margin-top:8px"><span><i class="sw" style="background:var(--blue)"></i>Canon</span><span><i class="sw" style="background:var(--pink-2)"></i>Mixed</span><span><i class="sw" style="background:var(--pink)"></i>Filler</span><span><i class="sw" style="background:var(--grey)"></i>Recap</span></div>` : "";
  return `<h3>Filler</h3><p class="sub">${esc(d.filler.note||"")}</p>
    ${total?`<div class="fstats"><div><span class="label">Episodes</span><b>${total}</b></div><div><span class="label">Canon</span><b class="c">${total-nf-nm-nr}</b></div><div><span class="label">Filler</span><b class="f">${nf}</b></div><div><span class="label">Mixed</span><b>${nm}</b></div>${nr?`<div><span class="label">Recap</span><b>${nr}</b></div>`:""}</div>`:""}
    ${none ? "" : grid}
    ${ranges ? `<div class="skip"><span class="label">Skip list (filler episodes)</span><code>${esc(ranges)}</code></div>` : ""}
    ${srcHTML(d.src)}`;
}
function paneManga(s){
  if (s.unchecked) return `<h3>${s.kind==="original"||s.kind==="vn" ? "Is there a manga to continue?" : "Anime finished. Where does the story pick up?"}</h3>
    <div class="handoff"><div class="big word"><small>Status</small>${s.kind==="original" ? "Original" : s.kind==="vn" ? "Game" : "Not checked yet"}</div><p>${esc(s.note)}</p></div>${srcHTML(s.src)}`;
  const unit = s.unit || "Chapter";
  const q = s.kind==="novel" ? "Anime finished. Where does the story go next?" : (s.kind==="original"||s.kind==="vn") ? "Is there a manga to continue?" : "Anime finished. Where does the manga pick up?";
  return `<h3>${q}</h3>
    <div class="handoff">
      <div class="big${s.next?"":" word"}"><small>${s.next ? "Start at "+esc(unit) : "Status"}</small>${s.next ? esc(s.next) : esc({original:"Original",vn:"Game",novel:"Novel"}[s.kind]||"Done")}</div>
      <p>${esc(s.note)}</p>
    </div>
    ${s.seasons?.length ? timelineHTML(s) : ""}${srcHTML(s.src)}`;
}

function renderSeries(id, tab){
  const s = byId[id], d = DETAILS[id], ss = siteScores()[id];
  const mine = (myId && reports[myId] && reports[myId][id]) || {};
  const writable = STATIC ? !!(SB.supabaseUrl && myId) : dbState==="on" && canWrite;
  const counts = {seasons: s.run?.length > 1 ? s.run.length : null, arcs: d?.arcs?.length, events: (d?.arcs||[]).reduce((t,a)=>t+(a.events?.length||0),0), filler: d?.filler ? epKinds(d).total && Object.values(epKinds(d).kinds).filter(k=>k==="f").length : null};
  const rateRow = !writable ? "" : `<div class="rate" role="group" aria-label="Rate ${esc(s.title)} from 1 to 10"><span class="label">Your rating</span>
      ${Array.from({length:10},(_,i)=>`<button type="button" data-rate="${i+1}" aria-pressed="${mine.rating===i+1}" class="${mine.rating>i+1?'fill':''}">${i+1}</button>`).join("")}
      ${mine.rating?`<button type="button" class="clear" data-rate="0">Clear</button>`:""}</div><div class="note" id="rnote"></div>`
    + `<div class="wl" role="group" aria-label="Add ${esc(s.title)} to your list"><span class="label">My list</span>${STATUSES.map(([k,l])=>`<button type="button" data-st="${k}" aria-pressed="${mine.status===k}">${l}</button>`).join("")}</div><div class="note" id="wnote"></div>`
    + (STATIC && myId ? `<div class="who">Signed in as ${esc(sbEmail())}<button type="button" id="signout">Sign out</button></div>` : "");
  const gate = STATIC && SB.supabaseUrl && !myId ? `<form class="signin" id="signin"><span class="label">Sign in to rate and report. We email you a link, no password.</span>
      <input type="email" id="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address"><button class="btn" type="submit" id="sendlink">Email me a link</button></form><div class="note" id="snote"></div>` : "";
  const pane = {overview:()=>paneOverview(s), seasons:()=>paneSeasons(s), arcs:()=>paneArcs(s,d), events:()=>paneEvents(s,d), filler:()=>paneFiller(s,d), manga:()=>paneManga(s)}[tab]();
  document.getElementById("app").innerHTML = `
    <header class="mast compact"><h1><a href="${homeHref()}">Ani<span class="num">meter</span></a></h1><nav class="mastnav"><a class="back" href="${profileHref()}">My list</a><a class="back" href="${homeHref()}">← Rankings</a></nav></header>
    <section class="sh">
      <div class="covers">${coverHTML(s,"anime","Anime")}${s.kind==="original"||s.kind==="vn" ? "" : coverHTML(s,"manga", s.kind==="novel"?"Light novel":"Manga")}</div>
      <div style="min-width:0">
        <div class="label">${[s.year, (s.genres||[]).join(", ")].filter(Boolean).map(esc).join(" · ")}</div>
        <h2>${esc(s.title)}</h2><div class="jp">${esc(s.jp||"")}</div>
        <div class="facts">
          ${s.score?`<div><span class="label">AniList</span><b class="gold">${fmt10(s.score/10)}</b></div>`:""}
          <div><span class="label">Animeter</span><b class="gold">${ss.votes ? fmt10(ss.avg) : "—"}</b></div>
          <div><span class="label">${esc(s.epsLabel)}</span><b>${s.eps} ep</b></div>
          <div><span class="label">${s.kind==="novel"?"Source":"Manga"}</span><b>${esc(handoffShort(s).replace("VN","Visual novel").replace("Novel","Light novel"))}</b></div>
        </div>
        ${rateRow}${gate}
      </div>
    </section>
    <nav class="tabs" aria-label="${esc(s.title)} sections">${TABS.filter(([k])=>tabShown(s,k)).map(([k,l])=>`<a href="${seriesHref(id,k)}" ${k===tab?'aria-current="page"':""}>${l}${counts[k]?`<span class="n">${counts[k]}</span>`:""}</a>`).join("")}</nav>
    <section class="pane">${pane}</section>`;
  document.getElementById("vote")?.addEventListener("submit", e=>saveReport(e, id));
  document.querySelectorAll(".rate button").forEach(b=>b.addEventListener("click", ()=>saveRating(id, Number(b.dataset.rate))));
  document.querySelectorAll(".wl button").forEach(b=>b.addEventListener("click", ()=>saveStatus(id, b.dataset.st===mine.status ? null : b.dataset.st)));
  document.getElementById("signin")?.addEventListener("submit", sendLink);
  document.getElementById("signout")?.addEventListener("click", signOut);
  document.getElementById("spoilAll")?.addEventListener("click", ()=>{ spoilers=!spoilers; renderSeries(id, tab); });
  document.getElementById("evs")?.addEventListener("click", e=>{ const sp = e.target.closest(".spoil"); if (sp) sp.style.filter="none"; });
  document.getElementById("evs")?.addEventListener("keydown", e=>{ if ((e.key==="Enter"||e.key===" ") && e.target.classList.contains("spoil")){ e.preventDefault(); e.target.style.filter="none"; } });
}

function render(){
  _site = null;
  const r = route();
  document.title = r.profile ? "My list · Animeter" : r.id ? `${byId[r.id].title} · Animeter` : "Animeter";
  const tone = r.id && byId[r.id].tone;
  if (tone) document.documentElement.style.setProperty("--tone", tone); else document.documentElement.style.removeProperty("--tone");
  if (r.profile) renderProfile(); else if (r.id) renderSeries(r.id, r.tab); else renderHome();
}
document.getElementById("fetched").textContent = FETCHED || "recently";

/* ---------- writes ---------- */
async function writeEntry(id, patch){
  if (STATIC) return sbWrite(id, patch);
  const ref = db.doc("reports/"+myId);
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data()||{}) : {};
  await ref.set({...prev, [id]: {...(prev[id]||{}), ...patch, at:new Date().toISOString()}});
}
function explain(err){
  if (err && err.code==="signed_out") return "You were signed out. Sign in again to save.";
  if (STATIC && err && err.status) return `Couldn't save (error ${err.status}${err.detail ? ": "+err.detail : ""}).`;
  if (STATIC && err) return "Couldn't reach the report server. Check your connection and try again.";
  if (err && err.code==="invalid_argument"){ canWrite = false; return "Your access lets you read reports but not add them."; }
  if (err && err.code==="quota_exceeded") return "The report store is full, so this couldn't be saved.";
  return "Couldn't save just now. Try again in a moment.";
}
async function saveReport(e, id){
  e.preventDefault();
  const note = document.getElementById("note"), btn = document.getElementById("save");
  const cv = document.getElementById("clicked").value, sv = document.getElementById("stopped").value;
  if (!cv && !sv){ note.textContent = "Pick at least one of the two answers first."; return; }
  btn.disabled = true; note.textContent = "Saving…";
  try{
    await writeEntry(id, {clicked: cv==="never" ? "never" : cv ? Number(cv) : null, stopped: sv==="no" ? "no" : sv ? Number(sv) : null});
    const n = document.getElementById("note"); if (n) n.textContent = "Saved. Your report is in the drop map.";
  }catch(err){ btn.disabled = false; note.textContent = explain(err); }
}
async function saveRating(id, v){
  const rn = document.getElementById("rnote"); if (rn) rn.textContent = "Saving…";
  try{
    await writeEntry(id, {rating: v || null});
    const n = document.getElementById("rnote"); if (n) n.textContent = v ? `Rated ${v}/10.` : "Rating cleared.";
  }catch(err){ const n = document.getElementById("rnote"); if (n) n.textContent = explain(err); }
}

async function saveStatus(id, st){
  const n0 = document.getElementById("wnote"); if (n0) n0.textContent = "Saving…";
  try{
    await writeEntry(id, {status: st});
    const n = document.getElementById("wnote"); if (n) n.textContent = st ? `Added to ${STATUSES.find(x=>x[0]===st)[1]}.` : "Removed from your list.";
  }catch(err){ const n = document.getElementById("wnote"); if (n) n.textContent = explain(err); }
}

/* ---------- profile: the viewer's own list ---------- */
function renderProfile(){
  const mine = (myId && reports[myId]) || {};
  const ids = Object.keys(mine).filter(k=>byId[k]);
  const by = st => ids.filter(k=>mine[k].status===st).map(k=>byId[k]);
  const rated = ids.filter(k=>Number.isInteger(mine[k].rating)).sort((a,b)=>mine[b].rating-mine[a].rating || byId[a].title.localeCompare(byId[b].title)).map(k=>byId[k]);
  const card = s => `<a class="card" href="${seriesHref(s.id)}">${coverHTML(s,"anime")}<span class="t">${esc(s.title)}</span>
      <span class="m"><span>${esc([s.year,(s.genres||[])[0]].filter(Boolean).join(" · "))}</span><span>${Number.isInteger(mine[s.id].rating)?"★ "+mine[s.id].rating:""}</span></span></a>`;
  const signedOut = STATIC ? !myId : dbState==="off";
  const gate = STATIC && SB.supabaseUrl && !myId ? `<form class="signin" id="signin"><span class="label">Sign in to keep a list. We email you a link, no password.</span>
      <input type="email" id="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address"><button class="btn" type="submit" id="sendlink">Email me a link</button></form><div class="note" id="snote"></div>` : "";
  const body = signedOut ? (gate || `<div class="empty"><b>Lists aren't available in this view.</b>${STATIC ? "Voting and lists aren't switched on yet." : "Sign in to claude.ai to keep a list."}</div>`)
    : dbState==="loading" && !ids.length ? `<div class="empty"><b>Loading your list…</b></div>`
    : `<div class="counts">${STATUSES.map(([k,l])=>`<div><span class="label">${l}</span><b>${by(k).length}</b></div>`).join("")}<div><span class="label">Rated</span><b>${rated.length}</b></div></div>
       ${STATIC ? `<div class="who">Signed in as ${esc(sbEmail())}<button type="button" id="signout">Sign out</button></div>` : ""}
       ${!ids.length ? `<div class="empty" style="margin-top:22px"><b>Your list is empty.</b>Open any series and pick Watching, Completed, Plan to watch or Dropped under its title.</div>` : ""}
       ${STATUSES.map(([k,l])=>{ const xs = by(k); return xs.length ? `<h3>${l} <span class="label">${xs.length}</span></h3><div class="wall">${xs.map(card).join("")}</div>` : ""; }).join("")}
       ${rated.length ? `<h3>Your ratings <span class="label">${rated.length}</span></h3><div class="wall">${rated.map(card).join("")}</div>` : ""}`;
  document.getElementById("app").innerHTML = `
    <header class="mast compact"><h1><a href="${homeHref()}">Ani<span class="num">meter</span></a></h1><a class="back" href="${homeHref()}">← Rankings</a></header>
    <section class="prof"><h2>My list</h2><p class="sub">What you're watching, what you finished, what you dropped, and your ratings.</p>${body}</section>`;
  document.getElementById("signin")?.addEventListener("submit", sendLink);
  document.getElementById("signout")?.addEventListener("click", signOut);
}

/* ---------- boot ---------- */
/* Standalone backend: Supabase over plain REST. Reads are public; voting needs an email sign-in
   (magic link), and row-level security lets each account change only its own rows. */
const SB = (window.ANIMETER_CONFIG || {}), SB_KEY = "animeter.session";
let sbSession = null, sbErr = null, sbNoStatus = false;
try { sbSession = JSON.parse(localStorage.getItem(SB_KEY) || "null"); } catch(_) {}
if (STATIC && sbSession) myId = sbSession.user && sbSession.user.id;
async function sbFetch(path, opts={}, token){
  const r = await fetch(SB.supabaseUrl + path, {...opts, headers:{apikey:SB.supabaseKey, Authorization:"Bearer "+(token||SB.supabaseKey), "Content-Type":"application/json", ...(opts.headers||{})}});
  if (!r.ok){ let detail = ""; try{ const b = await r.json(); detail = b.message || b.msg || b.error_description || b.error || ""; }catch(_){}
    throw Object.assign(new Error("supabase "+r.status+" "+detail), {status:r.status, detail}); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function sbKeep(sess){ if (!sess.user && sess.access_token){ const c = jwtClaims(sess.access_token); sess.user = {id:c.sub, email:c.email}; }
  sbSession = sess; myId = sess.user.id; try{ localStorage.setItem(SB_KEY, JSON.stringify(sess)); }catch(_){} }
async function sbToken(){
  const now = Date.now()/1000;
  if (sbSession && sbSession.expires_at > now + 60) return sbSession.access_token;
  if (sbSession && sbSession.refresh_token){
    try{ sbKeep(await sbFetch("/auth/v1/token?grant_type=refresh_token", {method:"POST", body:JSON.stringify({refresh_token:sbSession.refresh_token})})); return sbSession.access_token; }catch(_){}
  }
  signOut(); throw Object.assign(new Error("signed out"), {code:"signed_out"});
}
const jwtClaims = t => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); } catch(_) { return {}; } };
const sbEmail = () => (sbSession && (sbSession.user?.email || jwtClaims(sbSession.access_token).email)) || "your email";
function sbFromLink(){                       // the emailed link lands here with the session in the hash
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("error_description")) { history.replaceState(null, "", location.pathname + location.search); return h.get("error_description"); }
  if (!h.get("access_token")) return null;
  const c = jwtClaims(h.get("access_token"));
  sbKeep({access_token:h.get("access_token"), refresh_token:h.get("refresh_token"), expires_at:Number(h.get("expires_at")) || c.exp, user:{id:c.sub, email:c.email}});
  history.replaceState(null, "", location.pathname + location.search);
  return null;
}
async function sendLink(e){
  e.preventDefault();
  const email = document.getElementById("email").value.trim(), note = document.getElementById("snote"), btn = document.getElementById("sendlink");
  if (!email) return;
  btn.disabled = true; note.textContent = "Sending…";
  try{
    await sbFetch("/auth/v1/otp?redirect_to=" + encodeURIComponent(location.origin + location.pathname), {method:"POST", body:JSON.stringify({email, create_user:true})});
    note.textContent = `Check ${email} for a sign-in link. Open it on this device.`;
  }catch(err){ btn.disabled = false; note.textContent = err.status===429 ? "Too many sign-in emails just now. Try again in a few minutes." : "Couldn't send the email. Check the address and try again."; }
}
function signOut(){
  sbSession = null; myId = null;
  try{ localStorage.removeItem(SB_KEY); }catch(_){}
  render();
}
const sbIn = v => v==null ? null : /^\d+$/.test(v) ? Number(v) : v;
async function sbLoad(){
  const next = {};
  for (let off=0;; off+=1000){
    let rows;
    try{ rows = await sbFetch(`/rest/v1/reports?select=uid,series,clicked,stopped,rating${sbNoStatus?"":",status"}&order=uid,series&limit=1000&offset=${off}`); }
    catch(e){ if (e.status!==400 || sbNoStatus) throw e; sbNoStatus = true; off -= 1000; continue; }   // table predates the status column
    rows.forEach(r=>{ (next[r.uid] ||= {})[r.series] = {clicked:sbIn(r.clicked), stopped:sbIn(r.stopped), rating:r.rating, status:r.status}; });
    if (rows.length < 1000) break;
  }
  return next;
}
async function sbWrite(id, patch){
  const token = await sbToken();
  const row = {uid:myId, series:id};
  if ("clicked" in patch) row.clicked = patch.clicked==null ? null : String(patch.clicked);
  if ("stopped" in patch) row.stopped = patch.stopped==null ? null : String(patch.stopped);
  if ("rating" in patch) row.rating = patch.rating;
  if ("status" in patch) row.status = patch.status;
  await sbFetch("/rest/v1/reports?on_conflict=uid,series", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify([row])}, token);
  reports[myId] = {...(reports[myId]||{}), [id]: {...((reports[myId]||{})[id]||{}), ...patch}};
  _site = null;
  const a = document.activeElement && document.activeElement.id;
  if (a!=="clicked" && a!=="stopped") render();
}
async function bootStatic(){
  if (new URLSearchParams(location.search).has("prerender")) return;   // build-time snapshot: leave "loading"
  if (!SB.supabaseUrl || !SB.supabaseKey){ dbState = "off"; render(); return; }
  const linkErr = sbFromLink();
  try{ reports = await sbLoad(); dbState = "on"; }catch(e){ dbState = "off"; sbErr = e.status || 0; console.error("Animeter: loading reports failed", e); }
  const a = document.activeElement && document.activeElement.id;
  if (a==="q"){ _site = null; renderRankings(); return; }
  render();
  if (linkErr){ const n = document.getElementById("snote"); if (n) n.textContent = "That sign-in link didn't work (" + linkErr + "). Ask for a new one."; }
}

(function init(){
  render();
  if (STATIC){ bootStatic(); return; }
  const boot = async () => {
    try{
      const [dbNs, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!dbNs || !user){ dbState = "off"; render(); return; }
      db = dbNs; myId = await user.id();
      const w = user.can ? await user.can("data.write") : null;
      if (!myId || w === false) canWrite = false;
      db.collection("reports").onSnapshot(qs=>{
        const next = {}; qs.docs.forEach(d=>{ next[d.id] = d.data() || {}; });
        reports = next; dbState = "on";
        const a = document.activeElement && document.activeElement.id;
        if (a==="clicked" || a==="stopped") return;               // don't yank a select mid-choice
        if (a==="q"){ _site = null; renderRankings(); return; }
        render();
      }, () => { dbState = "off"; render(); });
    }catch(_){ dbState = "off"; render(); }
  };
  let tries = 0;
  (function wait(){
    if (window.claude?.use) boot();
    else if (++tries < 20) setTimeout(wait, 150);
    else { dbState = "off"; render(); }
  })();
})();
