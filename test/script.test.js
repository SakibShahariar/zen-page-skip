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
    closest:(selector)=>selector==="form"&&form?{}:
      (selector.includes("pagination")||selector.includes("pager")||selector.includes("navigation")||selector==="nav")&&pagination?{}:null,
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
  assert.equal(reads,2);
  observer.observe(null,"nsPref:changed","zen-page-skip.next-shortcut");
  vm.runInContext("getShortcuts()",context);
  assert.equal(reads,4);
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
  vm.runInContext("for(let i=0;i<105;i++) debugLog('entry',{i})",context);
  const result=vm.runInContext("getDiagnostics()",context);
  assert.equal(result.split("\n").length,100);
  assert.equal(result.includes('"i":0'),false);
  assert.equal(result.includes('"i":104'),true);
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
