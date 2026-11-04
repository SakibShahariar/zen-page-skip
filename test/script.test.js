const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");

function load(windowOverrides = {}) {
  const listeners = {};
  const context = {
    console, URL,
    Services: {
      prefs: { getStringPref: (_name, fallback) => fallback },
      scriptSecurityManager: { getSystemPrincipal: () => ({}) },
      io: { newURI: (value) => value }
    },
    window: {
      addEventListener: (name, callback) => { listeners[name] = callback; },
      setTimeout: () => {},
      ...windowOverrides
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, listeners };
}

function el({tagName="A", text="Next", attrs={}, pagination=false, form=false}={}) {
  return {
    tagName, textContent:text, className:"", id:"",
    getAttribute:(name)=>attrs[name] ?? null,
    hasAttribute:(name)=>Object.hasOwn(attrs,name),
    classList:{contains:()=>false},
    closest:(selector)=>{
      if(selector==="form"&&form) return {};
      if(selector.includes("carousel")||selector.includes("slider")||selector.includes("recommend")||selector.includes("post-navigation")||selector.includes("article-navigation")) return null;
      return (selector.includes("pagination")||selector.includes("pager"))&&pagination?{}:null;
    },
    click(){}, scrollIntoView(){}
  };
}

test("uses rel next/prev links from the document head",()=>{
  const {context}=load();
  const link={getAttribute:(name)=>({rel:"next",href:"/page/2"})[name]??null,hasAttribute:()=>false,classList:{contains:()=>false}};
  const doc={baseURI:"https://example.test/page/1",querySelectorAll:()=>[link]};
  assert.equal(vm.runInContext("findRelPaginationUrl(1, document, 'https://example.test/page/1')",Object.assign(context,{document:doc})),"https://example.test/page/2");
});

test("ignores generic unrelated links and chooses pagination-scoped controls",()=>{
  const unrelated=el({attrs:{href:"/account/next"}});
  const pager=el({attrs:{href:"/page/2"},pagination:true});
  const doc={querySelectorAll:()=>[unrelated,pager]};
  const {context}=load({gBrowser:{selectedTab:{linkedBrowser:{contentDocument:doc}}}});
  assert.equal(vm.runInContext("findPaginationControl(1)",context),pager);
});

test("rejects form, submit, and menu controls",()=>{
  const {context}=load();
  const submit=el({tagName:"BUTTON",attrs:{type:"submit"},pagination:true,form:true});
  const menu=el({tagName:"BUTTON",attrs:{"aria-haspopup":"menu"},pagination:true});
  assert.equal(vm.runInContext("isSafeNavigationControl(submit)||isSafeNavigationControl(menu)",Object.assign(context,{submit,menu})),false);
});

test("keeps Ctrl and Meta distinct and supports aliases",()=>{
  const {context}=load();
  const result=vm.runInContext("({ctrl:matches({key:'ArrowRight',altKey:true,ctrlKey:true,metaKey:false,shiftKey:false},'Ctrl+Alt+Right'),meta:matches({key:'ArrowRight',altKey:true,ctrlKey:false,metaKey:true,shiftKey:false},'Cmd+Alt+Right'),wrong:matches({key:'ArrowRight',altKey:true,ctrlKey:true,metaKey:false,shiftKey:false},'Cmd+Alt+Right'),option:matches({key:'n',altKey:true,ctrlKey:false,metaKey:false,shiftKey:false},'Option+N'),super:matches({key:'n',altKey:false,ctrlKey:false,metaKey:true,shiftKey:false},'Super+N')})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{ctrl:true,meta:true,wrong:false,option:true,super:true});
});

test("handles inaccessible contentDocument and nested editable fields",()=>{
  const browser={};
  Object.defineProperty(browser,"contentDocument",{get(){throw Error("denied")}});
  const {context}=load({gBrowser:{selectedTab:{linkedBrowser:browser}}});
  assert.equal(vm.runInContext("getPageDocument()",context),null);
  const target={tagName:"SPAN",closest:()=>({})};
  assert.equal(vm.runInContext("isEditable(target)",Object.assign(context,{target})),true);
});

test("covers numbered URL patterns and refuses page zero",()=>{
  const {context}=load();
  const values=vm.runInContext("PAGE_PATTERNS.map((p,i)=>p.build(['https://x.test/?page=3','https://x.test/?p=3','https://x.test/page/3/','https://x.test/#page=3'][i],4))",context);
  assert.deepEqual(JSON.parse(JSON.stringify(values)),["https://x.test/?page=4","https://x.test/?p=4","https://x.test/page/4/","https://x.test/#page=4"]);
  assert.equal(vm.runInContext("getNumberedPageUrl('https://x.test/?page=1',-1)",context),null);
});

test("ignores repeated and IME composition events",()=>{
  const {listeners}=load();
  let prevented=0;
  const event={target:{},preventDefault(){prevented++},stopPropagation(){}};
  listeners.keydown({...event,isComposing:true,repeat:false});
  listeners.keydown({...event,isComposing:false,repeat:true});
  assert.equal(prevented,0);
});

test("normalizes repeated whitespace and rejects substring-only labels",()=>{
  const {context}=load();
  const result=vm.runInContext("({label:normalizedText({getAttribute:()=>null,textContent:'  Next   page  '}),partial:matchesWords('next generation',NEXT_TEXT)})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{label:"next page",partial:false});
});

test("matches exact and wildcard disabled-site rules safely",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=()=> "example.com\n*.blocked.test, invalid/path";
  const result=vm.runInContext("({exact:isSiteDisabled('https://example.com/page/1'),subdomain:isSiteDisabled('https://shop.blocked.test'),apex:isSiteDisabled('https://blocked.test'),other:isSiteDisabled('https://other.test')})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{exact:true,subdomain:true,apex:false,other:false});
});

test("canonicalizes trailing-dot hostnames",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=()=> "example.com, *.blocked.test";
  const result=vm.runInContext("({newline:isSiteDisabled('https://example.com'),wildcard:isSiteDisabled('https://a.blocked.test'),trailingDot:isSiteDisabled('https://example.com./')})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{newline:true,wildcard:true,trailingDot:true});
});

test("applies a configurable cooldown that expires without a stuck lock",()=>{
  const {context}=load();
  context.fakeNow=1000;
  vm.runInContext("Date.now = () => fakeNow",context);
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("cooldown-ms")?"500":fallback;
  const first=vm.runInContext("isCooldownActive()",context);
  context.fakeNow=1200;
  const rapid=vm.runInContext("isCooldownActive()",context);
  context.fakeNow=1500;
  const afterExpiry=vm.runInContext("isCooldownActive()",context);
  assert.deepEqual([first,rapid,afterExpiry],[false,true,false]);
});

test("clamps invalid cooldown preferences to safe bounds",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=()=> "9000";
  assert.equal(vm.runInContext("getCooldownMs()",context),5000);
  context.Services.prefs.getStringPref=()=> "-10";
  assert.equal(vm.runInContext("getCooldownMs()",context),0);
  context.Services.prefs.getStringPref=()=> "not-a-number";
  assert.equal(vm.runInContext("getCooldownMs()",context),400);
});

test("honors toast enable and duration preferences",()=>{
  let appended=0, timeoutMs=0;
  const box={
    PRIORITY_INFO_MEDIUM:1,
    getNotificationWithValue:()=>null,
    appendNotification:(_id,options)=>{appended++;assert.equal(options.label,"hello");return {close(){}}}
  };
  const {context}=load({gBrowser:{getNotificationBox:()=>box}});
  context.Services.prefs.getBoolPref=()=>true;
  context.Services.prefs.getIntPref=()=>3200;
  context.window.setTimeout=(_callback,ms)=>{timeoutMs=ms};
  vm.runInContext("showToast('hello')",context);
  assert.equal(appended,1);
  assert.equal(timeoutMs,3200);
  context.Services.prefs.getBoolPref=()=>false;
  vm.runInContext("showToast('hidden')",context);
  assert.equal(appended,1);
});

test("clamps toast duration and falls back when the preference is unavailable",()=>{
  const {context}=load();
  context.Services.prefs.getIntPref=()=>20000;
  assert.equal(vm.runInContext("getToastDuration()",context),10000);
  context.Services.prefs.getIntPref=()=>100;
  assert.equal(vm.runInContext("getToastDuration()",context),500);
  context.Services.prefs.getIntPref=()=>{throw Error("missing")};
  assert.equal(vm.runInContext("getToastDuration()",context),1800);
});

test("clamps the configurable pagination confidence threshold",()=>{
  const {context}=load();
  context.Services.prefs.getIntPref=()=>40;
  assert.equal(vm.runInContext("getConfidenceThreshold()",context),50);
  context.Services.prefs.getIntPref=()=>200;
  assert.equal(vm.runInContext("getConfidenceThreshold()",context),150);
  context.Services.prefs.getIntPref=()=>100;
  assert.equal(vm.runInContext("getConfidenceThreshold()",context),100);
});

test("excludes destructive controls, dialogs, and configured selectors",()=>{
  const {context}=load();
  const remove=el({tagName:"BUTTON",text:"Delete",pagination:true});
  const dialog=el({tagName:"BUTTON",text:"Next page",pagination:true});
  dialog.closest=(selector)=>selector.includes("dialog")?{}:null;
  const custom={matches:(selector)=>selector===".danger",closest:()=>null};
  context.Services.prefs.getStringPref=()=>".danger";
  const result=vm.runInContext("({remove:isSafeNavigationControl(remove),dialog:isSafeNavigationControl(dialog),custom:isExcludedByUserSelector(custom,document)})",Object.assign(context,{remove,dialog,custom,document:{}}));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{remove:false,dialog:false,custom:true});
});

test("keeps pagination anchors inside forms but rejects form buttons",()=>{
  const {context}=load();
  const anchor=el({tagName:"A",attrs:{href:"/page/2"},pagination:true,form:true});
  const button=el({tagName:"BUTTON",pagination:true,form:true});
  const result=vm.runInContext("({anchor:isSafeNavigationControl(anchor),button:isSafeNavigationControl(button)})",Object.assign(context,{anchor,button}));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{anchor:true,button:false});
});

