import {setHTML,setText,onLocaleChange} from '../i18n';
import './shell.css';
export type LoadState={phase:'loading'|'ready'|'error';completed:number;total:number;label:string;files:number};
export class LoadTracker{
 private done=new Set<string>();private failed=false;files=0;label='Établissement de la liaison…';
 constructor(readonly stages:readonly string[],private changed:(s:LoadState)=>void=()=>{}){}
 snapshot():LoadState{return {phase:this.failed?'error':this.done.size===this.stages.length?'ready':'loading',completed:this.done.size,total:this.stages.length,label:this.label,files:this.files};}
 report(label:string){this.label=label;this.changed(this.snapshot());}
 file(){this.files++;this.changed(this.snapshot());}
 complete(stage:string){if(this.failed||!this.stages.includes(stage))return;this.done.add(stage);this.changed(this.snapshot());}
 fail(){this.failed=true;this.label='La liaison a été interrompue.';this.changed(this.snapshot());}
}
let screen:HTMLDivElement|undefined;
export let loading:LoadTracker|undefined;
export function beginLoading(mode:'tactical'|'fps'){
 screen=document.createElement('div');screen.className='load-screen';screen.setAttribute('aria-busy','true');screen.setAttribute('role','region');screen.setAttribute('aria-label','Chargement');
 document.body.append(screen);
 setHTML(screen,`<div class="load-inner"><div class="load-sigil" aria-hidden="true">✦</div><small class="shell-kicker">NOCTIS / LIAISON AUSPEX</small><h1>${mode==='tactical'?'Préparation du pont':'Entrée dans le Noctis'}</h1><p id="load-status" role="status" aria-live="polite"></p><progress aria-label="Préparation des ressources"></progress><div class="load-count" id="load-count"></div><p id="load-error" hidden>Une ressource nécessaire est indisponible. Vérifiez votre connexion, puis réessayez.</p><div class="shell-actions"><button class="shell-button" id="load-retry" hidden>Réessayer</button><a class="shell-button shell-secondary" href="./index.html">Retour au menu</a></div></div>`);
 screen.querySelector<HTMLButtonElement>('#load-retry')!.onclick=()=>location.reload();
 const render=(s:LoadState)=>{if(!screen)return;setText(screen.querySelector('#load-status')!,s.label);setText(screen.querySelector('#load-count')!,`${s.completed} / ${s.total} étapes prêtes · ${s.files} modèles décodés`);screen.setAttribute('aria-busy',String(s.phase==='loading'));if(s.phase==='error'){screen.querySelector<HTMLElement>('#load-error')!.hidden=false;screen.querySelector<HTMLElement>('#load-retry')!.hidden=false;screen.querySelector('progress')!.hidden=true;}};
 loading=new LoadTracker(['module','models','world','audio','scene'],render);render(loading.snapshot());
 const off=onLocaleChange(()=>{if(loading)render(loading.snapshot());else off();});
}
export function finishLoading(){if(loading?.snapshot().phase!=='ready')throw Error('Scene readiness gate incomplete');screen?.remove();screen=undefined;loading=undefined;}
export function failLoading(error:unknown){console.error('Noctis loading failed',error);loading?.fail();document.querySelectorAll<HTMLCanvasElement>('canvas').forEach(c=>c.style.visibility='hidden');}
