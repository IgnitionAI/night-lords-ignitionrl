import {languagePicker,setHTML} from '../i18n';
import './shell.css';
export const controlsMarkup=()=>`<div class="control-grid"><div><h3>Commandement tactique</h3><dl><dt>1–4 · M / T / G / R / E / C</dt><dd>Sélectionner un frère, puis préparer son ordre.</dd><dt>Entrée</dt><dd>Exécuter les ordres simultanément.</dd><dt>Molette · Glisser</dt><dd>Zoomer et déplacer la carte.</dd></dl></div><div><h3>Combat FPS</h3><dl><dt>ZQSD / WASD · Souris</dt><dd>Se déplacer et viser.</dd><dt>Clic / Espace · F / Maj · R</dt><dd>Tirer, frapper au gantelet, recharger.</dd><dt>Échap / P</dt><dd>Mettre en pause et accéder au menu.</dd></dl></div></div>`;
export function openPanel(title:string,body:string,close:()=>void,kicker='NOCTIS / COMMANDEMENT'){
 const root=document.createElement('div');root.className='shell-modal';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','shell-title');
 const previous=document.activeElement as HTMLElement|null;
 const siblings=[...document.body.children].filter(e=>e instanceof HTMLElement) as HTMLElement[];
 const inertBefore=siblings.map(e=>e.inert);siblings.forEach(e=>e.inert=true);
 document.body.append(root);
 setHTML(root,`<section class="shell-card"><div class="shell-heading"><div><small class="shell-kicker">${kicker}</small><h2 id="shell-title">${title}</h2></div><button class="shell-close" data-shell-close>Retour</button></div>${body}</section>`);
 const dispose=()=>{root.remove();siblings.forEach((e,i)=>e.inert=inertBefore[i]);previous?.focus();};
 root.querySelector('[data-shell-close]')!.addEventListener('click',()=>{dispose();close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dispose();close();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll<HTMLElement>('button,a[href],input,select')].filter(el=>!el.hasAttribute('disabled'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 root.querySelector<HTMLButtonElement>('button')?.focus();return {root,dispose};
}
export const languageSettings=()=>`${languagePicker()}<p>La langue choisie s’applique aux textes, aux sous-titres et aux voix.</p>`;
