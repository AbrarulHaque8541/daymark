const ENGINES=[{id:"ddg",label:"DuckDuckGo",mark:"D",tone:"#de5833"},{id:"google",label:"Google",mark:"G",tone:"#4285f4"},{id:"brave",label:"Brave",mark:"B",tone:"#fb542b"},{id:"bing",label:"Bing",mark:"b",tone:"#00809d"},{id:"perplexity",label:"Perplexity",mark:"*",tone:"#1a1a1a"}];
const DIALS=[{title:"Wikipedia",url:"https://wikipedia.org",letter:"W"},{title:"Tasks",url:"daymark://tasks",letter:"T"},{title:"News",url:"https://news.google.com",letter:"N"},{title:"Maps",url:"https://maps.google.com",letter:"M"},{title:"YouTube",url:"https://youtube.com",letter:"Y"},{title:"GitHub",url:"https://github.com",letter:"G"},{title:"Reddit",url:"https://reddit.com",letter:"R"},{title:"Translate",url:"https://translate.google.com",letter:"अ"}];
const FEATURES=[{id:"shields",g:"Privacy",l:"Shields",d:1},{id:"cookieIsolation",g:"Privacy",l:"Cookie isolation",d:1},{id:"antiFingerprint",g:"Privacy",l:"Anti-fingerprinting",d:1},{id:"httpsOnly",g:"Privacy",l:"HTTPS lock",d:1},{id:"dataSaver",g:"Performance",l:"Data saver",d:0},{id:"reader",g:"Reading",l:"Reader mode",d:1},{id:"readingList",g:"Reading",l:"Reading list",d:1},{id:"pageNotes",g:"Reading",l:"Page notes",d:1},{id:"translate",g:"Tools",l:"Page translate",d:1},{id:"summarize",g:"Tools",l:"Page summary",d:1},{id:"downloadMgr",g:"Media",l:"Download manager",d:1},{id:"night",g:"Look",l:"Night mode",d:1},{id:"barBottom",g:"Look",l:"Address bar at bottom",d:0},{id:"animations",g:"Look",l:"Motion",d:1},{id:"askExit",g:"General",l:"Ask before closing tab",d:1},{id:"fireButton",g:"General",l:"Fire clear session",d:1},{id:"tabStacks",g:"Tabs",l:"Tab stacks",d:1},{id:"privateInSameWindow",g:"Tabs",l:"Private + normal tabs",d:1}];
const STORE="daymark-proto-v2";
const S={view:"home",engine:"ddg",resultType:"all",query:"",hits:[],page:null,tabs:[{id:1,title:"New tab",private:false}],active:0,history:[],bookmarks:[],reading:[],notes:[],downloads:[],features:Object.fromEntries(FEATURES.map(f=>[f.id,!!f.d])),sheet:null,blocked:0};
try{const r=JSON.parse(localStorage.getItem(STORE)||"{}");Object.assign(S,r.features?{features:{...S.features,...r.features}}:{},r.engine?{engine:r.engine}:{},r.history?{history:r.history}:{},r.bookmarks?{bookmarks:r.bookmarks}:{});}catch(e){}
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&","<":"<",">":">","\"":""","'":"&#39;"}[c]));
function save(){localStorage.setItem(STORE,JSON.stringify({engine:S.engine,features:S.features,history:S.history.slice(0,50),bookmarks:S.bookmarks}));}
function meta(){return ENGINES.find(e=>e.id===S.engine)||ENGINES[0];}
function toast(m){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";$("app").appendChild(t);}t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,1400);}
function isUrl(v){const t=v.trim();return t&&!t.includes(" ")&&(/^(https?:\/\/)/i.test(t)||/^[\w.-]+\.[a-z]{2,}/i.test(t));}
function hostOf(u){try{return new URL(u.startsWith("http")?u:"https://"+u).hostname.replace(/^www\./,"");}catch{return u;}}
function setEngine(id){S.engine=id;save();const m=meta();$("engineDot").textContent=m.mark;$("engineDot").style.background=m.tone;if(S.view==="results"&&S.query)search(S.query);else render();}
async function search(q){S.query=q;S.view="results";S.page=null;S.blocked=S.features.shields?3+(q.length%8):0;S.hits=[];render();
try{const res=await fetch("https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=8&origin=*&search="+encodeURIComponent(q));const d=await res.json();S.hits=(d[1]||[]).map((t,i)=>({title:t,snippet:d[2]?.[i]||"",url:d[3]?.[i]||"about:blank"}));if(!S.hits.length)S.hits=[{title:q,snippet:"No matches",url:"about:blank"}];}
catch{S.hits=[{title:q,snippet:"Demo result (network needed for live search)",url:"about:blank"}];}
if(!S.tabs[S.active].private){S.history=[{title:q,url:S.hits[0].url},...S.history.filter(h=>h.url!==S.hits[0].url)].slice(0,50);save();}
render();}
function openHit(h){S.page=h;S.view="page";S.query=h.url;if(!S.tabs[S.active].private){S.history=[h,...S.history.filter(x=>x.url!==h.url)].slice(0,50);save();}render();}
function go(raw){const q=(raw||$("omniInput").value).trim();if(!q)return;$("omniInput").blur();if(isUrl(q)){const url=/^https?:/i.test(q)?q:"https://"+q;openHit({title:hostOf(url),snippet:"Preview card. Phone WebView opens live pages. Shields/reader/notes work in Daymark Android.",url});}else search(q);}
function showList(k){S.view="list";S.listKind=k;S.sheet=null;render();}
function render(){const m=meta();$("engineDot").textContent=m.mark;$("engineDot").style.background=m.tone;$("tabCount").textContent=String(S.tabs.length);
["viewHome","viewFocus","viewResults","viewPage","viewList"].forEach(id=>{const el=$(id);el.classList.add("hidden");el.style.display="none";});
if(S.view==="home"){$("viewHome").classList.remove("hidden");$("viewHome").style.display="block";$("dials").innerHTML=DIALS.map(d=>`<button type="button" class="dial" data-u="${esc(d.url)}" data-t="${esc(d.title)}"><div class="dial-ico">${esc(d.letter)}</div><span>${esc(d.title)}</span></button>`).join("");$("dials").querySelectorAll(".dial").forEach(b=>b.onclick=()=>openHit({title:b.dataset.t,url:b.dataset.u,snippet:"Speed dial"}));}
else if(S.view==="results"){const el=$("viewResults");el.classList.remove("hidden");el.style.display="flex";$("omniInput").value=S.query;$("shieldPill").textContent=S.features.shields?`Shields on · ${S.blocked} blocked`:"Shields off";
$("typeTabs").querySelectorAll(".type-tab").forEach(t=>t.classList.toggle("on",t.dataset.type===S.resultType));
$("engineBar").innerHTML=ENGINES.map(e=>`<button type="button" class="eng-chip ${e.id===S.engine?"on":""}" data-e="${e.id}">${e.label}</button>`).join("");
$("engineBar").querySelectorAll(".eng-chip").forEach(b=>b.onclick=()=>setEngine(b.dataset.e));
const list=$("resultsList");
if(S.resultType==="maps")list.innerHTML=`<div class="result-card"><div class="r-title">Maps · ${esc(S.query)}</div><div class="r-snip">Map panel placeholder for layout.</div></div>`;
else if(S.resultType==="images")list.innerHTML=`<p class="empty">Images layout preview</p>`+S.hits.slice(0,4).map(h=>`<div class="result-card"><div class="r-title">${esc(h.title)}</div></div>`).join("");
else{list.innerHTML=S.hits.map(h=>`<div class="result-card"><div class="r-host">${esc(hostOf(h.url))} · ${esc(m.label)}</div><div class="r-title">${esc(h.title)}</div><div class="r-snip">${esc(S.features.dataSaver?"":h.snippet)}</div></div>`).join("")||`<p class="empty">Searching…</p>`;list.querySelectorAll(".result-card").forEach((c,i)=>c.onclick=()=>openHit(S.hits[i]));}}
else if(S.view==="page"){$("viewPage").classList.remove("hidden");$("viewPage").style.display="block";const p=S.page;$("omniInput").value=hostOf(p.url);
const saved=S.bookmarks.some(b=>b.url===p.url);
$("viewPage").innerHTML=`<div class="page-article"><div style="font-size:11px;color:#5c6b7c">${esc(hostOf(p.url))}</div><h2>${esc(p.title)}</h2><p>${esc(p.snippet||"")}</p>
<button type="button" id="bm" style="margin-top:12px;padding:8px 12px;border-radius:999px;background:#e8eef5;color:#121820">${saved?"Saved":"Bookmark"}</button></div>`;
$("bm").onclick=()=>{if(saved)S.bookmarks=S.bookmarks.filter(b=>b.url!==p.url);else S.bookmarks=[p,...S.bookmarks];save();toast(saved?"Removed":"Bookmarked");render();};}
else if(S.view==="list"){$("viewList").classList.remove("hidden");$("viewList").style.display="block";renderList();}
renderSheet();}
function renderList(){const k=S.listKind;let body="";
if(k==="settings"){const g={};FEATURES.forEach(f=>{(g[f.g]=g[f.g]||[]).push(f);});
body=Object.entries(g).map(([name,items])=>`<div class="group"><div class="group-label">${esc(name)}</div>${items.map(f=>`<div class="toggle-row" data-f="${f.id}"><span>${esc(f.l)}</span><div class="switch ${S.features[f.id]?"on":""}"></div></div>`).join("")}</div>`).join("");
body=`<div class="group"><div class="group-label">Search engine</div>${ENGINES.map(e=>`<button type="button" class="toggle-row" data-eng="${e.id}" style="width:100%;text-align:left"><span>${e.label}</span><span>${S.engine===e.id?"✓":""}</span></button>`).join("")}</div>`+body;}
else if(k==="history")body=S.history.map(h=>`<div class="row" data-u="${esc(h.url)}" data-t="${esc(h.title)}"><div class="row-title">${esc(h.title)}</div><div class="row-sub">${esc(h.url)}</div></div>`).join("")||`<p class="empty">Nothing here</p>`;
else if(k==="bookmarks")body=S.bookmarks.map(h=>`<div class="row" data-u="${esc(h.url)}" data-t="${esc(h.title)}"><div class="row-title">${esc(h.title)}</div><div class="row-sub">${esc(h.url)}</div></div>`).join("")||`<p class="empty">Empty</p>`;
$("viewList").innerHTML=`<div class="screen-head"><button type="button" class="back-btn" id="listBack">←</button><h2 style="flex:1;font-size:18px">${esc(k)}</h2></div>${body}`;
$("listBack").onclick=()=>{S.view="home";render();};
$("viewList").querySelectorAll("[data-f]").forEach(r=>r.onclick=()=>{S.features[r.dataset.f]=!S.features[r.dataset.f];save();render();});
$("viewList").querySelectorAll("[data-eng]").forEach(b=>b.onclick=()=>setEngine(b.dataset.eng));
$("viewList").querySelectorAll(".row[data-u]").forEach(r=>r.onclick=()=>openHit({title:r.dataset.t,url:r.dataset.u,snippet:""}));}
function renderSheet(){document.querySelectorAll(".overlay").forEach(o=>o.remove());if(!S.sheet)return;
const ov=document.createElement("div");ov.className="overlay";ov.onclick=e=>{if(e.target===ov){S.sheet=null;render();}};
if(S.sheet==="menu"){ov.innerHTML=`<div class="sheet" onclick="event.stopPropagation()"><div class="sheet-handle"></div><h3 style="margin-bottom:4px">Daymark</h3><p style="font-size:12px;color:#5c6b7c;margin-bottom:14px">${esc(meta().label)} · tools only here</p>
<div class="tool-grid">
<button type="button" class="tool" data-t="history"><div class="tool-ico">H</div>History</button>
<button type="button" class="tool" data-t="bookmarks"><div class="tool-ico">B</div>Bookmarks</button>
<button type="button" class="tool" data-t="settings"><div class="tool-ico">S</div>Settings</button>
<button type="button" class="tool" data-t="shields"><div class="tool-ico">Sh</div>Shields</button>
<button type="button" class="tool" data-t="fire"><div class="tool-ico">F</div>Fire</button>
<button type="button" class="tool" data-t="new"><div class="tool-ico">+</div>New tab</button>
<button type="button" class="tool" data-t="priv"><div class="tool-ico">P</div>Private</button>
<button type="button" class="tool" data-t="home"><div class="tool-ico">Ho</div>Home</button>
</div></div>`;}
else if(S.sheet==="tabs"){ov.innerHTML=`<div class="sheet" onclick="event.stopPropagation()"><div class="sheet-handle"></div><h3>${S.tabs.length} tabs</h3>
<button type="button" id="newTab" style="margin:12px 0;padding:12px;width:100%;border-radius:14px;background:#e8eef5;color:#121820">New tab</button>
${S.tabs.map((t,i)=>`<div class="row" style="background:#e8eef5;color:#121820" data-pick="${i}"><div class="row-title">${esc(t.title)}${t.private?" · private":""}</div></div>`).join("")}
</div>`;}
$("app").appendChild(ov);
ov.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{const id=b.dataset.t;if(id==="history"||id==="bookmarks"||id==="settings")showList(id);else if(id==="shields"){S.features.shields=!S.features.shields;save();toast(S.features.shields?"Shields on":"Shields off");S.sheet=null;render();}else if(id==="fire"){S.page=null;S.hits=[];S.query="";S.view="home";S.sheet=null;toast("Tab cleared");render();}else if(id==="new"||id==="priv"){S.tabs.push({id:Date.now(),title:id==="priv"?"Private":"New tab",private:id==="priv"});S.active=S.tabs.length-1;S.view="home";S.sheet=null;render();}else if(id==="home"){S.view="home";S.sheet=null;render();}});
const nt=ov.querySelector("#newTab");if(nt)nt.onclick=()=>{S.tabs.push({id:Date.now(),title:"New tab",private:false});S.active=S.tabs.length-1;S.sheet=null;S.view="home";render();};
ov.querySelectorAll("[data-pick]").forEach(r=>r.onclick=()=>{S.active=+r.dataset.pick;S.sheet=null;S.view="home";render();});}
$("omniForm").onsubmit=e=>{e.preventDefault();go($("omniInput").value);};
$("omniInput").onfocus=()=>{if(S.view==="home"){S.view="focus";render();}};
$("typeTabs").onclick=e=>{const t=e.target.closest(".type-tab");if(!t)return;S.resultType=t.dataset.type;render();};
$("btnHome").onclick=()=>{S.view="home";S.sheet=null;render();};
$("btnBack").onclick=()=>{if(S.view==="page"){S.view=S.hits.length?"results":"home";S.page=null;render();}else if(S.view!=="home"){S.view="home";render();}};
$("btnForward").onclick=()=>{if(S.hits[0]&&S.view!=="page")openHit(S.hits[0]);};
$("btnMenu").onclick=()=>{S.sheet="menu";render();};
$("btnTabs").onclick=()=>{S.sheet="tabs";render();};
$("engineDot").onclick=()=>{const i=ENGINES.findIndex(e=>e.id===S.engine);setEngine(ENGINES[(i+1)%ENGINES.length].id);toast(meta().label);};
render();
