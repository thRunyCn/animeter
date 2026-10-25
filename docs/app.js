/* Two builds share this file: the claude.ai artifact (hash routes, built-in db) and the standalone
   web/ site (one static page per route, data.js + config.js alongside, Supabase for reports). */
/* Renders patch the live DOM instead of replacing it, so pictures already on screen (the prerendered
   page's included) are not loaded again and entrance motion that is playing does not restart. */
function morph(a, b){
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName){ a.replaceWith(b); return; }
  if (a.nodeType === 3 || a.nodeType === 8){ if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const {name} of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const {name, value} of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  if (a.nodeName === "INPUT" && a.value !== b.value && a !== document.activeElement) a.value = b.value;
  morphKids(a, b);
}
function morphKids(a, b){
  const ak = [...a.childNodes], bk = [...b.childNodes];
  bk.forEach((n, i) => ak[i] ? morph(ak[i], n) : a.appendChild(n));
  for (let i = bk.length; i < ak.length; i++) ak[i].remove();
}
function patch(el){ return { set html(h){ const t = document.createElement("template"); t.innerHTML = h; const d = document.createElement(el.nodeName); d.append(t.content); morphKids(el, d); } }; }
/* Since patched elements survive renders, each render's bindings replace the previous ones instead of piling up. */
{ const add = Element.prototype.addEventListener, rm = Element.prototype.removeEventListener;
  Element.prototype.addEventListener = function(type, fn, opt){ const m = this._on || (this._on = {}); if (m[type]) rm.call(this, type, m[type], opt); m[type] = fn; return add.call(this, type, fn, opt); }; }
const STATIC = !!window.ANIMETER;
if (STATIC && window.ANIMETER.tagnames){            // slim index: tags as numbers, heavy fields arrive per series (s/<id>.js)
  const tn = window.ANIMETER.tagnames;
  window.ANIMETER.series.forEach(x=>{ x.tags = (x.tg||[]).map(i=>tn[i]); delete x.tg; });
}
if (STATIC && window.ANIMETER_FULL){ const f = window.ANIMETER_FULL, x = window.ANIMETER.series.find(x=>x.id===f.id);
  if (x) Object.assign(x, f.series, {_full:true}); window.ANIMETER.details[f.id] = f.details; }
const SERIES = STATIC ? window.ANIMETER.series : /*SERIES*/[];
const DETAILS = STATIC ? window.ANIMETER.details : /*DETAILS*/{};
const FETCHED = STATIC ? window.ANIMETER.fetched : /*FETCHED*/"";
// absolute, so links and covers still resolve after in-page navigation changes the URL
const ROOT = !STATIC ? "" : /[?&]prerender/.test(location.search) ? (document.body.dataset.root || "")   // snapshots keep relative links
  : new URL(document.body.dataset.root || "./", location.href).pathname;
const homeHref = () => STATIC ? (ROOT || "./") : "#";
const profileHref = () => STATIC ? `${ROOT}profile/` : "#profile";
const STATUSES = [["watching","Watching"],["completed","Completed"],["planned","Plan to watch"],["dropped","Dropped"]];
const seriesHref = (id, tab) => { const t = tab && tab!=="overview" ? tab : "";
  return STATIC ? `${ROOT}${id}/${t ? t+"/" : ""}` : `#${id}${t ? "."+t : ""}`; };
const byId = Object.fromEntries(SERIES.map(s=>[s.id,s]));
const M_MIN = 5, MIN_VOTES = 5, PER_PAGE = 25;   // an Animeter score shows (and ranks) only from MIN_VOTES ratings
const TABS = [["overview","Overview"],["seasons","Seasons"],["arcs","Arcs"],["events","Key events"],["filler","Filler"],["manga","Manga"]];
let sortBy = "anilist", view = "list", query = "", page = 1, spoilers = false;
const tags = new Set();                     // selected genre tags; a series must have all of them
const SORTS = [["anilist","AniList score"],["site","Animeter score"],["popular","Popularity"],["new","Newest"],["old","Oldest"],["az","A to Z"]];
let reports = {}, myId = null, db = null, canWrite = true, dbState = "loading";
try { const v = localStorage.getItem("view"); if (v==="list"||v==="wall") view = v; } catch(_) {}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt10 = n => (Math.round(n*10)/10).toFixed(1);
const rangeTxt = r => !r || r[0]==null ? "" : r[1]==null ? `${r[0]}+` : r[0]===r[1] ? String(r[0]) : `${r[0]}–${r[1]}`;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function coverHTML(s, kind, tag, extra="", eager=false){
  return `<div class="cover" style="--tone:${s.tone||'#4a5160'}">
    <img src="${ROOT}covers/${s.id}-${kind}.jpg" alt="${eager ? esc(s.title)+" "+kind+" cover" : ""}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} width="460" height="649" onerror="this.parentNode.classList.add('nocover')">
    <div class="ph" aria-hidden="true"><b>${esc(s.title)}</b></div>${extra}
    ${tag?`<span class="tag">${tag}</span>`:""}</div>`;
}
/* a short hand-off label with its full form as a tooltip: <abbr title="Steel Ball Run chapter 24">SBR 24</abbr> */
const hoAbbr = s => s.next && s.hoLong ? `<abbr title="${esc(s.hoLong)}">${esc(handoffShort(s))}</abbr>` : esc(handoffShort(s));
const obiHTML = (s, score) => `<span class="obi${s.next?"":" ink"}"><span>${s.next ? "Manga " : ""}${hoAbbr(s)}</span><b>${score||""}</b></span>`;
const hasSeasons = s => (s.run?.length||0) > 1 || !!s.extras?.length;
const tabShown = (s, k) => k==="seasons" ? hasSeasons(s) : !s.unchecked || k==="overview" || k==="manga" || k==="filler" && !!s.hf;
const handoffShort = s => s.format==="MOVIE" && s.unchecked ? "Film" : s.unchecked && !s.mangaChecked && (s.kind==="manga"||s.kind==="novel") ? "Not checked" : s.next ? (s.unitShort||"Ch. ")+s.next : (s.endShort||{original:"Original",vn:"VN",novel:"Novel"}[s.kind]||"Adapted");

/* ---------- routing: "" = rankings, "#id" = series overview, "#id.tab" = series tab ---------- */
function route(){
  const h = STATIC ? (document.body.dataset.route || "") : decodeURIComponent((location.hash||"").slice(1));
  if (h === "profile") return {id:null, profile:true};
  if (h === "static") return {id:null, static:true};
  if (h === "404") return {id:null, missing:true};
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
  all.forEach(a=>{ const shown = a.votes >= MIN_VOTES;
    out[a.id] = {votes:a.votes, avg:a.avg, shown, wr: shown ? (a.votes/(a.votes+M_MIN))*a.avg + (M_MIN/(a.votes+M_MIN))*C : null}; });
  return _site = out;
}

/* ---------- rankings (home) ---------- */
const TAGCAT = STATIC ? (window.ANIMETER.tagcat||{}) : {};   // AniList tag -> group (Audience, Themes, Setting, Cast)
const hasTag = (s, t) => t==="Film" ? s.format==="MOVIE" : (s.genres||[]).includes(t) || (s.tags||[]).includes(t);
function allTags(){
  const n = {};
  SERIES.forEach(s=>{ new Set([...(s.genres||[]), ...(s.tags||[]), ...(s.format==="MOVIE"?["Film"]:[])]).forEach(g=>n[g]=(n[g]||0)+1); });
  const groups = {Audience:[], Genre:[], Themes:[], Setting:[], Cast:[]};
  Object.entries(n).filter(([t,c])=>c>=(TAGCAT[t] && TAGCAT[t]!=="Audience" ? 8 : 3)).sort((a,b)=>b[1]-a[1]).forEach(([t,c])=>{
    const g = TAGCAT[t] || (SERIES.some(s=>(s.genres||[]).includes(t)) || t==="Film" ? "Genre" : null);
    if (g && groups[g] && t!=="Heterosexual") groups[g].push([t,c]);
  });
  return Object.entries(groups).filter(([,l])=>l.length);
}
/* AniList order used everywhere (top ten, rankings, story): score, then popularity, then title */
const byScore = (a,b) => (b.score??-1)-(a.score??-1) || (b.popularity??0)-(a.popularity??0) || a.title.localeCompare(b.title);
function ranked(){
  const site = siteScores();
  const items = SERIES.map(s=>({s, site:site[s.id]}));
  const key = {anilist: x => x.s.score ?? -1, site: x => x.site.wr ?? -1, popular: x => x.s.popularity ?? -1,
    new: x => x.s.year ?? -1, old: x => -(x.s.year ?? 9999), az: () => 0}[sortBy];
  items.sort((a,b)=> key(b)-key(a) || (sortBy==="az" ? a.s.title.localeCompare(b.s.title) : byScore(a.s,b.s)));
  const q = query.trim().toLowerCase();
  if (!q && !tags.size){ items.forEach((x,i)=>x.rank=i+1); return items; }
  const all = items; all.forEach((x,i)=>x.rank=i+1);
  const out = all.filter(x=>(!q || x.s.title.toLowerCase().includes(q) || (x.s.jp||"").includes(q))
    && [...tags].every(t => hasTag(x.s, t)));
  if (tags.size) out.forEach((x,i)=>x.rank=i+1);   // a search keeps overall rank; a tag filter ranks within the tag
  return out;
}
/* Ink for a field of the show's own colour: dark or white, whichever reads; a tone too mid-grey for
   either is deepened until white reads at 4.5:1. `deep` is the lower half of the hero headline. */