test("caches shortcut preferences and invalidates them on preference changes",()=>{
  const {context}=load();
  let reads=0, observer=null;
  context.Services.prefs.getStringPref=(_name,fallback)=>{reads++;return fallback};
  context.Services.prefs.addObserver=(_name,value)=>{observer=value};
  context.Services.prefs.removeObserver=()=>{};
  vm.runInContext("observeShortcutPreferences()",context);
  vm.runInContext("getShortcuts()",context);
  vm.runInContext("getShortcuts()",context);
  assert.equal(reads,3);
  observer.observe(null,"nsPref:changed","zen-page-skip.next-shortcut");
  vm.runInContext("getShortcuts()",context);
  assert.equal(reads,6);
});

test("keeps diagnostics disabled by default and exposes opt-in local logs",()=>{
  const {context}=load();
  let logs=0;
  context.console.debug=()=>{logs++};
  context.Services.prefs.getBoolPref=()=>false;
  vm.runInContext("debugLog('quiet')",context);
  assert.equal(logs,0);
  context.Services.prefs.getBoolPref=()=>true;
  vm.runInContext("debugLog('candidate-scored',{score:80})",context);
  assert.equal(logs,1);
  assert.match(vm.runInContext("getDiagnostics()",context),/candidate-scored/);
});

test("bounds diagnostic history to the most recent 100 entries",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=()=>true;
  vm.runInContext("for(let i=0;i<105;i++) debugLog('entry',{score:i})",context);
  const result=vm.runInContext("getDiagnostics()",context);
  assert.equal(result.split("\n").length,100);
  assert.equal(result.includes('"score":0'),false);
  assert.equal(result.includes('"score":104'),true);
});

test("recognizes multilingual labels and user-defined pagination words",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("next-words")?"続きを読む, Weiter lesen":fallback;
  const result=vm.runInContext("({chinese:matchesWords('下一页',getPaginationWords(1)),japanese:matchesWords('前へ',getPaginationWords(-1)),custom:matchesWords('続きを読む',getPaginationWords(1)),english:matchesWords('next page',getPaginationWords(1)),generic:matchesWords('continue',getPaginationWords(1))})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{chinese:true,japanese:true,custom:true,english:true,generic:false});
});

