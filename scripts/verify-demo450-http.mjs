// Explicit local demo only. Starts a temporary API, reads real endpoints, then stops it.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
require('dotenv').config({path:'.env.demo450.local',quiet:true});
if(process.env.DEMO_DATABASE_NAME!=='sunshine_demo450')throw Error('Use the prepared demo450 environment');
const report=JSON.parse(await readFile('var/demo450/verification.json','utf8'));
const {buildManifest}=require('../apps/api/dist/demo/manifest');
const rows=buildManifest(report.anchor),checks=[];
const port=await new Promise((accept,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>accept(p));});});
const origin=`http://127.0.0.1:${port}`,base=origin+'/api/v1';
const child=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:resolve('.'),env:{...process.env,PORT:String(port),AUTH_TRUSTED_ORIGINS:origin},stdio:['ignore','pipe','pipe'],windowsHide:true});
child.stderr.on('data',()=>{});child.stdout.on('data',()=>{});
try{
  let ready=false;
  for(let n=0;n<80;n++){
    if(child.exitCode!==null)throw Error('Temporary API exited before readiness');
    try{ready=(await fetch(base+'/health/ready')).ok;}catch{}
    if(ready)break;await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(ready,'Temporary API ready');
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:'admin@sunshine.test',password:process.env.DEMO_STAFF_PASSWORD})});
  assert.equal(login.status,200,'Demo admin sign-in');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  async function get(route){
    const response=await fetch(base+route,{headers:{cookie}}),text=await response.text();
    assert.equal(response.status,200,`${route}: HTTP ${response.status}`);
    checks.push({route,status:response.status});
    return {response,text,json:response.headers.get('content-type')?.includes('json')?JSON.parse(text):null};
  }
  const first=(await get('/enquiries?page=1&pageSize=25')).json.data;
  const last=(await get('/enquiries?page=18&pageSize=25')).json.data;
  assert.equal(first.total,450);assert.equal(last.items.length,25);assert.equal(new Set([...first.items,...last.items].map(x=>x.id)).size,50);
  const jobs=(await get('/jobs?page=1&pageSize=25')).json.data;assert.equal(jobs.total,145);
  for(const index of [200,357,380,390,440])await get(`/enquiries/${rows[index].enquiryId}`);
  const job=(await get(`/jobs/${rows[390].jobId}`)).json.data;assert.equal(job.status,'COMPLETED');
  const order=(await get(`/enquiries/${rows[390].enquiryId}/order`)).json.data;assert.equal(order.invoice.balance,'0.00');
  const warranty=(await get('/warranties/lookup?serial=INV-ACTIVE-2025-01')).json.data;assert.equal(warranty.assessment.coverageStatus,'COVERED');
  assert.equal((await get('/warranties/lookup?serial=BAT-EXPIRED-2024-09')).json.data.assessment.coverageStatus,'EXPIRED');
  const tickets=(await get('/tickets?page=1&pageSize=20')).json.data;assert.equal(tickets.total,15);
  assert.equal((await get('/tickets/d4510000-0000-4000-8000-000000000051')).json.data.status,'OPEN');
  await get('/tickets/d4510000-0000-4000-8000-000000000051/events');
  const profitability=(await get(`/reports/profitability?jobId=${rows[390].jobId}`)).json.data;
  const csv=await get(`/reports/export.csv?report=profitability&jobId=${rows[390].jobId}`);assert.ok(csv.response.headers.get('content-type').startsWith('text/csv'));assert.ok(csv.text.includes(rows[390].jobId));
  const month=(await get('/reports/overview?period=month')).json.data;
  if(month.startDate.slice(0,7)===report.anchor.slice(0,7)){assert.ok(Number(month.invoicedRevenue)>0);assert.ok(Number(month.cashReceived)>0);}
  await get('/reports/operations?jobsPage=1&ticketsPage=1&pageSize=25');await get('/reports/subsidies');await get('/reports/pay-summary?period=month');
  for(const fileId of [...job.photoFileIds,job.signatureFileId]){
    const response=await fetch(base+`/files/${fileId}`,{headers:{cookie}});assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>100);checks.push({route:`/files/${fileId}`,status:200});
  }
  const shell=await fetch(origin+'/workspace/sales');assert.equal(shell.status,200);assert.ok((await shell.text()).includes('type="module"'));checks.push({route:'/workspace/sales (built SPA)',status:200});
  await fetch(base+'/auth/logout',{method:'POST',headers:{cookie,origin}});
  await mkdir('var/demo450',{recursive:true});
  await writeFile('var/demo450/http-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),customers:450,checks,profitability,month},null,2)+'\n');
  console.log(JSON.stringify({verified:true,checks:checks.length,customers:450,report:'var/demo450/http-verification.json'}));
}finally{
  child.kill();
  if(child.exitCode===null)await new Promise(r=>child.once('exit',r));
}
