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