test("detects navigation API availability and uses the supported fallback",()=>{
  const {context}=load();
  let loaded=null, fixed=null;
  const principal={};
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>principal;
  context.Services.io.newURI=(value)=>({spec:value});
  const primary={linkedBrowser:{loadURI:(uri,options)=>{loaded={uri,options}}}};
  assert.equal(vm.runInContext("getNavigationCompatibility(tab).compatible",Object.assign(context,{tab:primary})),true);
  assert.equal(vm.runInContext("navigate(tab,'https://example.test/page/2')",Object.assign(context,{tab:primary})),true);
  assert.equal(loaded.uri.spec,"https://example.test/page/2");
  assert.equal(loaded.options.triggeringPrincipal,principal);

  const fallback={linkedBrowser:{loadURI(){throw Error("unavailable")},fixupAndLoadURIString:(url)=>{fixed=url}}};
  assert.equal(vm.runInContext("navigate(tab,'https://example.test/page/3')",Object.assign(context,{tab:fallback})),true);
  assert.equal(fixed,"https://example.test/page/3");
});

test("fails safely when browser navigation APIs are unavailable",()=>{
  const {context}=load();
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  const tab={linkedBrowser:{}};
  const result=vm.runInContext("({compat:getNavigationCompatibility(tab),navigated:navigate(tab,'https://example.test/page/2')})",Object.assign(context,{tab}));
  assert.equal(result.compat.compatible,false);
  assert.equal(result.navigated,false);
});

test("reports invalid, duplicate, and common browser-reserved shortcuts",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>{
    if(name.endsWith("next-shortcut")) return "Ctrl+T";
    if(name.endsWith("previous-shortcut")) return "Ctrl+T";
    return fallback;
  };
  const warnings=vm.runInContext("getShortcutWarnings()",context);
  assert.equal(warnings.some(x=>x.includes("identical")),true);
  assert.equal(warnings.some(x=>x.includes("common browser shortcut")),true);
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("next-shortcut")?"Ctrl+Banana+N":fallback;
  assert.equal(vm.runInContext("getShortcutWarnings()",context).some(x=>x.includes("Invalid next-page shortcut")),true);
});

test("default shortcuts have no known browser conflicts",()=>{
  const {context}=load();
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("getShortcutWarnings()",context))),[]);
});

test("keeps target preview off by default and confirms when enabled",()=>{
  const {context}=load();
  let calls=0, message="";
  context.Services.prompt={confirm:(_window,_title,text)=>{calls++;message=text;return false}};
  context.Services.prefs.getBoolPref=()=>false;
  assert.equal(vm.runInContext("confirmNavigation('example.test/page/2')",context),true);
  assert.equal(calls,0);
  context.Services.prefs.getBoolPref=()=>true;
  assert.equal(vm.runInContext("confirmNavigation('example.test/page/2')",context),false);
  assert.equal(calls,1);
  assert.equal(message.includes("example.test/page/2"),true);
  context.Services.prompt.confirm=()=>true;
  assert.equal(vm.runInContext("confirmNavigation('next page')",context),true);
});

test("cancels preview safely when the prompt API is unavailable",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=()=>true;
  context.Services.prompt=undefined;
  assert.equal(vm.runInContext("confirmNavigation('next page')",context),false);
});

test("preview descriptions omit query strings and fragments",()=>{
  const {context}=load();
  assert.equal(vm.runInContext("describeNavigationTarget('https://example.test/page/2?token=secret#part')",context),"page: https://example.test/page/2");
});

test("keeps malformed relative-control previews from throwing",()=>{
  const {context}=load();
  assert.equal(vm.runInContext("describeControlTarget('http://[','https://example.test/page/1','Next')",context),"Next");
  assert.equal(vm.runInContext("describeControlTarget('/page/2','https://example.test/page/1','Next')",context),"Next: https://example.test/page/2");
});

test("builds direct URLs for every supported page-number pattern",()=>{
  const {context}=load();
  const values=vm.runInContext("['https://x.test/?page=2','https://x.test/?p=2','https://x.test/page/2/','https://x.test/#page=2'].map(url=>getSpecificPageUrl(url,7))",context);
  assert.deepEqual(JSON.parse(JSON.stringify(values)),["https://x.test/?page=7","https://x.test/?p=7","https://x.test/page/7/","https://x.test/#page=7"]);
  assert.equal(vm.runInContext("getSpecificPageUrl('https://x.test/no-pages',7)",context),null);
  assert.equal(vm.runInContext("getSpecificPageUrl('https://x.test/?page=2',0)",context),null);
});

test("prompts for a page number and navigates only after valid input",()=>{
  const {context}=load();
  let loaded=null;
  const browser={currentURI:{spec:"https://example.test/?page=2"},loadURI:(uri)=>{loaded=uri}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.Services.prompt={prompt:(_window,_title,_message,input)=>{input.value="4";return true}};
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  context.Services.io.newURI=(value)=>value;
  context.Services.prefs.getBoolPref=()=>false;
  vm.runInContext("jumpToPage()",context);
  assert.equal(loaded,"https://example.test/?page=4");
});

test("rejects invalid page numbers and respects prompt cancellation",()=>{
  const {context}=load();
  let loaded=null;
  const browser={currentURI:{spec:"https://example.test/?page=2"},loadURI:(uri)=>{loaded=uri}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  context.Services.io.newURI=(value)=>value;
  context.Services.prefs.getBoolPref=()=>false;
  context.Services.prompt={prompt:(_window,_title,_message,input)=>{input.value="0";return true}};
  vm.runInContext("jumpToPage()",context);
  assert.equal(loaded,null);
  context.Services.prompt.prompt=()=>false;
  vm.runInContext("jumpToPage()",context);
  assert.equal(loaded,null);
});

test("loads exact and wildcard site rules with bounded thresholds",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({
    "example.test":{nextWords:["More items"],confidenceThreshold:90},
    "*.sub.test":{previousWords:["Older results"],confidenceThreshold:200}
  }):fallback;
  const exact=vm.runInContext("getSiteRule('https://example.test/page/1')",context);
  const wildcard=vm.runInContext("getSiteRule('https://shop.sub.test/page/1')",context);
  assert.deepEqual(JSON.parse(JSON.stringify(exact.nextWords)),["more items"]);
  assert.equal(exact.confidenceThreshold,90);
  assert.deepEqual(JSON.parse(JSON.stringify(wildcard.previousWords)),["older results"]);
  assert.equal(wildcard.confidenceThreshold,150);
});

test("prioritizes safe per-site selectors before generic scoring",()=>{
  const button=el({tagName:"BUTTON",text:"Load more",attrs:{type:"button"}});
  const doc={querySelector:()=>button,querySelectorAll:()=>[]};
  const {context}=load({gBrowser:{selectedTab:{linkedBrowser:{currentURI:{spec:"https://example.test/page/1"},contentDocument:doc}}}});
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({"example.test":{nextSelector:".load-more"}}):fallback;
  assert.equal(vm.runInContext("findPaginationControl(1)",context),button);
});

test("ignores invalid site-rule JSON",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?"{bad json":fallback;
  assert.equal(vm.runInContext("getSiteRule('https://example.test')",context),null);
});

