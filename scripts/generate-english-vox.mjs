// Resume only missing takes. The Studio bridge owns credentials and authorization.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const ledger='docs/i18n/voice/generations.json';
const rows=JSON.parse(readFileSync(ledger,'utf8'));
const lines=JSON.parse(readFileSync('docs/i18n/voice/lines.json','utf8'));
const save=()=>writeFileSync(ledger,JSON.stringify(rows,null,2)+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function call(args){
  const r=spawnSync('node',['.studio/bridge/tool.mjs','genex__asset','--json',JSON.stringify(args)],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(r.status!==0)throw Error(r.stderr||r.stdout);
  return JSON.parse(r.stdout);
}
for(const line of lines){
  const delivery=`docs/i18n/voice/delivery-${line.id}.json`;
  if(existsSync(delivery)){const files=JSON.parse(readFileSync(delivery,'utf8')).files;if(files?.length&&files.every(f=>existsSync(f)))continue;}
  let row=rows.find(r=>r.id===line.id);
  if(!row){row={...line};rows.push(row);save();}
  if(!row.generation?.generationId){
    if(row.submitted)throw Error('Submission unresolved: '+line.id);
    // Preflight is checked once by the operator. Each create still goes through
    // Studio's own authorization; don't request its growing job ledger per line.
    row.submitted=true;save();
    row.generation=call({operation:'voice',prompt:line.text,options:{voice:'gruff'}});save();
    if(!row.generation.generationId){
      if(/No generation was sent/.test(row.generation.error??'')){row.submitted=false;save();}
      throw Error(JSON.stringify({line:line.id,response:row.generation}));
    }
    console.log('Submitted',line.id,row.generation.generationId);
  }
  const result=call({operation:'wait',id:row.generation.generationId});
  if(!result.files?.length)throw Error(JSON.stringify({line:line.id,response:result}));
  writeFileSync(delivery,JSON.stringify(result,null,2)+'\n');
  row.delivery={id:result.id,files:result.files};save();
  console.log('Delivered',line.id);
  await sleep(18000);
}
console.log('Complete:',lines.length,'spoken lines delivered.');
