// Fill each page's <div id="app"> with what app.js renders, so search engines see the content
// without running scripts. Run after build_static.py:  node web/prerender.js
const fs = require("fs"), path = require("path"), {chromium} = require("playwright");
const DIST = path.join(__dirname, "..", "docs");
const pages = [];
(function walk(d){ for (const f of fs.readdirSync(d)){ const p = path.join(d,f);
  if (fs.statSync(p).isDirectory()) { if (f!=="covers") walk(p); } else if (f==="index.html") pages.push(p); } })(DIST);
(async()=>{
  const b = await chromium.launch({executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined}).catch(()=>chromium.launch());
  const pg = await b.newPage(); const errs = [];
  pg.on("pageerror", e=>errs.push(e.message));
  await pg.route(/^https?:/, r=>r.abort());       // no fonts or network needed for the snapshot
  for (const file of pages){
    await pg.goto("file://"+file+"?prerender");
    await pg.waitForFunction(()=>document.getElementById("app").children.length>0);
    const inner = await pg.evaluate(()=>{ const a = document.getElementById("app").cloneNode(true);
      a.querySelectorAll("img").forEach(i=>i.removeAttribute("onerror")); return a.innerHTML; });
    const html = fs.readFileSync(file,"utf8").replace('<div id="app"></div>', ()=>'<div id="app">'+inner+'</div>');
    fs.writeFileSync(file, html);
  }
  console.log(`prerendered ${pages.length} pages, ${errs.length} script errors`, errs.slice(0,5));
  await b.close();
})();