test("detects infinite-scroll indicators and honors site overrides",()=>{
  const {context}=load();
  const feed={querySelector:(selector)=>selector.includes('[role="feed"]')?{}:null};
  const paginated={querySelector:(selector)=>selector.includes('nav[class*="pagination"]')?{}:null};
  const result=vm.runInContext("({detected:isInfiniteScrollPage(feed),skip:shouldSkipInfiniteScroll(feed,null),allowed:shouldSkipInfiniteScroll(feed,{infiniteScroll:'allow'}),blocked:shouldSkipInfiniteScroll(feed,{infiniteScroll:'block'}),custom:shouldSkipInfiniteScroll(feed,{nextSelector:'a.next'}),explicit:shouldSkipInfiniteScroll(paginated,null)})",Object.assign(context,{feed,paginated}));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{detected:true,skip:true,allowed:false,blocked:true,custom:false,explicit:false});
});

test("exports a versioned settings snapshot",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=(_name,fallback)=>fallback;
  context.Services.prefs.getIntPref=(_name,fallback)=>fallback;
  context.Services.prefs.getStringPref=(_name,fallback)=>fallback;
  const snapshot=JSON.parse(vm.runInContext("exportSettings()",context));
  assert.equal(snapshot.schemaVersion,1);
  assert.equal(snapshot.settings["next-shortcut"],"Alt+]");
  assert.equal(snapshot.settings["toast-enabled"],true);
});

test("imports valid settings selectively and clamps numeric values",()=>{
  const {context}=load();
  const written={};
  context.Services.prefs.prefHasUserValue=()=>false;
  context.Services.prefs.clearUserPref=(name)=>{delete written[name]};
  context.Services.prefs.getBoolPref=(_name,fallback)=>fallback;
  context.Services.prefs.getIntPref=(_name,fallback)=>fallback;
  context.Services.prefs.setStringPref=(name,value)=>{written[name]=value};
  context.Services.prefs.setBoolPref=(name,value)=>{written[name]=value};
  context.Services.prefs.setIntPref=(name,value)=>{written[name]=value};
  const payload=JSON.stringify({schemaVersion:1,settings:{
    "next-shortcut":"Ctrl+Alt+Right",
    "toast-enabled":false,
    "toast-duration-ms":20000,
    "unknown-setting":"ignored"
  }});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,true);
  assert.equal(written["zen-page-skip.next-shortcut"],"Ctrl+Alt+Right");
  assert.equal(written["zen-page-skip.toast-enabled"],false);
  assert.equal(written["zen-page-skip.toast-duration-ms"],10000);
  assert.deepEqual(JSON.parse(JSON.stringify(result.ignored)),["unknown-setting"]);
});

test("rejects malformed imports and invalid shortcut values",()=>{
  const {context}=load();
  assert.equal(vm.runInContext("importSettings('{bad json').success",context),false);
  const payload=JSON.stringify({schemaVersion:1,settings:{"next-shortcut":"Ctrl+Unknown+X"}});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rejected)),["next-shortcut"]);
});

test("supports per-site URL templates for next, previous, and direct page jumps",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({
    "example.test":{pageTemplate:"/archive/page/{page}"}
  }):fallback;
  assert.equal(vm.runInContext("getCustomNumberedPageUrl('https://example.test/archive/page/3',1)",context),"https://example.test/archive/page/4");
  assert.equal(vm.runInContext("getCustomNumberedPageUrl('https://example.test/archive/page/3',-1)",context),"https://example.test/archive/page/2");
  assert.equal(vm.runInContext("getSpecificPageUrl('https://example.test/archive/page/3',8)",context),"https://example.test/archive/page/8");
});

test("rejects unsafe or malformed custom URL templates",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({
    "example.test":{pageTemplate:"https://evil.test/page/{page}"}
  }):fallback;
  assert.equal(vm.runInContext("getCustomPageUrl('https://example.test/page/2',3)",context),null);
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({
    "example.test":{pageTemplate:"/page/{page}/{page}"}
  }):fallback;
  assert.equal(vm.runInContext("getCustomPageUrl('https://example.test/page/2/3',4)",context),null);
});

test("supports per-site enable/disable and action overrides",()=>{
  const {context}=load();
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({
    "example.test":{enabled:false,action:"click"},
    "*.sub.test":{enabled:true,action:"url"}
  }):fallback;
  const disabled=vm.runInContext("getSiteRule('https://example.test/page/1')",context);
  const wildcard=vm.runInContext("getSiteRule('https://shop.sub.test/page/1')",context);
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.action,"click");
  assert.equal(wildcard.enabled,true);
  assert.equal(wildcard.action,"url");
});