function toneInk(hex){
  const rgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const lum = c => { const [r,g,b] = c.map(v=>{ v/=255; return v<=.03928 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
  const ratio = (x,y) => (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
  let c = /^#[0-9a-f]{6}$/i.test(hex||"") ? rgb(hex) : [91,143,134];
  const dark = lum([28,28,28]);
  for (let k=0; k<12 && ratio(lum(c),dark) < 4.5 && ratio(lum(c),1) < 4.5; k++) c = c.map(v=>Math.round(v*.88));
  const hx = c => "#"+c.map(v=>v.toString(16).padStart(2,"0")).join("");
  const light = ratio(lum(c),dark) >= ratio(lum(c),1);
  return {bg: hx(c), ink: light ? "#1c1c1c" : "#ffffff", deep: hx(c.map(v=>Math.round(light ? v*.3 : v+(255-v)*.72)))};
}
/* cover tones are sampled mid-greys more often than not; lift them to a clear, saturated version of the same hue for
   accents, and a very dark version of it for whole fields */
function hsl(hex){
  const c = /^#[0-9a-f]{6}$/i.test(hex||"") ? [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) : [.36,.56,.53];
  const mx = Math.max(...c), mn = Math.min(...c), l = (mx+mn)/2, d = mx-mn;
  const s = d ? d/(1-Math.abs(2*l-1)) : 0;
  const h = !d ? 0 : mx===c[0] ? ((c[1]-c[2])/d+6)%6 : mx===c[1] ? (c[2]-c[0])/d+2 : (c[0]-c[1])/d+4;
  return [h*60, s, l];
}
function hex(h, s, l){
  const k = n => (n + h/30) % 12, a = s*Math.min(l, 1-l);
  const f = n => Math.round(255*(l - a*Math.max(-1, Math.min(k(n)-3, 9-k(n), 1)))).toString(16).padStart(2,"0");
  return "#"+f(0)+f(8)+f(4);
}
const vivid = t => { const [h,s] = hsl(t); return hex(h, s < .08 ? .1 : Math.min(.86, Math.max(.58, s*1.5)), .62); };
const deepOf = t => { const [h,s] = hsl(t); return hex(h, Math.min(.55, Math.max(.25, s)), .1); };
const toneVars = s => { const t = toneInk(vivid(s.tone)); return `--tone:${t.bg};--tone-ink:${t.ink};--deep:${deepOf(s.tone)}`; };
const kindWord = s => s.kind==="novel" ? "light novel" : "manga";
/* ---------- the first screen: a wall of covers drifting behind the question everyone asks ---------- */
/* where the story stands after the anime: one answer shared by cards, lists and series pages (endShort ships with every series, endWord only on its own page) */
const endState = s => s.next ? "next" : s.kind==="original" ? "original" : s.kind==="vn" ? "vn"
  : s.endShort==="Done" ? "fully" : s.endShort==="Own end" ? "own" : / ahead$/.test(s.endShort||"") ? "ahead"
  : s.unchecked && !s.mangaChecked ? "unchecked" : "unknown";
const answerOf = s => ({
  next: () => `Read the ${kindWord(s)} from ${esc((s.hoLong||handoffShort(s)).replace(/^(Chapter|Volume) /, m=>m.toLowerCase()).replace(/^Ch\. ?/,"chapter ").replace(/^Vol\. ?/,"volume "))}`,
  original: () => "Original anime, no book to read on with", vn: () => "Began as a visual novel",
  fully: () => "The anime tells the whole story", own: () => `The anime ends its own way, apart from the ${kindWord(s)}`,
  ahead: () => `The ${kindWord(s)} goes on past the anime`,
  unchecked: () => "Where the book picks up isn't checked yet", unknown: () => `Where the ${kindWord(s)} picks up isn't known yet`})[endState(s)]();
/* the header, the same on every page: links inline on wide screens, behind a Menu button on phones; search and My list always showing */
const SEARCH_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
function mastHTML(home, cls=""){
  const links = (home ? `<a href="#rankings" data-jump>Rankings</a>` : `<a href="${homeHref()}#rankings">Rankings</a>`)
    + (STATIC ? `<a href="${ROOT}anime/">A to Z</a><a href="${ROOT}genre/">Genres</a>` : "");
  return `<header class="mast ${cls}"><a class="wm" href="${homeHref()}">Animeter</a><nav class="mastnav" aria-label="Main">`
    + `<span class="navlinks">${links}</span><details class="navmenu"><summary>Menu</summary><div class="navpanel">${links}</div></details>`
    + `<a class="srch" href="${home ? "#find" : homeHref()+"#find"}" data-find>${SEARCH_ICON}<span>Search</span></a>`
    + `<a class="melink" href="${profileHref()}">My list</a></nav></header>`;
}
function cineHTML(){
  const pop = SERIES.filter(s=>s.popularity).sort((a,b)=>b.popularity-a.popularity).slice(0,56);
  const cols = Array.from({length:7}, (_,c)=>pop.filter((_,i)=>i%7===c));
  const top = SERIES.filter(s=>s.score!=null).sort(byScore)[0];
  const img = s => `<img src="${ROOT}covers/w/${s.id}.jpg" alt="" width="200" height="282" decoding="async" style="background:${esc(s.tone||"#222")}" onerror="this.onerror=null;this.src='${ROOT}covers/${s.id}-anime.jpg'">`;
  return `<section class="cine" style="${top ? toneVars(top) : ""}">
    <div class="cwall" aria-hidden="true">${cols.map((l,c)=>`<div class="col" data-dir="${c%2?1:-1}"><div class="lane">${l.map(img).join("")}${l.map(img).join("")}</div></div>`).join("")}</div>
    <div class="cine-in">
      <h1><span>Finished the anime?</span> <span>Here’s where the manga picks up.</span></h1>
      <p class="lede">${nf(SERIES.length)} anime, each with the chapter to read next, the filler to skip and every season in order.</p>
      <div class="finder" role="search">
        <label class="vh" for="find">Find an anime</label>
        <span class="fi">${SEARCH_ICON}</span><input id="find" type="search" autocomplete="off" placeholder="Search ${nf(SERIES.length)} anime, like Frieren or One Piece" aria-controls="found">
        <ul id="found" class="found" aria-live="polite"></ul>
      </div>
      <div class="acts"><a class="btn" href="#rankings" data-jump>See the rankings</a><a class="more" href="#top" data-jump>The top ten</a></div>
    </div>
  </section>`;
}
function wireFinder(){
  const f = document.getElementById("find"), out = document.getElementById("found"); if (!f || f._wired) return; f._wired = true;
  const show = ()=>{
    const q = f.value.trim().toLowerCase();
    if (!q){ out.innerHTML = ""; out.classList.remove("on"); return; }
    const hits = SERIES.filter(s=>s.title.toLowerCase().includes(q) || (s.jp||"").includes(q))
      .sort((a,b)=>(b.title.toLowerCase().startsWith(q)) - (a.title.toLowerCase().startsWith(q)) || (b.popularity||0)-(a.popularity||0)).slice(0,5);
    out.innerHTML = hits.length ? hits.map(s=>`<li><a href="${seriesHref(s.id, s.next ? "manga" : "")}" style="${toneVars(s)}">
        <img src="${ROOT}covers/${s.id}-anime.jpg" alt="" width="46" height="65" onerror="this.style.visibility='hidden'">
        <span class="ft">${esc(s.title)}</span><span class="fa">${answerOf(s)}</span></a></li>`).join("")
      : `<li class="none">No anime called "${esc(f.value.trim())}" yet. Try another spelling, or browse the rankings.</li>`;
    out.classList.add("on");
  };
  f.addEventListener("input", show);
  f.addEventListener("keydown", e=>{ if (e.key==="Escape"){ f.value=""; show(); } if (e.key==="ArrowDown"){ const a = out.querySelector("a"); if (a){ e.preventDefault(); a.focus(); } } });
  out.addEventListener("keydown", e=>{ const as = [...out.querySelectorAll("a")], i = as.indexOf(document.activeElement);
    if (e.key==="ArrowDown" && i<as.length-1){ e.preventDefault(); as[i+1].focus(); }
    if (e.key==="ArrowUp"){ e.preventDefault(); (i>0 ? as[i-1] : f).focus(); }
    if (e.key==="Escape"){ f.focus(); f.value=""; show(); } });
}
/* ---------- the top ten: a row of big covers that runs sideways as you scroll ---------- */
function top10HTML(){
  const top = SERIES.filter(s=>s.score!=null).sort(byScore).slice(0,10);
  return `<section class="top10" id="top" aria-labelledby="t10-h"><div class="t10-pin">
    <div class="t10-head"><h2 id="t10-h">The top ten</h2><p>The ten best-rated anime on AniList right now, and where each story goes after the last episode.</p></div>
    <div class="t10-track">${top.map((s,i)=>`<a class="t10-card" href="${seriesHref(s.id)}" style="${toneVars(s)}" data-deep="${deepOf(s.tone)}">
      <span class="t10-n" aria-hidden="true">${i+1}</span>
      <span class="cover"><img src="${ROOT}covers/${s.id}-anime.jpg" alt="${esc(s.title)} anime cover" loading="lazy" width="460" height="649"></span>
      <span class="t10-meta"><b>${esc(s.title)}</b><span>No. ${i+1} at ${fmt10(s.score/10)}, ${s.year||""}</span><span class="t10-a">${answerOf(s)}</span></span>
    </a>`).join("")}</div></div></section>`;
}
/* ---------- the hand-off, told as a short scroll story with the No. 1 show ---------- */
function storyHTML(){
  const s = SERIES.filter(x=>x.score!=null && x.next && (x.unit||"Chapter")==="Chapter").sort(byScore)[0]; if (!s) return "";
  const n = parseInt(s.next,10) || s.next;
  return `<section class="story" aria-labelledby="story-h" style="${toneVars(s)}"><div class="story-pin">
    <div class="story-txt">
      <h2 id="story-h" class="vh">How a series page answers you</h2>
      <p class="st1">${esc(s.title.split(":")[0])}'s anime ends after ${s.eps} episodes.</p>
      <p class="st2">The ${kindWord(s)} keeps going.</p>
      <p class="st3">Pick it up at chapter <b class="story-n" data-n="${n}">${n}</b></p>
      <a class="btn" href="${seriesHref(s.id,"manga")}">See where ${esc(s.title.split(":")[0])} picks up</a>
    </div>
    <div class="story-art">
      <div class="sa sa-anime"><div class="cover"><img src="${ROOT}covers/${s.id}-anime.jpg" alt="${esc(s.title)} anime cover" loading="lazy" width="460" height="649"></div><span class="cap">Anime, ${s.eps} episodes</span></div>
      <div class="sa sa-book"><div class="cover"><img src="${ROOT}covers/${s.id}-manga.jpg" alt="${esc(s.title)} ${kindWord(s)} cover" loading="lazy" width="460" height="649"></div><span class="cap">${kindWord(s)==="manga"?"Manga":"Light novel"}, from chapter ${esc(String(n))}</span></div>
    </div>
  </div></section>`;
}
function setTone(v){ const de = document.documentElement.style; v.split(";").forEach(d=>{ const [k,x] = d.split(":"); if (k && x) de.setProperty(k.trim(), x.trim()); }); }
/* parts of the lower chapters rise in once as they arrive */
let riseIO = null;
function wireRise(){
  if (reduceMotion() || !("IntersectionObserver" in window) || /[?&]prerender/.test(location.search)) return;
  document.documentElement.classList.add("rise");
  riseIO = riseIO || new IntersectionObserver(es=>es.forEach(e=>{ if (e.isIntersecting){ e.target.classList.add("on"); riseIO.unobserve(e.target); } }), {rootMargin:"0px 0px -12% 0px"});
  document.querySelectorAll("[data-r]:not(.on)").forEach(el=>riseIO.observe(el));
}
/* ---------- motion (GSAP + ScrollTrigger + SplitText) ----------
   One authored moment per page, then quiet: the hero headline grows out of the seam, a picked cover floods
   its colour across the lower field, chapters arrive as you reach them, the title wall drifts with scroll
   speed. Everything is skipped for reduced motion and for the prerender snapshot, so the page is complete
   and readable without it. Easing follows Emil Kowalski: strong ease-out for arrivals, never ease-in. */
const PRERENDER = /[?&]prerender/.test(location.search);
const GS = () => !!(window.gsap && window.ScrollTrigger && window.SplitText) && !PRERENDER && !reduceMotion();
let gsCtx = null, gsKey = "", marqueeRAF = 0;
if (window.gsap && window.ScrollTrigger && window.SplitText){
  gsap.registerPlugin(ScrollTrigger, SplitText);
  gsap.defaults({ease:"expo.out", duration:.9});
  if (GS()) document.documentElement.classList.add("gs");
}
function motion(key){
  if (!GS() || key===gsKey) return;
  gsKey = key; gsCtx?.revert(); cancelAnimationFrame(marqueeRAF);
  gsCtx = gsap.context(()=>{ key==="home" ? motionHome() : key.startsWith("s:") ? motionSeries() : null; motionCommon(); });
  document.documentElement.classList.add("gsr"); smooth();
  document.fonts?.ready.then(()=>ScrollTrigger.refresh());
}
/* split a heading into masked lines of characters; returns the chars */
function chars(el, type="chars"){
  const st = SplitText.create(el, {type:"lines,"+type, mask:"lines", linesClass:"sl", aria:"auto"});
  return st[type];
}
function motionHome(){
  const c = document.querySelector(".cine");
  if (c){
    // the opening: the wall of covers settles into place behind the question; the text is there from the first frame
    gsap.fromTo(".cwall", {scale:1.06}, {scale:1, duration:1.2, ease:"expo.out"});
    coverWall();
  }
  topTen();
  story();
  // "Rankings": letters float up into place once the section arrives (React Bits ScrollFloat, played on arrival rather than scrubbed)
  const g = document.querySelector("#rankings .giant");
  if (g) gsap.fromTo(SplitText.create(g, {type:"chars"}).chars, {yPercent:30, scaleY:1.4, transformOrigin:"50% 100%"},
    {yPercent:0, scaleY:1, stagger:.02, duration:.6, ease:"expo.out",
     scrollTrigger:{trigger:g, start:"top bottom", once:true}});
  rise(".rk-title, .rk-tools", .08);
  arrive("#rankings .row, #rankings .card", .04);
  // the hand-off wall: each book cover opens from the bottom edge as its row arrives, the chapter counts in beside it
  rise(".ho-head", 0);
  ScrollTrigger.batch(".ho-card", {start:"top bottom", once:true, onEnter: b=>{
    gsap.fromTo(b.map(x=>x.querySelector("img")), {scale:1.1}, {scale:1, duration:.6, ease:"expo.out", stagger:.04, clearProps:"transform"});
  }});
  // figures: the tiles step in one after another and the numbers count up (React Bits CountUp, ported)
  rise(".st-a, .st-r h2, .st-b, .st-c, .st-p", .09);
  gsap.utils.toArray(".st b").forEach(b=>countUp(b));
  rise(".faq-h h2", 0);
  rise(".faq details", .06);
  marquee();
}
function motionSeries(){
  const sh = document.querySelector(".sh"); if (!sh) return;
  const tl = gsap.timeline({delay:.05});
  tl.fromTo(".sh-cov img", {scale:1.08}, {scale:1, duration:.6, ease:"expo.out", stagger:.06, clearProps:"transform"})
    .from(".sh-r > .t", {scale:.98, duration:.5, stagger:.04, clearProps:"transform"}, 0);
  rise(".sh .pane", 0);
  arrive(".pane .arc, .related .card", .05);
  const rh = document.querySelector(".related h2");
  if (rh) gsap.from(rh, {y:20, duration:.6, scrollTrigger:{trigger:rh, start:"top bottom", once:true}, clearProps:"transform"});
}
function motionCommon(){
  // the closing tiles step in; the name rises out of its tile once the footer arrives
  rise("footer > *", .06);
  const nm = document.querySelector("footer .name");
  if (nm) gsap.fromTo(nm, {yPercent:20}, {yPercent:0, duration:.6, ease:"expo.out", scrollTrigger:{trigger:"footer .f-name", start:"top bottom", once:true}});
}
/* the cover wall: columns drift up and down on their own at a steady pace (React Bits ScrollVelocity, ported to columns, without the scroll link) */
function coverWall(){
  const cols = [...document.querySelectorAll(".cwall .col")]; if (!cols.length) return;
  const st = cols.map((c,i)=>({lane:c.firstElementChild, y:-(i*97 % 400), dir:Number(c.dataset.dir), h:0}));
  const measure = ()=>st.forEach(o=>{ o.h = o.lane.scrollHeight/2; });
  measure(); addEventListener("resize", measure);
  let on = true;
  const io = new IntersectionObserver(es=>{ on = es[0].isIntersecting; }); io.observe(document.querySelector(".cine"));
  const tick = (t, dt)=>{
    if (!on || !st[0].h) return;
    st.forEach(o=>{ o.y += o.dir * 22 * Math.min(64, dt)/1000; o.y = ((o.y % o.h) - o.h) % o.h; o.lane.style.transform = `translate3d(0,${o.y}px,0)`; });
  };
  gsap.ticker.add(tick);
  gsCtx?.add(()=>()=>{ gsap.ticker.remove(tick); io.disconnect(); removeEventListener("resize", measure); });
}
/* the top ten: the heading rises and the covers open one after another once the section arrives */
function topTen(){
  const sec = document.querySelector(".top10"); if (!sec) return;
  // everything is visible before this plays: it only moves things the last few pixels into place
  const tl = gsap.timeline({scrollTrigger:{trigger:sec, start:"top bottom", once:true}});
  tl.from(".t10-head > *", {y:20, stagger:.05, duration:.5, clearProps:"transform"})
    .fromTo(".t10-card img", {scale:1.08}, {scale:1, duration:.6, ease:"expo.out", stagger:.04, clearProps:"transform"}, .05)
    .from(".t10-n", {y:16, duration:.5, stagger:.03, clearProps:"transform"}, .1);
}
/* the story plays once when it arrives: the anime steps aside, the book opens and the chapter counts up */
function story(){
  const sec = document.querySelector(".story"); if (!sec) return;
  const n = sec.querySelector(".story-n"), end = Number(n.dataset.n) || 0, o = {v:0};
  gsap.timeline({scrollTrigger:{trigger:sec, start:"top 80%", once:true}})
    .fromTo(".sa-anime", {xPercent:12, rotate:-2}, {xPercent:0, rotate:-4, duration:.6, ease:"expo.out"}, 0)
    .fromTo(".sa-book .cover img", {scale:1.1}, {scale:1, duration:.6, ease:"expo.out", clearProps:"transform"}, .1)
    .fromTo(o, {v:Math.max(0, end-30)}, {v:end, duration:.6, ease:"expo.out", onUpdate:()=>{ n.textContent = Math.round(o.v); }, onComplete:()=>{ n.textContent = end; }}, .1);
}
/* smooth scrolling (Lenis) drives ScrollTrigger from GSAP's own clock; wheel only, touch keeps native scrolling */
let lenis = null;
function smooth(){
  if (lenis || !GS() || !window.Lenis) return;
  lenis = new Lenis({lerp:.11, wheelMultiplier:1, anchors:{offset:-84}});
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(t=>lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
}
/* parts of a section rise in once as it arrives, in order */
function rise(sel, stagger){
  const els = gsap.utils.toArray(sel).filter(e=>e.getBoundingClientRect().top > innerHeight*.9);
  if (!els.length) return;
  gsap.set(els, {y:20});                            // moved, never hidden: the content reads even if this never plays
  ScrollTrigger.batch(els, {start:"top bottom", once:true,
    onEnter: b => gsap.to(b, {y:0, stagger, duration:.5, ease:"expo.out", overwrite:true, clearProps:"transform"})});
}
/* items below the fold wait out of sight and rise in small groups as they arrive */
function arrive(sel, stagger){
  const els = gsap.utils.toArray(sel).filter(e=>e.getBoundingClientRect().top > innerHeight*.92);
  if (!els.length) return;
  gsap.set(els, {y:12});
  ScrollTrigger.batch(els, {start:"top bottom", once:true,
    onEnter: b => gsap.to(b, {y:0, stagger, duration:.4, overwrite:true, clearProps:"transform"})});
}
/* count a figure up from zero when it arrives (React Bits CountUp, ported); the real number is already in the HTML */
function countUp(el){
  const end = Number(el.textContent.replace(/[^\d.]/g,"")); if (!end) return;
  const o = {v:0};
  gsap.to(o, {v:end, duration:.8, ease:"expo.out", scrollTrigger:{trigger:el, start:"top bottom", once:true},
    onUpdate:()=>{ el.textContent = Math.round(o.v).toLocaleString("en"); }, onComplete:()=>{ el.textContent = end.toLocaleString("en"); }});
  el.textContent = "0";
}
/* title wall: two rows that drift on their own in opposite directions (React Bits ScrollVelocity, ported, without the scroll link) */
function marquee(){
  const rows = [...document.querySelectorAll(".mq-row")]; if (!rows.length) return;
  const st = rows.map((r,i)=>({r, track:r.firstElementChild, x:0, dir:i%2?1:-1, w:r.firstElementChild.scrollWidth/2}));
  let last = performance.now(), visible = false;
  const io = new IntersectionObserver(es=>{ visible = es[0].isIntersecting; }); io.observe(rows[0].parentElement);
  // a row holds still under the pointer or keyboard focus, and a focused title is brought into view
  st.forEach(o=>o.r.addEventListener("focusin", e=>{ o.x = -Math.max(0, e.target.offsetLeft - 24); o.r.scrollLeft = 0; o.track.style.transform = `translate3d(${o.x}px,0,0)`; }));
  const tick = now=>{
    marqueeRAF = requestAnimationFrame(tick);
    const dt = Math.min(64, now-last)/1000; last = now; if (!visible) return;
    st.forEach(o=>{ if (o.r.matches(":hover,:focus-within")) return;
      o.x += o.dir * 38 * dt; o.x = ((o.x % o.w) - o.w) % o.w; o.track.style.transform = `translate3d(${o.x}px,0,0)`; });
  };
  marqueeRAF = requestAnimationFrame(tick);
}
/* small sparks from a rating the viewer just gave (React Bits ClickSpark, ported) */
function spark(btn){
  if (!GS()) return;
  const r = btn.getBoundingClientRect(), wrap = document.createElement("span");
  wrap.className = "spark"; wrap.style.cssText = `left:${r.left+r.width/2}px;top:${r.top+r.height/2}px`;
  for (let i=0;i<8;i++){ const l = document.createElement("i"); wrap.appendChild(l); gsap.set(l, {rotation:i*45}); }
  document.body.appendChild(wrap);
  gsap.fromTo(wrap.children, {scaleY:.2, autoAlpha:1}, {scaleY:1, duration:.18, ease:"power3.out",
    onComplete:()=>gsap.to(wrap.children, {scaleY:0, autoAlpha:0, duration:.22, ease:"power2.out", onComplete:()=>wrap.remove()})});
}
function marqueeHTML(){
  const xs = SERIES.filter(s=>s.next && s.score!=null).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(8,32);
  // the second copy of each row only closes the loop, so screen readers and the Tab key skip it
  const item = (s, dup) => `<a href="${seriesHref(s.id,"manga")}"${dup ? ' aria-hidden="true" tabindex="-1"' : ""}>${esc(s.title)} <b>${hoAbbr(s)}</b></a>`;
  const row = list => `<div class="mq-row"><div class="mq-track">${list.map(s=>item(s)).join("")}${list.map(s=>item(s,true)).join("")}</div></div>`;
  return `<div class="t mq">${row(xs.slice(0,12))}${row(xs.slice(12))}</div>`;
}
const COUNTS = STATIC ? (window.ANIMETER.counts||{}) : (()=>{ const ds = Object.values(DETAILS||{}).filter(Boolean);
  return {guides: ds.length, arcs: ds.reduce((t,d)=>t+(d.arcs||[]).length,0), events: ds.reduce((t,d)=>t+(d.arcs||[]).reduce((u,a)=>u+(a.events||[]).length,0),0),
    filler: ds.reduce((t,d)=>t+Object.values(epKinds(d).kinds).filter(k=>k==="f").length,0)}; })();
const nf = n => Number(n||0).toLocaleString("en");
/* the hand-off wall: the eight most-read series whose anime stops partway through the book */
function handoffHTML(){
  const xs = SERIES.filter(s=>s.next && s.score!=null).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,8);
  const hand = SERIES.filter(s=>s.next).length;
  return `<section class="board ho" aria-labelledby="ho-h">
    <div class="t stone ho-head" data-r><h2 id="ho-h">Where the manga picks up</h2>
      <div><p>${nf(hand)} anime stop partway through the book they adapt. Each one comes with the chapter to start from, so you can keep reading the story without starting over.</p></div></div>
    ${xs.map((s,i)=>`<a class="t ho-card" data-r style="--i:${i%4};--tone:${esc(s.tone||"#3a3834")}" href="${seriesHref(s.id,"manga")}">
      <div class="cover"><img src="${ROOT}covers/${s.id}-manga.jpg" alt="${esc(s.title)} ${s.kind==="novel"?"light novel":"manga"} cover" loading="lazy" width="460" height="649" onerror="this.src='${ROOT}covers/${s.id}-anime.jpg'"></div>
      <span class="lab"><b>${hoAbbr(s)}</b><span>${esc(s.title)}</span></span></a>`).join("")}
    ${marqueeHTML()}
  </section>`;
}
/* three figures on three tiles that refuse to line up */
function figuresHTML(){
  const pic = SERIES.filter(s=>s.score!=null).sort(byScore)[0];
  return `<section class="board st" aria-labelledby="st-h">
    <div class="t tone st-a" data-r style="${pic ? toneVars(pic) : ""}"><b>${nf(COUNTS.guides)}</b><span>series with a full guide: arcs, key events, filler and the chapter to read next</span></div>
    <div class="st-r"><h2 id="st-h" data-r>Inside every guide</h2>
      <div class="t deep st-b" data-r style="--i:1"><b>${nf(COUNTS.arcs)}</b><span>story arcs, each with its episode range</span></div>
      <div class="t deep st-c" data-r style="--i:2"><b>${nf(COUNTS.filler)}</b><span>filler episodes marked, with a skip list you can copy</span></div>
      <p class="st-p" data-r>Every series page opens on the answer: where the anime ends and where the book picks up. Below it, the drop map shows the episode viewers quit and the one where the show clicked for them, from reports people leave here. ${nf(COUNTS.events)} key events stay blurred until you choose to read them, and every range links to its source.</p>
    </div>
  </section>`;
}
function faqHTML(){
  const qs = [
    ["Where do the drop numbers come from?", "From visitors. Signed-in readers report the episode where they stopped and the episode where the show clicked for them. Each chart says how many people reported, and a series nobody has reported on yet says so instead of guessing."],
    ["How is the manga chapter worked out?", `${nf(SERIES.filter(s=>s.next).length)} series have a chapter or volume to start from, each with its source linked on the Manga tab. Series that are original anime, or that haven't been checked yet, are labelled that way rather than given a number.`],
    ["What counts as filler?", "Episodes that aren't adapted from the source. Episodes that mix source and new material are marked mixed, recaps are marked recap, and the filler tab lists the source for every range."],
    ["Which score is the ranking?", "By default the list follows AniList's average user score. Switch the sort to Animeter score to rank by ratings left here. A series needs five ratings before it gets an Animeter score."],
    ["Do I need an account?", "Not to read anything. To rate a series, report where you stopped or keep a list, sign in with your email: we send a link and a six-digit code, and there is no password."]];
  return `<section class="board faq" aria-labelledby="faq-h"><div class="faq-h"><h2 id="faq-h" data-r>Before you ask</h2></div>
    <div class="faq-l">${qs.map(([q,a],i)=>`<details name="faq" data-r style="--i:${i}"${i===0?" open":""}><summary>${q}<i aria-hidden="true"></i></summary><p>${a}</p></details>`).join("")}</div></section>`;
}
let homeWired = false;                    // prerendered pages arrive with #rk already in place, unwired
function renderHome(){
  const app = document.getElementById("app");
  if (!homeWired || !document.getElementById("rk")){
    homeWired = true;
    patch(app).html = `
      ${mastHTML(true)}
      ${route().missing ? `<p class="missing"><b>Page not found.</b> That address isn't a page on Animeter. Here are the rankings instead.</p>` : ""}
      ${cineHTML()}${top10HTML()}${storyHTML()}
      <section id="rankings" class="board rk" aria-labelledby="rk-h">
        <div class="t rk-title"><h2 class="giant" id="rk-h">Rankings</h2><p class="rk-basis" id="basis"></p></div>
        <div class="t rk-tools">
          <div class="controls">
            <input type="search" id="q" placeholder="Find a series" aria-label="Find a series" value="${esc(query)}">
            <label class="sortby"><span class="label">Sort</span><select id="sort">${SORTS.map(([k,l])=>`<option value="${k}" ${k===sortBy?"selected":""}>${l}</option>`).join("")}</select></label>
            <div class="seg" role="group" aria-label="View">
              <button type="button" data-view="list">List</button>
              <button type="button" data-view="wall">Covers</button>
            </div>
          </div>
          <div class="tagbar"><button type="button" class="tagbtn" id="tagbtn" aria-expanded="false" aria-controls="tagpanel">Tags<span class="n" id="tagn"></span></button><div class="picked" id="picked"></div></div>
        </div>
        <div class="t tagpanel" id="tagpanel" hidden>
          <div class="tp-top"><input type="search" id="tagq" placeholder="Find a tag, e.g. Shounen, Isekai" aria-label="Find a tag"><button type="button" class="ghost" id="tagdone">Done</button></div>
          ${allTags().map(([g,l])=>`<div class="tg" data-group="${g}"><h3>${g}</h3><div class="tags" role="group" aria-label="${g}">${l.map(([t,n])=>`<button type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}<span class="n">${n}</span></button>`).join("")}</div></div>`).join("")}
        </div>
        <div id="rk"></div>
        <nav class="pager" id="pager" aria-label="Pages"></nav>
      </section>
      ${handoffHTML()}${figuresHTML()}${faqHTML()}`;
    app.querySelectorAll("[data-jump]").forEach(a=>a.addEventListener("click", e=>{ e.preventDefault(); { const to = document.getElementById(a.getAttribute("href").slice(1)); lenis ? lenis.scrollTo(to, {offset:-84}) : to.scrollIntoView({behavior: reduceMotion()?"auto":"smooth", block:"start"}); } }));
    document.getElementById("q").addEventListener("input", e=>{ query=e.target.value; page=1; renderRankings(); });
    document.getElementById("sort").addEventListener("change", e=>{ sortBy=e.target.value; page=1; renderRankings(); });
    const panel = document.getElementById("tagpanel"), tbtn = document.getElementById("tagbtn");
    const openPanel = open => { panel.hidden = !open; tbtn.setAttribute("aria-expanded", open); if (open) document.getElementById("tagq").focus({preventScroll:true}); };
    tbtn.addEventListener("click", ()=>openPanel(panel.hidden));
    document.getElementById("tagdone").addEventListener("click", ()=>{ openPanel(false); tbtn.focus(); });
    document.getElementById("tagq").addEventListener("input", e=>{
      const v = e.target.value.trim().toLowerCase();
      panel.querySelectorAll(".tg").forEach(g=>{ let any=false;
        g.querySelectorAll("[data-tag]").forEach(b=>{ const m = !v || b.dataset.tag.toLowerCase().includes(v); b.hidden = !m; any = any || m; });
        g.hidden = !any; });
    });
    const toggleTag = e=>{
      const b = e.target.closest("button"); if (!b) return;
      if (b.id==="clrtags") tags.clear(); else if (b.dataset.tag) tags.has(b.dataset.tag) ? tags.delete(b.dataset.tag) : tags.add(b.dataset.tag); else return;
      page=1; renderRankings();
    };
    panel.addEventListener("click", toggleTag);
    document.getElementById("picked").addEventListener("click", toggleTag);
    app.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; try{localStorage.setItem("view",view)}catch(_){}; renderRankings(); }));
    document.getElementById("pager").addEventListener("click", e=>{
      const b = e.target.closest("button[data-page]"); if (!b || b.disabled) return;
      page = Number(b.dataset.page); renderRankings();
      document.getElementById("rankings").scrollIntoView({behavior: reduceMotion()?"auto":"smooth", block:"start"});
    });
  }
  if (!route().missing) document.querySelector(".missing")?.remove();
  renderRankings();
  wireFinder(); { const t = document.querySelector(".cine"); if (t) setTone(t.getAttribute("style")); } if (!GS()) wireRise(); motion("home");
}
function renderRankings(){
  const all = ranked(), site = siteScores();
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const items = all.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const anyVotes = Object.values(site).some(v=>v.shown);
  document.getElementById("basis").textContent = {
    anilist: "Ordered by AniList's average user score.",
    site: anyVotes ? `Ordered by Animeter ratings from visitors. A series needs ${MIN_VOTES} ratings before it gets a score here. Series with fewer sit at the bottom.` : `No series has enough Animeter ratings yet. Open a series and rate it 1 to 10; a score shows once it has ${MIN_VOTES}.`,
    popular: "Ordered by how many AniList users have the series on their list.",
    new: "Newest first, by the year the anime started.",
    old: "Oldest first, by the year the anime started.",
    az: "In alphabetical order.",
  }[sortBy] + (tags.size ? ` Showing ${all.length} tagged ${[...tags].join(" + ")}.` : "");
  document.querySelectorAll("[data-tag]").forEach(b=>b.setAttribute("aria-pressed", tags.has(b.dataset.tag)));
  const pk = document.getElementById("picked");
  if (pk) pk.innerHTML = [...tags].map(t=>`<button type="button" data-tag="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)} ×</button>`).join("") + (tags.size>1 ? `<button type="button" class="clr" id="clrtags">Clear all</button>` : "");
  const tn = document.getElementById("tagn"); if (tn) tn.textContent = tags.size ? tags.size : "";
  const so = document.getElementById("sort"); if (so) so.value = sortBy;
  document.querySelectorAll("[data-sort]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.sort===sortBy));
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.view===view));
  const box = document.getElementById("rk");
  if (!items.length){ box.innerHTML = `<div class="none">No series matches ${query.trim() ? `"${esc(query)}"` : ""}${query.trim() && tags.size ? " with " : ""}${tags.size ? "all of these tags" : ""}.</div>`; document.getElementById("pager").innerHTML=""; return; }
  const chip = s => `<span class="chip ${s.next?'b':'k'}">${hoAbbr(s)}</span>`;
  if (view==="list"){
    patch(box).html = `<div class="list">` + items.map(({s,site,rank})=>`
      <a class="row" href="${seriesHref(s.id)}">
        <span class="rank">${rank}</span>
        ${coverHTML(s,"anime")}
        <span style="min-width:0"><span class="t">${esc(s.title)}</span><br><span class="meta">${[s.year, (s.genres||[]).slice(0,2).join(", ")].filter(Boolean).map(esc).join(" · ")}</span></span>
        <span class="sc gold"><b>${s.score?fmt10(s.score/10):"—"}</b><small>AniList</small></span>
        <span class="sc site"><b>${site.shown?fmt10(site.avg):"—"}</b><small>${site.shown ? site.votes+" votes" : site.votes ? "Not enough votes yet" : "Animeter"}</small></span>
        <span class="ch">${chip(s)}</span>
      </a>`).join("") + `</div>`;
  } else {
    patch(box).html = `<div class="wall">` + items.map(({s,site,rank})=>`
      <a class="card" href="${seriesHref(s.id)}">
        ${coverHTML(s,"anime","",`<span class="rk">${rank}</span>${obiHTML(s, sortBy==="site" ? (site.shown?fmt10(site.avg):"") : (s.score?fmt10(s.score/10):""))}`)}
        <span class="t">${esc(s.title)}</span>
        <span class="m"><span>${esc([s.year,(s.genres||[])[0]].filter(Boolean).join(" · "))}</span></span>
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
  return `<h2>${run.length > 1 ? `${run.length} seasons, ${s.eps} episodes` : "Watch order"}</h2>
    <p class="sub">In airing order. Episode numbers on this site count straight through every season, so season 2 starts at episode ${run[1]?.from ?? "—"}.</p>
    <div class="arcs">${run.map((r,i)=>`
      <div class="arc"><span class="no">${i+1}</span>
        <div style="min-width:0"><span class="part">${esc([r.y, fmtName(r.f)].filter(Boolean).join(" · "))}${r.airing?' · <b class="p">Airing</b>':""}</span><h4>${esc(r.t)}</h4></div>
        <div class="rng"><span class="label">Episodes</span><b class="mono">${r.from}–${r.from+r.e-1}</b><span class="label">${r.e} ep${r.airing?" so far":""}</span></div>
      </div>`).join("")}</div>
    ${ex.length ? `<h2 style="margin-top:30px">Films, OVAs and specials</h2><p class="sub">Not counted in the episode numbers above.</p>
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
  let total = f.total || 0;
  (d?.arcs||[]).forEach(a=>{ if (a.eps && a.eps[1]!=null) total = Math.max(total, a.eps[1]); });
  ["filler","mixed","recap"].forEach(k=>(f[k]||[]).forEach(([,b])=>{ total = Math.max(total,b); }));
  return {total, kinds};
}

function paneOverview(s){
  if (s.eps < 3) return `<h2>Is it worth watching?</h2><p class="sub">The drop map is for series. Rate ${s.format==="MOVIE" ? "the film" : "it"} above to add to its Animeter score.</p>`;
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
  const form = !writable ? (STATIC && SB.supabaseUrl && !myId ? `<p class="note">Sign in above with your email to add your report.</p>` : dbState!=="on" ? "" : STATIC && !myId ? `<p class="note">Sign in above with your email to add your report.</p>` : `<p class="note">Your access lets you read reports but not add them.</p>`) : `
    <form class="vote" id="vote">
      <label for="clicked">It clicked for me at
        <select id="clicked"><option value="">Choose…</option><option value="never" ${mine.clicked==="never"?"selected":""}>It never clicked</option>${epOpts(mine.clicked)}</select></label>
      <label for="stopped">I stopped watching at
        <select id="stopped"><option value="">Choose…</option><option value="no" ${mine.stopped==="no"?"selected":""}>I didn't stop</option>${epOpts(mine.stopped)}</select></label>
      <button class="btn" type="submit" id="save">${mine.clicked||mine.stopped ? "Update my report" : "Save my report"}</button>
    </form><div class="note" id="note">${myProgress(s, mine)}</div>`;
  return `<h2>Is it worth pushing through?</h2><p class="sub">${esc(verdict)}</p><div class="dm">${body}</div>${form}`;
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
  return `<h2>Arcs</h2><p class="sub">${esc(d.numbering||"")}</p>${bar}
    <div class="arcs">${d.arcs.map((a,i)=>{ const fs = fillerShare(a); return `
      <div class="arc"><span class="no">${i+1}</span>
        <div style="min-width:0"><span class="part">${esc(a.part||"")}</span><h4>${esc(a.name)}</h4><p>${esc(a.summary||"")}</p></div>
        <div class="rng">${a.eps&&a.eps[0]!=null?`<span>Ep ${rangeTxt(a.eps)}</span>`:`<span>Film</span>`}${a.ch&&a.ch[0]!=null?`<span>Ch ${rangeTxt(a.ch)}</span>`:""}${fs>=0.8?`<span class="chip p">Filler</span>`:fs>0?`<span class="chip k">Some filler</span>`:""}</div>
      </div>`; }).join("")}</div>${srcHTML(d.src)}`;
}
function paneEvents(s, d){
  const groups = (d?.arcs||[]).filter(a=>a.events?.length);
  if (!groups.length) return `<div class="empty"><b>Key events coming soon.</b>We haven't written up the big moments for ${esc(s.title)} yet.</div>`;
  return `<h2>Key events</h2><p class="sub">These are spoilers. They stay blurred until you reveal them, one at a time or all at once.</p>
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
  return `<h2>Filler</h2><p class="sub">${esc(d.filler.note||"")}</p>
    ${total?`<div class="fstats"><div><span class="label">Episodes</span><b>${total}</b></div><div><span class="label">Canon</span><b class="c">${total-nf-nm-nr}</b></div><div><span class="label">Filler</span><b class="f">${nf}</b></div><div><span class="label">Mixed</span><b>${nm}</b></div>${nr?`<div><span class="label">Recap</span><b>${nr}</b></div>`:""}</div>`:""}
    ${none ? "" : grid}
    ${ranges ? `<div class="skip"><span class="label">Skip list (filler episodes)</span><code>${esc(ranges)}</code></div>` : ""}
    ${srcHTML(d.src)}`;
}
function paneManga(s){
  if (s.unchecked && !s.mangaChecked) return `<h2>${s.kind==="original"||s.kind==="vn" ? "Is there a manga to continue?" : "Anime finished. Where does the story pick up?"}</h2>
    <div class="handoff"><div class="big word"><small>Status</small>${s.kind==="original" ? "Original" : s.kind==="vn" ? "Game" : "Not checked yet"}</div><p>${esc(s.note)}</p></div>${srcHTML(s.src)}`;
  const unit = s.unit || "Chapter";
  const q = s.kind==="novel" ? "Anime finished. Where does the story go next?" : (s.kind==="original"||s.kind==="vn") ? "Is there a manga to continue?" : "Anime finished. Where does the manga pick up?";
  return `<h2>${q}</h2>
    <div class="handoff">
      <div class="big${s.next?"":" word"}"><small>${s.next ? "Start at "+esc(unit) : "Status"}</small>${s.next ? esc(s.next) : esc(s.endWord||{original:"Original",vn:"Game",novel:"Novel"}[s.kind]||"Done")}</div>
      <p>${esc(s.note)}</p>
    </div>
    ${s.seasons?.length ? timelineHTML(s) : ""}${srcHTML(s.src)}`;
}

/* "More like this": shared genres and tags, weighted by score; gives every series page links to six others */
function relatedHTML(s){
  const mine = new Set([...(s.genres||[]), ...(s.tags||[]).slice(0,6)]);
  const top = SERIES.filter(x=>x.id!==s.id).map(x=>{
    let n = 0; (x.genres||[]).forEach(g=>mine.has(g)&&n++); (x.tags||[]).slice(0,6).forEach(g=>mine.has(g)&&(n+=1.5));
    return [n + (x.score||0)/12 + Math.log10(x.popularity||10)/2, x];
  }).sort((a,b)=>b[0]-a[0]).slice(0,6).map(([,x])=>x);
  return `<section class="board related" aria-labelledby="rel-h"><h2 id="rel-h">More like ${esc(s.title)}</h2><div class="wall">${top.map(x=>`<a class="card" href="${seriesHref(x.id)}">${coverHTML(x,"anime","",obiHTML(x, x.score?fmt10(x.score/10):""))}<span class="t">${esc(x.title)}</span></a>`).join("")}</div></section>`;
}
function renderSeries(id, tab){
  const s = byId[id], d = DETAILS[id], ss = siteScores()[id];
  const mine = (myId && reports[myId] && reports[myId][id]) || {};
  const writable = STATIC ? !!(SB.supabaseUrl && myId) : dbState==="on" && canWrite;
  const counts = {seasons: s.run?.length > 1 ? s.run.length : null, arcs: d?.arcs?.length, events: (d?.arcs||[]).reduce((t,a)=>t+(a.events?.length||0),0), filler: d?.filler ? epKinds(d).total && Object.values(epKinds(d).kinds).filter(k=>k==="f").length : null};
  const rateRow = !writable ? "" : `<div class="rate" role="group" aria-label="Rate ${esc(s.title)} from 1 to 10"><span class="label">Your rating</span>
<span class="strip">${Array.from({length:10},(_,i)=>`<button type="button" data-rate="${i+1}" aria-pressed="${mine.rating===i+1}" aria-label="${i+1} out of 10" class="${mine.rating>i+1?'fill':''}">${i+1}</button>`).join("")}</span>
      ${mine.rating?`<button type="button" class="clear" data-rate="0">Clear</button>`:""}</div><div class="note" id="rnote"></div>`
    + `<details class="wl"><summary class="${mine.status ? "on "+mine.status : ""}">${mine.status ? "✓ "+esc(STATUSES.find(([k])=>k===mine.status)[1]) : "+ Add to list"}</summary><div class="menu" role="group" aria-label="Add ${esc(s.title)} to your list">${STATUSES.map(([k,l])=>`<button type="button" data-st="${k}" aria-pressed="${mine.status===k}">${l}</button>`).join("")}${mine.status ? `<button type="button" class="rm" data-st="${mine.status}">Remove from list</button>` : ""}</div></details><div class="note" id="wnote"></div>`
    + (STATIC && myId ? `<div class="who">Signed in as ${esc(sbEmail())}<button type="button" id="signout">Sign out</button></div>` : "");
  // the sign-in form stays folded until someone asks to rate or report, so the page opens on the answer
  const gate = STATIC && SB.supabaseUrl && !myId ? `<details class="gate"><summary class="btn">Rate it or report where you stopped</summary><form class="signin" id="signin"><span class="label">Sign in first. We email you a link and a code, no password.</span>
      <input type="email" id="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address"><button class="btn" type="submit" id="sendlink">Email me a link</button></form><div class="note" id="snote"></div></details>` : "";
  const pane = {overview:()=>paneOverview(s), seasons:()=>paneSeasons(s), arcs:()=>paneArcs(s,d), events:()=>paneEvents(s,d), filler:()=>paneFiller(s,d), manga:()=>paneManga(s)}[tab]();
  const book = s.kind==="novel" ? "light novel" : "manga";
  const answer = s.next ? `<p class="answer">After the anime, read the ${book} from <span class="ch">${esc((s.unit||"Chapter")+" "+s.next)}</span>.</p>`
    : s.kind==="original"||s.kind==="vn" ? `<p class="answer">An <span class="ch">original anime</span>, so there's no book to continue with.</p>`
    : endState(s)==="own" ? `<p class="answer">The anime ends the story its own way, apart from the ${book}.</p>`
    : endState(s)==="fully" ? `<p class="answer">The anime covers the <span class="ch">whole ${book}</span>.</p>`
    : endState(s)==="ahead" ? `<p class="answer">The ${book} goes on past the anime.</p>`
    : `<p class="answer">We haven't found where the anime ends in the ${book} yet.</p>`;
  const bookTile = s.kind==="original"||s.kind==="vn" ? "" : `<div class="t pic">${coverHTML(s,"manga","","",true)}<span class="cap">${s.kind==="novel"?"Light novel":"Manga"}${s.next ? `, from ${esc((s.unit||"chapter").toLowerCase()+" "+s.next)}` : ""}</span></div>`;
  patch(document.getElementById("app")).html = `
    <div class="series" style="${toneVars(s)}">
    ${mastHTML(false, "compact")}
    <section class="board sh">
      <div class="sh-cov"><div class="t pic">${coverHTML(s,"anime","","",true)}<span class="cap">Anime, ${s.eps} episode${s.eps===1?"":"s"}</span></div>${bookTile}</div>
      <div class="sh-r">
        <div class="t sh-title"><h1>${esc(s.title)}</h1>${s.jp ? `<div class="jp" lang="ja">${esc(s.jp)}</div>` : ""}
          <div class="meta">${[s.year, (s.genres||[]).join(", ")].filter(Boolean).map(esc).join(", ")}</div></div>
        <div class="t tone sh-ans">${answer}</div>
        ${s.score?`<div class="t fact"><b>${fmt10(s.score/10)}</b><span class="label">AniList score</span></div>`:""}
        <div class="t fact"><b>${ss.shown ? fmt10(ss.avg) : "—"}</b><span class="label">Animeter${ss.shown ? `, ${ss.votes} votes` : ss.votes ? `, not enough votes yet (${ss.votes} of ${MIN_VOTES})` : ", no votes yet"}</span></div>
        <div class="t fact"${s.score?"":' style="grid-column:span 2"'}><b>${s.eps}</b><span class="label">${esc(s.epsLabel==="Movie" ? "film" : s.epsLabel==="Episodes" ? (s.eps===1?"episode":"episodes") : "episodes, "+s.epsLabel.toLowerCase())}</span></div>
        ${rateRow||gate ? `<div class="t deep sh-me">${rateRow}${gate}</div>` : ""}
      </div>
      <nav class="t tabs" aria-label="${esc(s.title)} sections">${TABS.filter(([k])=>tabShown(s,k)).map(([k,l])=>`<a href="${seriesHref(id,k)}" ${k===tab?'aria-current="page"':""}>${l}${counts[k]?`<span class="n">${counts[k]}</span>`:""}</a>`).join("")}</nav>
      <section class="t pane">${pane}</section>
    </section>
    ${relatedHTML(s)}</div>`;
  motion("s:"+id);
  document.getElementById("vote")?.addEventListener("submit", e=>saveReport(e, id));
  if (!window._wlWired){ window._wlWired = true; document.addEventListener("click", e=>{ const w = document.querySelector(".wl[open]"); if (w && !w.contains(e.target)) w.open = false; }); }
  document.querySelectorAll(".rate button").forEach(b=>b.addEventListener("click", ()=>{ if (b.dataset.rate!=="0") spark(b); saveRating(id, Number(b.dataset.rate)); }));
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
  if (!STATIC) document.title = r.profile ? "My list · Animeter" : r.id ? `${byId[r.id].title} · Animeter` : "Animeter";
  const de = document.documentElement.style;
  if (r.id){ const t = toneInk(byId[r.id].tone); de.setProperty("--tone", t.bg); de.setProperty("--tone-ink", t.ink); }
  else { de.removeProperty("--tone"); de.removeProperty("--tone-ink"); }
  if (r.static) return;
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
  const gate = STATIC && SB.supabaseUrl && !myId ? `<form class="signin" id="signin"><span class="label">Sign in to keep a list. We email you a link and a code, no password.</span>
      <input type="email" id="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address"><button class="btn" type="submit" id="sendlink">Email me a link</button></form><div class="note" id="snote"></div>` : "";
  const body = signedOut ? (gate || `<div class="empty"><b>Lists aren't available in this view.</b>${STATIC ? "Voting and lists aren't switched on yet." : "Sign in to claude.ai to keep a list."}</div>`)
    : dbState==="loading" && !ids.length ? `<div class="empty"><b>Loading your list…</b></div>`
    : `<div class="counts">${STATUSES.map(([k,l])=>`<div><span class="label">${l}</span><b>${by(k).length}</b></div>`).join("")}<div><span class="label">Rated</span><b>${rated.length}</b></div></div>
       ${STATIC ? `<div class="who">Signed in as ${esc(sbEmail())}<button type="button" id="signout">Sign out</button></div>` : ""}
       ${!ids.length ? `<div class="empty" style="margin-top:22px"><b>Your list is empty.</b>Open any series and pick Watching, Completed, Plan to watch or Dropped under its title.</div>` : ""}
       ${STATUSES.map(([k,l])=>{ const xs = by(k); return xs.length ? `<h3>${l} <span class="label">${xs.length}</span></h3><div class="wall">${xs.map(card).join("")}</div>` : ""; }).join("")}
       ${rated.length ? `<h3>Your ratings <span class="label">${rated.length}</span></h3><div class="wall">${rated.map(card).join("")}</div>` : ""}`;
  patch(document.getElementById("app")).html = `
    <div class="chap c-ground" data-chap>${mastHTML(false, "compact")}
    <section class="prof in-w"><h2>My list</h2><p class="sub">What you're watching, what you finished, what you dropped, and your ratings.</p>${body}</section></div>`;
  document.getElementById("signin")?.addEventListener("submit", sendLink);
  document.getElementById("signout")?.addEventListener("click", signOut);
  motion("profile");
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
  if (toChrome()) return null;
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
    note.innerHTML = `<span>Check ${esc(email)}. Tap the link, or type the code from the email here so you stay in this browser.</span>
      <form class="otp" id="otpform"><input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="Code" aria-label="Code from the email" required><button class="btn" type="submit">Sign in</button></form>`;
    document.getElementById("otpform").addEventListener("submit", ev=>verifyCode(ev, email));
    document.getElementById("otp").focus();
  }catch(err){ btn.disabled = false; note.textContent = err.status===429 ? "Too many sign-in emails just now. Try again in a few minutes." : "Couldn't send the email. Check the address and try again."; }
}
async function verifyCode(e, email){
  e.preventDefault();
  const f = e.target, token = f.querySelector("#otp").value.replace(/\D/g,""), btn = f.querySelector("button");
  btn.disabled = true;
  try{
    const sess = await sbFetch("/auth/v1/verify", {method:"POST", body:JSON.stringify({type:"email", email, token})});
    sbKeep({...sess, expires_at: sess.expires_at || Math.floor(Date.now()/1000) + (sess.expires_in||3600)});
    _site = null; render();
  }catch(err){ btn.disabled = false;
    const old = f.querySelector(".err") || f.appendChild(Object.assign(document.createElement("span"), {className:"err"}));
    old.textContent = err.status===429 ? "Too many tries. Wait a minute." : "That code didn't work. Check it, or ask for a new email."; }
}
/* Mail apps open the link in their own browser, so the sign-in stays there. On Android, hand the link to Chrome. */
function toChrome(){
  const ua = navigator.userAgent;
  if (/Android/.test(ua) && /; wv\)|GSA\/|FB_IAB|Instagram/.test(ua) && location.hash.includes("access_token")){
    const u = location.href.replace(/^https?:\/\//, "");
    location.replace(`intent://${u}#Intent;scheme=https;package=com.android.chrome;end`);
    return true;
  }
  return false;
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

/* static build: moving between tabs, series, rankings and My list swaps the page in place, no reload */
function routeFromPath(path){
  if (!path.startsWith(ROOT)) return null;
  const parts = path.slice(ROOT.length).replace(/index\.html$/,"").split("/").filter(Boolean);
  if (!parts.length) return "";
  if (parts.length===1 && parts[0]==="profile") return "profile";
  if (byId[parts[0]] && parts.length<=2) return parts.join(".");
  return null;
}
function navTo(url, push){
  const r = routeFromPath(url.pathname);
  if (r===null) return false;
  const tid = r.split(".")[0];
  if (tid && tid!=="profile" && !(byId[tid] && byId[tid]._full)) return false;    // other series: its data loads with its page
  const prev = route();
  document.body.dataset.route = r;
  if (push) history.pushState({}, "", url.pathname + url.hash);
  render();
  fetch(url.pathname).then(x=>x.text()).then(t=>{                       // keep title, description and canonical true to the page
    const h = new DOMParser().parseFromString(t, "text/html");
    document.title = h.title;
    ["meta[name=description]","link[rel=canonical]","meta[name=robots]"].forEach(q=>{ const a = document.head.querySelector(q), b = h.head.querySelector(q);
      if (a && b) a.replaceWith(b.cloneNode()); else if (a) a.remove(); else if (b) document.head.appendChild(b.cloneNode()); });
  }).catch(()=>{});
  const now = route();
  if (url.hash==="#find") focusFinder();
  else if (url.hash==="#rankings"){ const el=document.getElementById("rankings"); if (el) el.scrollIntoView(); }
  else if (!(prev.id && prev.id===now.id)) window.scrollTo({top:0, behavior:"auto"});
  return true;
}
if (STATIC){
  document.querySelectorAll("footer a, .mast a").forEach(a=>a.setAttribute("href", a.href));   // static links stay right after the URL changes in place
  document.addEventListener("click", e=>{
    if (e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]"); if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin!==location.origin || (url.pathname===location.pathname && url.hash)) return;
    if (navTo(url, true)) e.preventDefault();
  });
  window.addEventListener("popstate", ()=>navTo(new URL(location.href), false));
}

/* header: the search link goes to the finder on the home page; the phone menu closes once used or clicked away from */
document.addEventListener("toggle", e=>{ if (e.target.matches?.(".gate") && e.target.open) e.target.querySelector("input")?.focus(); }, true);
function focusFinder(){
  const f = document.getElementById("find"); if (!f) return false;
  f.scrollIntoView({block:"center", behavior:"auto"}); f.focus({preventScroll:true}); return true;
}
document.addEventListener("click", e=>{
  const m = document.querySelector(".navmenu[open]");
  if (m && (!m.contains(e.target) || e.target.closest(".navpanel a"))) m.open = false;
  if (e.target.closest("[data-find]") && focusFinder()) e.preventDefault();
});
document.addEventListener("keydown", e=>{ if (e.key==="Escape"){ const m = document.querySelector(".navmenu[open]"); if (m){ m.open = false; m.querySelector("summary").focus(); } } });
(function init(){
  render();
  if (location.hash==="#find") setTimeout(focusFinder, 0);
  setTimeout(()=>document.documentElement.classList.add("calm"), 1600);   // entrance motion plays once per visit, not on every re-render
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
