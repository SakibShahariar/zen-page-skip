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