test("site action url skips controls while click mode refuses URL fallback",()=>{
  const {context}=load();
  let loaded=null, clicked=0;
  const browser={currentURI:{spec:"https://example.test/?page=2"},contentDocument:{querySelectorAll:()=>[]},loadURI:(uri)=>{loaded=uri}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.Services.getBoolPref=()=>false;
  context.Services.prefs.getBoolPref=()=>false;
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  context.Services.io.newURI=(value)=>value;
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({"example.test":{enabled:true,action:"url"}}):fallback;
  vm.runInContext("findPaginationControl = () => ({click(){clicked++}})",Object.assign(context,{clicked:0}));
  vm.runInContext("jump(1)",context);
  assert.equal(loaded,"https://example.test/?page=3");

  loaded=null;
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({"example.test":{enabled:true,action:"click"}}):fallback;
  vm.runInContext("findPaginationControl = () => null",context);
  vm.runInContext("jump(1)",context);
  assert.equal(loaded,null);
});

test("uses the live document and URL after SPA route changes and history traversal",()=>{
  const first=el({text:"Next",attrs:{href:"/page/2"},pagination:true});
  const second=el({text:"Previous",attrs:{href:"/page/1"},pagination:true});
  const browser={currentURI:{spec:"https://example.test/page/1"},contentDocument:{querySelectorAll:()=>[first]}};
  const {context}=load({gBrowser:{selectedTab:{linkedBrowser:browser}}});
  assert.equal(vm.runInContext("getCurrentUrl()",context),"https://example.test/page/1");
  assert.equal(vm.runInContext("findPaginationControl(1)",context),first);

  // Simulate pushState updating the current URI and the SPA replacing its controls.
  browser.currentURI.spec="https://example.test/page/2";
  browser.contentDocument={querySelectorAll:()=>[second]};
  assert.equal(vm.runInContext("getCurrentUrl()",context),"https://example.test/page/2");
  assert.equal(vm.runInContext("findPaginationControl(-1)",context),second);

  // Simulate browser back restoring the prior route and its live DOM.
  browser.currentURI.spec="https://example.test/page/1";
  browser.contentDocument={querySelectorAll:()=>[first]};
  assert.equal(vm.runInContext("findPaginationControl(1)",context),first);
});

test("validates numbered URL fallbacks against observed same-origin pages",()=>{
  const {context}=load();
  const doc=(hrefs)=>({querySelectorAll:()=>hrefs.map(href=>({href,getAttribute:()=>href}))});
  const valid=vm.runInContext("validateNumberedFallback(current,target,document)",Object.assign(context,{
    current:"https://example.test/?page=2",
    target:"https://example.test/?page=3",
    document:doc(["https://example.test/?page=1","https://example.test/?page=3"])
  }));
  assert.equal(valid.valid,true);
  assert.deepEqual(JSON.parse(JSON.stringify(valid.observedPages)),[1,3]);

  const invalid=vm.runInContext("validateNumberedFallback(current,target,document)",Object.assign(context,{
    current:"https://example.test/?page=3",
    target:"https://example.test/?page=4",
    document:doc(["https://example.test/?page=1","https://example.test/?page=2","https://other.test/?page=4"])
  }));
  assert.equal(invalid.valid,false);
  assert.equal(invalid.reason,"target-not-observed");
});

test("preserves URL fallback when page links are unavailable",()=>{
  const {context}=load();
  const result=vm.runInContext("validateNumberedFallback('https://example.test/?page=2','https://example.test/?page=3',{querySelectorAll:()=>[]})",context);
  assert.equal(result.valid,true);
  assert.equal(result.reason,"no-observed-page-links");
});

test("detects hash-only routes and verifies actual content changes",()=>{
  const {context}=load();
  assert.equal(vm.runInContext("isHashOnlyNavigation('https://x.test/page#page=1','https://x.test/page#page=2')",context),true);
  assert.equal(vm.runInContext("isHashOnlyNavigation('https://x.test/page/1','https://x.test/page/2')",context),false);
  const messages=[];
  let callback=null;
  const browser={contentWindow:{location:{hash:"#page=1"}},contentDocument:{body:{innerText:"old page"}}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.window.setTimeout=(fn)=>{callback=fn};
  vm.runInContext("showToast = (message) => toastMessages.push(message)",Object.assign(context,{toastMessages:messages}));
  assert.equal(vm.runInContext("navigateHashTarget(tab,'https://x.test/page#page=2','verify')",Object.assign(context,{tab:{linkedBrowser:browser}})),true);
  assert.equal(browser.contentWindow.location.hash,"#page=2");
  browser.contentDocument.body.innerText="new page";
  callback();
  assert.equal(messages.includes("Page content updated"),true);
});

test("reports unchanged hash fragments instead of claiming successful pagination",()=>{
  const {context}=load();
  const messages=[];
  let callback=null;
  const browser={contentWindow:{location:{hash:"#page=1"}},contentDocument:{body:{innerText:"same page"}}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.window.setTimeout=(fn)=>{callback=fn};
  vm.runInContext("showToast = (message) => toastMessages.push(message)",Object.assign(context,{toastMessages:messages}));
  vm.runInContext("navigateHashTarget(tab,'https://x.test/page#page=2','verify')",Object.assign(context,{tab:{linkedBrowser:browser}}));
  callback();
  assert.equal(messages.includes("Fragment changed, but page content did not update"),true);
});

test("allows explicit hash mode overrides and blocks disabled site rules before rel navigation",()=>{
  const {context}=load();
  const messages=[];
  const browser={currentURI:{spec:"https://x.test/page#page=1"},contentWindow:{location:{hash:"#page=1"}},contentDocument:{body:{innerText:"same"}}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({"x.test":{enabled:false,hashMode:"disable"}}):fallback;
  context.Services.prefs.getBoolPref=()=>false;
  vm.runInContext("showToast = (message) => toastMessages.push(message)",Object.assign(context,{toastMessages:messages}));
  vm.runInContext("findRelPaginationUrl = () => 'https://x.test/page#page=2'",context);
  vm.runInContext("jump(1)",context);
  assert.equal(browser.contentWindow.location.hash,"#page=1");
  assert.equal(messages.includes("Disabled by this site's rule"),true);
});

test("passes enabled and duration preferences to Zen native toasts",async()=>{
  const label={textContent:"",removeAttribute(){}};
  const toast={_messageId:"zen-page-skip-toast",querySelector:()=>label};
  const container={children:[toast]};
  let nativeCall=null;
  const {context}=load();
  context.document={getElementById:()=>container};
  context.window.gZenUIManager={showToast:(id,options)=>{nativeCall={id,options};return Promise.resolve()}};
  context.Services.prefs.getBoolPref=()=>true;
  context.Services.prefs.getIntPref=()=>2700;
  vm.runInContext("showToast('native message')",context);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(nativeCall)),{id:"zen-page-skip-toast",options:{timeout:2700}});
  assert.equal(label.textContent,"native message");
});

test("falls back to the notification bar when the native toast API fails",()=>{
  let appended=0, timeoutMs=0;
  const box={PRIORITY_INFO_MEDIUM:1,getNotificationWithValue:()=>null,appendNotification:()=>{appended++;return {close(){}}}};
  const {context}=load({gBrowser:{getNotificationBox:()=>box}});
  context.window.gZenUIManager={showToast:()=>{throw Error("unsupported")}};
  context.Services.prefs.getBoolPref=()=>true;
  context.Services.prefs.getIntPref=()=>2400;
  context.window.setTimeout=(_callback,ms)=>{timeoutMs=ms};
  vm.runInContext("showToast('fallback message')",context);
  assert.equal(appended,1);
  assert.equal(timeoutMs,2400);
});

test("validates and clamps imported cooldown strings",()=>{
  const {context}=load();
  const written={};
  context.Services.prefs.setStringPref=(name,value)=>{written[name]=value};
  const valid=JSON.stringify({schemaVersion:1,settings:{"cooldown-ms":"9000"}});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload:valid}));
  assert.equal(result.success,true);
  assert.equal(written["zen-page-skip.cooldown-ms"],"5000");
  const invalid=JSON.stringify({schemaVersion:1,settings:{"cooldown-ms":"not-a-number"}});
  const rejected=vm.runInContext("importSettings(payload)",Object.assign(context,{payload:invalid}));
  assert.equal(rejected.success,false);
  assert.deepEqual(JSON.parse(JSON.stringify(rejected.rejected)),["cooldown-ms"]);
});


