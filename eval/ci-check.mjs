import fs from "node:fs";
import { parseJsonObject } from "./api.mjs";
const raw = JSON.parse(fs.readFileSync("eval/results/mega-claude-opus-5.5-raw.json","utf8"));
const parsed = parseJsonObject(raw.payload.choices[0].message.content);
const S = {}; // slug -> {id: score}
for (const [id,arr] of Object.entries(parsed)) { const ord=raw.order[id]; arr.forEach((s,i)=>{const [m,n,h,c]=String(s).split(",").map(Number); (S[ord[i]] ||= {})[id]={score:(m+n+h)/3,crit:c===1};}); }
const ids = Object.keys(parsed);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length, sd=a=>{const m=mean(a);return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/(a.length-1));};
const names = Object.keys(S);
console.log("per-model mean, SD, 95% CI half-width (n=120)");
for (const s of names.sort((a,b)=>mean(ids.map(i=>S[b][i].score))-mean(ids.map(i=>S[a][i].score)))) { const v=ids.map(i=>S[s][i].score); console.log(s.padEnd(36), mean(v).toFixed(2), "sd", sd(v).toFixed(2), "+-", (1.96*sd(v)/Math.sqrt(v.length)).toFixed(2)); }
function paired(a,b){const d=ids.map(i=>S[a][i].score-S[b][i].score);return {m:mean(d),sd:sd(d),hw:1.96*sd(d)/Math.sqrt(d.length)};}
const top=names.sort((a,b)=>mean(ids.map(i=>S[b][i].score))-mean(ids.map(i=>S[a][i].score)));
console.log("\npaired differences vs #1");
for (let k=1;k<7;k++){const p=paired(top[0],top[k]);const nreq=Math.ceil((1.96*p.sd/Math.max(p.m,0.01))**2);console.log(top[k].padEnd(36),"diff",p.m.toFixed(3),"+-",p.hw.toFixed(3),"sd_diff",p.sd.toFixed(2),"cases needed for 95% sig",nreq);}
// crit rate
console.log("\ncrit rate 95% CI (Wilson-ish) n=120 for top1:");
const c=ids.filter(i=>S[top[0]][i].crit).length/120;console.log(c.toFixed(3),"+-",(1.96*Math.sqrt(c*(1-c)/120)).toFixed(3));
// per-12-lang style: group of 10
const g=ids.slice(0,10).map(i=>S[top[0]][i].score);console.log("n=10 subset CI half-width", (1.96*sd(g)/Math.sqrt(10)).toFixed(2));
