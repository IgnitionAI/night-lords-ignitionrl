// Studio owns authorization and generation. Persist each submission before the next,
// and never re-submit a line whose result is unknown.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const file='docs/vox/generations.json';
const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
const lines=JSON.parse(readFileSync('docs/vox/lines.json','utf8'));
function save(){writeFileSync(file,JSON.stringify(rows,null,2)+'\n');}
function call(tool,args){const r=spawnSync('node',['.studio/bridge/tool.mjs',tool,'--json',JSON.stringify(args)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return JSON.parse(r.stdout);}
const limit=Number(process.argv[2]??lines.length);
for(const line of lines.slice(0,limit)){
 let row=rows.find(r=>r.id===line.id);
 if(row?.generation?.generationId)continue;
 if(row?.submitted)throw Error('Unresolved submission: '+line.id);
 const s=call('genex__asset',{operation:'status'});
 if(!s.connected||!s.enabled||s.lanes?.paused||s.legal?.accepted!==true)throw Error('Voice lane not ready');
 const preflight={checkedAt:new Date().toISOString(),enabled:s.enabled,credentialState:s.credentialState,legalAccepted:s.legal.accepted,voiceLane:s.lanes?.lanes?.find(x=>x.kind==='voice'),voicePriceCeiling:s.allowance?.prices?.voice,allowanceEnforced:s.allowance?.allowance?.enforced};
 if(!row){row={...line};rows.push(row);}Object.assign(row,{preflight,submitted:true});save();
 row.generation=call('genex__asset',{operation:'voice',prompt:line.text,options:{voice:'gruff'}});save();
 console.log(line.id,JSON.stringify(row.generation));
 if(!row.generation.generationId){if(/No generation was sent/.test(row.generation.error??'')){row.submitted=false;save();}throw Error('No generation id; inspect response before continuing');}
 await new Promise(r=>setTimeout(r,12000));
}