test("increments, decrements, and reads hash-based page numbers",()=>{
  const {context}=load();
  assert.equal(vm.runInContext("getPageNumberFromUrl('https://x.test/archive#page=4')",context),4);
  assert.equal(vm.runInContext("getNumberedPageUrl('https://x.test/archive#page=4',1)",context),"https://x.test/archive#page=5");
  assert.equal(vm.runInContext("getNumberedPageUrl('https://x.test/archive#page=4',-1)",context),"https://x.test/archive#page=3");
  assert.equal(vm.runInContext("getNumberedPageUrl('https://x.test/archive#page=1',-1)",context),null);
});

test("validates hash-based numbered fallbacks against observed same-origin pages",()=>{
  const {context}=load();
  const document={querySelectorAll:()=>[
    {href:"https://example.test/archive#page=1",getAttribute:()=>"#page=1"},
    {href:"https://example.test/archive#page=3",getAttribute:() => "#page=3"}
  ]};
  const result=vm.runInContext(
    "validateNumberedFallback('https://example.test/archive#page=2','https://example.test/archive#page=3',document)",
    Object.assign(context,{document})
  );
  assert.equal(result.valid,true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.observedPages)),[1,3]);
});


test("normalizes safe HTTP URLs and rejects unsafe schemes or credentials",()=>{
  const {context}=load();
  const result=vm.runInContext("({canonical:normalizeNavigationUrl('HTTPS://EXAMPLE.TEST:443/page/2'),relative:normalizeNavigationUrl('../page%202?sort=recent#section','https://example.test/archive/page/1'),javascript:normalizeNavigationUrl('javascript:alert(1)'),data:normalizeNavigationUrl('data:text/html,unsafe'),credentials:normalizeNavigationUrl('https://user:pass@example.test/page/2')})",context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    canonical:"https://example.test/page/2",
    relative:"https://example.test/archive/page%202?sort=recent#section",
    javascript:null,
    data:null,
    credentials:null
  });
});

test("rejects canonical self-navigation before invoking browser APIs",()=>{
  const {context}=load();
  let loads=0;
  const tab={linkedBrowser:{
    currentURI:{spec:"https://EXAMPLE.test:443/page/2"},
    loadURI(){loads++}
  }};
  const result=vm.runInContext("navigate(tab,'https://example.test/page/2')",Object.assign(context,{tab}));
  assert.equal(result,false);
  assert.equal(loads,0);
});

test("rejects unsafe navigation targets before invoking browser APIs",()=>{
  const {context}=load();
  let loads=0;
  const tab={linkedBrowser:{
    currentURI:{spec:"https://example.test/page/1"},
    loadURI(){loads++}
  }};
  const result=vm.runInContext("navigate(tab,'javascript:alert(1)')",Object.assign(context,{tab}));
  assert.equal(result,false);
  assert.equal(loads,0);
});

test("validates every known imported setting before writing any preference",()=>{
  const {context}=load();
  let writes=0;
  context.Services.prefs.setStringPref=()=>{writes++};
  context.Services.prefs.setBoolPref=()=>{writes++};
  context.Services.prefs.setIntPref=()=>{writes++};
  const payload=JSON.stringify({schemaVersion:1,settings:{
    "next-shortcut":"Ctrl+Alt+Right",
    "toast-enabled":false,
    "cooldown-ms":"invalid"
  }});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.imported)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rejected)),["cooldown-ms"]);
  assert.equal(writes,0);
});

test("contains unexpected pagination and direct-jump failures",()=>{
  const {context}=load();
  const messages=[];
  vm.runInContext("showToast=(message)=>toastMessages.push(message)",Object.assign(context,{toastMessages:messages}));
  vm.runInContext("jumpInternal=()=>{throw Error('pagination failure')}",context);
  vm.runInContext("jump(1)",context);
  vm.runInContext("jumpToPageInternal=()=>{throw Error('jump failure')}",context);
  vm.runInContext("jumpToPage()",context);
  assert.equal(messages.includes("Pagination failed safely; see local diagnostics"),true);
  assert.equal(messages.includes("Jump failed safely; see local diagnostics"),true);
});


