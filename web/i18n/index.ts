import pairs from './messages.json';

export type Locale = 'fr' | 'en';
export const LANGUAGE_KEY = 'noctis-language';
export function initialLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'fr' || saved === 'en') return saved;
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
let saved: string | null = null;
try { saved = globalThis.localStorage?.getItem(LANGUAGE_KEY) ?? null; } catch {}
let locale: Locale = initialLocale(saved, typeof navigator === 'undefined' ? ['fr'] : navigator.languages?.length ? navigator.languages : [navigator.language]);
const catalog = new Map<string,string>(pairs.map(([fr,en])=>[fr,en] as const));
const escape = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Source phrases are stable gettext-style keys. A single longest-match pass also
// translates historical engine reports without modifying saved events or rules.
const pattern = new RegExp('(?<![\\p{L}])(?:' + [...catalog.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|') + ')(?![\\p{L}])', 'gu');
export const getLocale = () => locale;
export function t(source: string, language: Locale = locale): string {
  if (language === 'fr') return source;
  return catalog.get(source) ?? source.replace(pattern, key=>catalog.get(key)!);
}
const listeners = new Set<()=>void>();
export function onLocaleChange(fn:()=>void) { listeners.add(fn); return ()=>listeners.delete(fn); }
export function setLocale(next: Locale) {
  if (next !== 'fr' && next !== 'en') return;
  locale = next;
  try { localStorage.setItem(LANGUAGE_KEY,next); } catch {}
  if (typeof document !== 'undefined') { document.documentElement.lang=next; refresh(); }
  listeners.forEach(fn=>fn());
}

// Explicit presentation boundary: only text and accessibility attributes are
// translated. IDs, values, data attributes, URLs and game state are never touched.
// Keeping the original nodes retains focus, controls and their event handlers
// when the player switches language, including an open debrief or live FPS HUD.
const textSources = new Map<Text,{source:string;rendered:string}>();
const attributeSources = new Map<Element,Map<string,{source:string;rendered:string}>>();
export function localize(root: Node) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode() as Text|null;node;node=walker.nextNode() as Text|null){
    if(node.parentElement?.closest('script,style,code,[data-no-i18n]'))continue;
    const old=textSources.get(node),current=node.data;
    const source=old?.rendered===current?old.source:current;
    const rendered=t(source);node.data=rendered;
    if(source.trim())textSources.set(node,{source,rendered});
  }
  const elements=root instanceof Element?[root,...root.querySelectorAll('*')]:root instanceof Document?[...root.querySelectorAll('*')]:[];
  for(const el of elements)for(const name of ['title','aria-label','placeholder'])if(el.hasAttribute(name)){
    const attrs=attributeSources.get(el)??new Map(),old=attrs.get(name),current=el.getAttribute(name)!;
    const source=old?.rendered===current?old.source:current,rendered=t(source);
    el.setAttribute(name,rendered);attrs.set(name,{source,rendered});attributeSources.set(el,attrs);
  }
  // Discard detached render nodes; the table is bounded by the current UI.
  for(const n of textSources.keys())if(!n.isConnected)textSources.delete(n);
  for(const n of attributeSources.keys())if(!n.isConnected)attributeSources.delete(n);
}
function refresh(){
  for(const [node,record] of textSources){if(!node.isConnected){textSources.delete(node);continue;}if(node.data!==record.rendered)record.source=node.data;node.data=record.rendered=t(record.source);}
  for(const [el,attrs] of attributeSources){if(!el.isConnected){attributeSources.delete(el);continue;}for(const [name,r] of attrs){if(el.getAttribute(name)!==r.rendered)r.source=el.getAttribute(name)??'';el.setAttribute(name,r.rendered=t(r.source));}}
  document.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.locale===locale)));
}
export function setAttributeText(el:Element,name:string,source:string){
 const rendered=t(source),attrs=attributeSources.get(el)??new Map();
 el.setAttribute(name,rendered);attrs.set(name,{source,rendered});attributeSources.set(el,attrs);
}
export function setText(el:Node,value:unknown,append=false){
  const previous=append?[...el.childNodes].map(n=>n.nodeType===Node.TEXT_NODE?textSources.get(n as Text)?.source??n.textContent:n.textContent).join(''):'';
  el.textContent=previous+String(value??'');localize(el);
}
export function setHTML(el:Element,value:unknown,append=false){
  if(append)el.insertAdjacentHTML('beforeend',String(value??''));else el.innerHTML=String(value??'');
  localize(el);
}
export function languagePicker(){return `<span class="language-picker" role="group" aria-label="Langue"><button type="button" data-locale="fr" aria-pressed="${locale==='fr'}">FR</button><button type="button" data-locale="en" aria-pressed="${locale==='en'}">EN</button></span>`;}
if(typeof document!=='undefined'){
  document.documentElement.lang=locale;
  localize(document.head);
  document.addEventListener('click',event=>{const b=(event.target as Element)?.closest<HTMLButtonElement>('[data-locale]');if(b){event.preventDefault();setLocale(b.dataset.locale as Locale);}});
}
