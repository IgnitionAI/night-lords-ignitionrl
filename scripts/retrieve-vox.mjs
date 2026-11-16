import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const file='docs/vox/generations.json';
// Use separate delivery records so retrieval cannot overwrite a concurrent submit.
const rows=JSON.parse(readFileSync(file,'utf8'));
for(const row of rows){
 if(!row.generation?.generationId)continue;
 const dst=`docs/vox/delivery-${row.id}.json`;
 if(row.delivery){writeFileSync(dst,JSON.stringify(row.delivery,null,2));continue;}
 try{const old=JSON.parse(readFileSync(dst,'utf8'));if(old.files?.length)continue;}catch{}
 const r=spawnSync('node',['.studio/bridge/tool.mjs','genex__asset','--json',JSON.stringify({operation:'wait',id:row.generation.generationId})],{encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr||r.stdout);
 const delivery=JSON.parse(r.stdout);writeFileSync(dst,JSON.stringify(delivery,null,2));console.log(row.id,delivery.status,delivery.files);
 if(!delivery.files?.length)throw Error('Delivery incomplete: '+row.id);
 await new Promise(r=>setTimeout(r,1200));
}