test("rejects malformed site-rule JSON in an imported settings snapshot",()=>{
  const {context}=load();
  let writes=0;
  context.Services.prefs.setStringPref=()=>{writes++};
  const payload=JSON.stringify({schemaVersion:1,settings:{
    "next-shortcut":"Ctrl+Alt+Right",
    "site-rules":"{invalid"
  }});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.imported)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rejected)),["site-rules"]);
  assert.equal(writes,0);
});


test("rolls back earlier preference writes when a later import write fails",()=>{
  const {context}=load();
  const stored={
    "zen-page-skip.next-shortcut":"Alt+]",
    "zen-page-skip.toast-enabled":true
  };
  context.Services.prefs.prefHasUserValue=()=>true;
  context.Services.prefs.getStringPref=(name,fallback)=>stored[name] ?? fallback;
  context.Services.prefs.getBoolPref=(name,fallback)=>stored[name] ?? fallback;
  context.Services.prefs.setStringPref=(name,value)=>{stored[name]=value};
  context.Services.prefs.setBoolPref=(name,value)=>{
    if(name.endsWith("toast-enabled")&&value===false) throw Error("preference is locked");
    stored[name]=value;
  };
  const payload=JSON.stringify({schemaVersion:1,settings:{
    "next-shortcut":"Ctrl+Alt+Right",
    "toast-enabled":false
  }});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.imported)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rejected)),["toast-enabled"]);
  assert.equal(stored["zen-page-skip.next-shortcut"],"Alt+]");
  assert.equal(stored["zen-page-skip.toast-enabled"],true);
});


test("validates imported site-rule selectors and same-origin page templates",()=>{
  const {context}=load();
  let writes=0;
  context.document={createElement:()=>({matches:(selector)=>{if(selector==="[")throw Error("invalid selector");return false}})};
  context.Services.prefs.prefHasUserValue=()=>false;
  context.Services.prefs.clearUserPref=()=>{};
  context.Services.prefs.setStringPref=()=>{writes++};
  const validRules=JSON.stringify({"example.test":{
    nextSelector:"a.next",
    nextWords:["Next page"],
    confidenceThreshold:90,
    pageTemplate:"/archive/page/{page}",
    action:"url",
    hashMode:"verify"
  }});
  const validPayload=JSON.stringify({schemaVersion:1,settings:{"site-rules":validRules}});
  const valid=vm.runInContext("importSettings(payload)",Object.assign(context,{payload:validPayload}));
  assert.equal(valid.success,true);
  assert.equal(writes,1);

  const invalidRules=[
    JSON.stringify({"example.test":{nextSelector:"["}}),
    JSON.stringify({"example.test":{pageTemplate:"https://evil.test/page/{page}"}}),
    JSON.stringify({"example.test":{action:"execute"}}),
    JSON.stringify({"example.test":{nextWords:[""]}})
  ];
  for(const rules of invalidRules){
    const payload=JSON.stringify({schemaVersion:1,settings:{"site-rules":rules}});
    const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
    assert.equal(result.success,false);
    assert.deepEqual(JSON.parse(JSON.stringify(result.imported)),[]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rejected)),["site-rules"]);
  }
  assert.equal(writes,1);
});


test("blocks repeated pending destinations and backtracks in a navigation cycle",()=>{
  const {context}=load();
  let loads=0;
  const browser={
    currentURI:{spec:"https://example.test/page/1"},
    loadURI(){loads++},
    addEventListener(){},
    removeEventListener(){}
  };
  const tab={linkedBrowser:browser};
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  context.Services.io.newURI=(value)=>value;
  const first=vm.runInContext("navigate(tab,'https://example.test/page/2')",Object.assign(context,{tab}));
  const repeated=vm.runInContext("navigate(tab,'https://example.test/page/2')",context);
  browser.currentURI.spec="https://example.test/page/2";
  const backtrack=vm.runInContext("navigate(tab,'https://example.test/page/1')",context);
  assert.deepEqual([first,repeated,backtrack,loads],[true,false,false,1]);
});

test("clears the pending cycle guard after the destination page is shown",()=>{
  const {context}=load();
  let loads=0;
  const listeners={};
  const browser={
    currentURI:{spec:"https://example.test/page/1"},
    loadURI(){loads++},
    addEventListener:(name,callback)=>{listeners[name]=callback},
    removeEventListener:(name)=>{delete listeners[name]}
  };
  const tab={linkedBrowser:browser};
  context.Services.scriptSecurityManager.getSystemPrincipal=()=>({});
  context.Services.io.newURI=(value)=>value;
  assert.equal(vm.runInContext("navigate(tab,'https://example.test/page/2')",Object.assign(context,{tab})),true);
  browser.currentURI.spec="https://example.test/page/2";
  listeners.pageshow();
  assert.equal(vm.runInContext("navigate(tab,'https://example.test/page/1')",context),true);
  assert.equal(loads,2);
});


test("rejects hidden controls and controls inside unrelated carousel widgets",()=>{
  const {context}=load();
  const hidden=el({attrs:{href:"/page/2",hidden:""}});
  const carousel=el({attrs:{href:"/carousel/next"}});
  carousel.closest=(selector)=>selector.includes("carousel")?{}:null;
  const hiddenByLayout=el({attrs:{href:"/page/2"}});
  hiddenByLayout.getClientRects=()=>[];
  const result=vm.runInContext("({hidden:isSafeNavigationControl(hidden),carousel:isSafeNavigationControl(carousel),layout:isSafeNavigationControl(hiddenByLayout)})",Object.assign(context,{hidden,carousel,hiddenByLayout}));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{hidden:false,carousel:false,layout:false});
});

test("prefers pagination landmarks over generic navigation and carousel Next links",()=>{
  const {context}=load();
  const globalNext=el({text:"Next",attrs:{href:"/next"}});
  globalNext.closest=()=>null;
  const carouselNext=el({text:"Next",attrs:{href:"/carousel/next"}});
  carouselNext.closest=(selector)=>selector.includes("carousel")?{}:null;
  const pagerNext=el({text:"Next",attrs:{href:"/page/2"},pagination:true});
  const doc={querySelectorAll:()=>[globalNext,carouselNext,pagerNext]};
  const browser={currentURI:{spec:"https://example.test/page/1"},contentDocument:doc};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  assert.equal(vm.runInContext("findPaginationControl(1)",context),pagerNext);
});


test("uses accessible names from aria-label, title, and aria-labelledby",()=>{
  const {context}=load();
  const label={textContent:"Next page"};
  const labelled={ownerDocument:{getElementById:(id)=>id==="next-label"?label:null},getAttribute:(name)=>name==="aria-labelledby"?"next-label":null,textContent:""};
  const result=vm.runInContext("({aria:normalizedText({getAttribute:(name)=>name==='aria-label'?'Next page':null,textContent:''}),title:normalizedText({getAttribute:(name)=>name==='title'?'Next page':null,textContent:''}),referenced:normalizedText(labelled)})",Object.assign(context,{labelled}));
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{aria:"next page",title:"next page",referenced:"next page"});
});

test("selects icon-only pagination controls when accessible metadata identifies direction",()=>{
  const {context}=load();
  const aria=el({text:"",attrs:{href:"/page/2","aria-label":"Next page"},pagination:true});
  const title=el({text:"",attrs:{href:"/page/3",title:"Next page"},pagination:true});
  const rel=el({text:"",attrs:{href:"/page/4",rel:"next"},pagination:true});
  const doc={querySelectorAll:()=>[aria,title,rel]};
  context.window.gBrowser={selectedTab:{linkedBrowser:{currentURI:{spec:"https://example.test/page/1"},contentDocument:doc}}};
  assert.equal(vm.runInContext("findPaginationControl(1)",context),rel);
});


test("allows individual keyboard shortcuts to be explicitly disabled",()=>{
  const {context}=load();
  context.Services.prefs.prefHasUserValue=(name)=>name.endsWith("next-shortcut");
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("next-shortcut")?"":fallback;
  const shortcuts=vm.runInContext("getShortcuts()",context);
  assert.equal(shortcuts.next,"");
  assert.equal(shortcuts.previous,"Alt+[");
  assert.equal(shortcuts.jump,"Alt+Shift+P");
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("getShortcutWarnings()",context))),[]);
  assert.equal(vm.runInContext("matches(event,'')",Object.assign(context,{event:{key:']',altKey:true,ctrlKey:false,metaKey:false,shiftKey:false}})),false);
});

test("does not consume a keyboard event for a disabled shortcut",()=>{
  const {context,listeners}=load();
  context.Services.prefs.prefHasUserValue=(name)=>name.endsWith("next-shortcut");
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("next-shortcut")?"":fallback;
  let prevented=0;
  listeners.keydown({key:"]",altKey:true,ctrlKey:false,metaKey:false,shiftKey:false,target:{},repeat:false,isComposing:false,preventDefault(){prevented++},stopPropagation(){}});
  assert.equal(prevented,0);
});

test("imports an empty shortcut as an explicit disabled binding",()=>{
  const {context}=load();
  let saved=null;
  context.Services.prefs.prefHasUserValue=()=>false;
  context.Services.prefs.getBoolPref=(_name,fallback)=>fallback;
  context.Services.prefs.getIntPref=(_name,fallback)=>fallback;
  context.Services.prefs.setStringPref=(name,value)=>{if(name.endsWith("next-shortcut"))saved=value};
  const payload=JSON.stringify({schemaVersion:1,settings:{"next-shortcut":""}});
  const result=vm.runInContext("importSettings(payload)",Object.assign(context,{payload}));
  assert.equal(result.success,true);
  assert.equal(saved,"");
});


test("detects pagination controls inserted or replaced after the initial page load",()=>{
  const {context}=load();
  let controls=[];
  const document={querySelectorAll:()=>controls};
  const browser={currentURI:{spec:"https://example.test/page/1"},contentDocument:document};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  assert.equal(vm.runInContext("findPaginationControl(1)",context),null);

  const lateNext=el({text:"Next",attrs:{href:"/page/2"},pagination:true});
  controls=[lateNext];
  assert.equal(vm.runInContext("findPaginationControl(1)",context),lateNext);

  const replacement=el({text:"Next",attrs:{href:"/page/3"},pagination:true});
  controls=[replacement];
  assert.equal(vm.runInContext("findPaginationControl(1)",context),replacement);
});


test("keeps page labels, URLs, hostnames, and error messages out of diagnostics",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=()=>true;
  vm.runInContext("debugLog('candidate-scored',{label:'Private article title',target:'https://example.test/page?token=secret',host:'private.example',message:'sensitive page detail',tag:'A',score:95,threshold:70,accepted:true})",context);
  const diagnostics=vm.runInContext("getDiagnostics()",context);
  assert.equal(diagnostics.includes("Private article title"),false);
  assert.equal(diagnostics.includes("example.test"),false);
  assert.equal(diagnostics.includes("secret"),false);
  assert.equal(diagnostics.includes("sensitive page detail"),false);
  assert.equal(diagnostics.includes('"score":95'),true);
  assert.equal(diagnostics.includes('"accepted":true'),true);
});

test("records site-rule detection methods without copying control labels",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=()=>true;
  vm.runInContext("debugLog('site-selector-selected',{method:'site-selector',label:'Private button text'})",context);
  const diagnostics=vm.runInContext("getDiagnostics()",context);
  assert.equal(diagnostics.includes("site-selector"),true);
  assert.equal(diagnostics.includes("Private button text"),false);
});


test("reports site-rule selector misses without exposing page data",()=>{
  const {context}=load();
  context.Services.prefs.getBoolPref=()=>true;
  context.Services.prefs.getStringPref=(name,fallback)=>name.endsWith("site-rules")?JSON.stringify({"example.test":{nextSelector:".missing-next"}}):fallback;
  const browser={currentURI:{spec:"https://private.example/article?token=secret"},contentDocument:{querySelector:()=>null,querySelectorAll:()=>[]}};
  context.window.gBrowser={selectedTab:{linkedBrowser:browser}};
  vm.runInContext("findPaginationControl(1)",context);
  const diagnostics=vm.runInContext("getDiagnostics()",context);
  assert.equal(diagnostics.includes("site-selector-not-found"),true);
  assert.equal(diagnostics.includes("no-match"),true);
  assert.equal(diagnostics.includes("private.example"),false);
  assert.equal(diagnostics.includes("secret"),false);
});
