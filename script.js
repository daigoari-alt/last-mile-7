const JOBS = [
  { id:'flex', name:'Amazon Flex', icon:'📦', rarity:'R', revenue:9000, hours:4, stamina:-15, credit:2, vehicle:-3, note:'短時間で堅実' },
  { id:'company', name:'企業配送', icon:'🏢', rarity:'SR', revenue:18000, hours:10, stamina:-30, credit:4, vehicle:-5, note:'長丁場・高評価' },
  { id:'spot', name:'スポット便', icon:'⚡', rarity:'SSR', revenue:25000, hours:8, stamina:-35, credit:5, vehicle:-8, note:'高単価・リスク高', risky:true },
  { id:'food', name:'フードデリバリー', icon:'🍱', rarity:'N', revenue:6000, hours:3, stamina:-10, credit:1, vehicle:-2, note:'小回り勝負' },
  { id:'maintenance', name:'車両を整備する', icon:'🔧', rarity:'SR', revenue:0, expense:20000, hours:3, stamina:-5, credit:0, vehicle:35, note:'整備費で耐久を回復' },
  { id:'rest', name:'休む', icon:'🌙', rarity:'R', revenue:0, hours:0, stamina:30, credit:-1, vehicle:0, note:'体力を回復' }
];

const EVENTS = [
  { name:'順調な一日', text:'予定どおり配送完了。', weight:28, apply:r=>r },
  { name:'渋滞', text:'渋滞に巻き込まれ、体力を余分に消耗した。', weight:15, apply:r=>({...r, stamina:r.stamina-8, hours:r.hours+2}) },
  { name:'不在続き', text:'再配達が重なり、売上と信用が少し下がった。', weight:12, apply:r=>({...r, revenue:Math.round(r.revenue*.8), credit:r.credit-2, stamina:r.stamina-4}) },
  { name:'突然の雨', text:'雨天走行でペースダウン。車両にも負担がかかった。', weight:12, apply:r=>({...r, stamina:r.stamina-5, vehicle:r.vehicle-3, hours:r.hours+1}) },
  { name:'追加依頼', text:'帰り道の追加便を獲得！', weight:14, apply:r=>({...r, revenue:r.revenue+5000, stamina:r.stamina-7, credit:r.credit+2, vehicle:r.vehicle-2, hours:r.hours+2}) },
  { name:'お客様から高評価', text:'丁寧な仕事が評価され、信用が上がった。', weight:10, apply:r=>({...r, credit:r.credit+3}) },
  { name:'車両トラブル', text:'車両故障！修理代15,000円が発生した。', weight:9, risk:true, apply:r=>({...r, expense:r.expense+15000, vehicle:r.vehicle-10, hours:r.hours+3}) }
];

const SUPPORTS = [
  { id:'drink', name:'栄養ドリンク', icon:'🥤', rarity:'R', text:'体力を20回復', price:3000, apply:()=>state.stamina=clamp(state.stamina+20,0,100) },
  { id:'outsource', name:'外注カード', icon:'🤝', rarity:'SR', text:'次の配送売上が1.6倍', price:12000, apply:()=>state.outsourceMultiplier=1.6 },
  { id:'outsourceW', name:'外注Wカード', icon:'🤝', rarity:'SSR', text:'次の配送売上が2.3倍', price:22000, limitedDay:3, apply:()=>state.outsourceMultiplier=2.3 }
];

const GAME_DAYS = 7;
const FIXED_COSTS = 55000;
const initialState = () => ({ day:1, cash:100000, stamina:100, credit:30, vehicle:80, sales:0, expenses:0, totalHours:0, logs:[], sick:false, supportUsed:false, outsourceMultiplier:0, inventory:{drink:0,outsource:0,outsourceW:0}, finished:false });
let state = initialState();
let currentHand = [];
const $ = id => document.getElementById(id);
const yen = value => `${value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('ja-JP')}`;
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

function renderJobs(){
  if(!currentHand.length) currentHand = drawHand();
  $('choiceNote').textContent=state.sick?'体調不良・強制休養':'3枚から1枚';
  $('jobList').innerHTML = currentHand.map(job => `
    <button class="job-card ${job.risky?'risky':''} ${job.id==='rest'?'rest':''} ${job.id==='maintenance'?'maintenance':''}" data-job="${job.id}" data-rarity="${job.rarity}" ${state.finished?'disabled':''}>
      <span class="card-rarity"><b>${job.rarity}</b>${job.risky?'HIGH RISK':job.id==='rest'?'RECOVERY':job.id==='maintenance'?'GARAGE':'DELIVERY'}</span>
      <span class="card-rank">${job.rarity}</span>
      <span class="job-icon"><i>${job.icon}</i></span>
      <span class="job-title"><strong>${job.name}</strong><small>${job.note}</small></span>
      <strong class="job-revenue">${job.expense ? `− ${yen(job.expense)}` : job.revenue ? `＋ ${yen(job.revenue)}` : '売上なし'}</strong>
      <span class="job-data">
        <span>⏱ ${job.hours ? `${job.hours}h` : '休日'}</span><span>💪 ${signed(job.stamina)}</span><span>★ ${signed(job.credit)}</span><span>🚐 ${signed(job.vehicle)}</span>
      </span>
      <span class="pick-card">このカードを選ぶ <b>→</b></span>
    </button>`).join('');
  document.querySelectorAll('[data-job]').forEach(button=>button.addEventListener('click',()=>takeJob(button.dataset.job)));
}

function renderSupport(){
  if(state.sick){ $('supportZone').innerHTML='<div class="support-locked">🤒 体調不良中はサポートカードを使用できません</div>'; return; }
  const visibleCards=SUPPORTS.filter(card=>!card.limitedDay||state.day===card.limitedDay||state.inventory[card.id]>0);
  $('supportZone').innerHTML=`<div class="support-label"><span>YOUR SUPPORT</span><small>1日1枚まで使用</small></div><div class="support-hand">${visibleCards.map(card=>`<button class="support-card" data-support="${card.id}" data-rarity="${card.rarity}" ${state.supportUsed||state.finished||!state.inventory[card.id]?'disabled':''}><span class="support-rarity">${card.rarity}</span><span class="support-icon">${card.icon}</span><span class="support-copy"><strong>${card.name}</strong><small>${state.inventory[card.id]?card.text:'在庫なし'}</small></span><span class="support-stock">×${state.inventory[card.id]}</span></button>`).join('')}</div>`;
  document.querySelectorAll('[data-support]').forEach(button=>button.addEventListener('click',()=>useSupport(button.dataset.support)));
}

function useSupport(id){
  if(state.supportUsed||state.sick||state.finished) return;
  const card=SUPPORTS.find(item=>item.id===id); if(!card||!state.inventory[id]) return;
  card.apply(); state.inventory[id]--; state.supportUsed=true;
  $('resultBanner').className='result-banner revealed support-result';
  $('resultBanner').innerHTML=`<span class="result-banner-icon">${card.icon}</span><div><strong>${card.name}を使用</strong><p>${card.text}。このまま案件カードを選べます。</p></div>`;
  updateUI();
}

function renderShop(){
  $('shopCash').textContent=yen(state.cash);
  const saleCards=SUPPORTS.filter(card=>!card.limitedDay||state.day===card.limitedDay);
  $('shopItems').innerHTML=saleCards.map(card=>`<article class="shop-item" data-rarity="${card.rarity}"><span class="shop-item-rarity">${card.rarity}</span><div class="shop-item-icon">${card.icon}</div><h3>${card.name}</h3><p>${card.id==='outsource'?'次の配送売上が1.6倍。体力・車両消費は案件どおり。':card.id==='outsourceW'?'3日目限定販売。次の配送売上が2.3倍。':'体力を20回復する。'}</p><div class="shop-item-bottom"><strong>${yen(card.price)}</strong><button data-buy="${card.id}" ${state.cash<card.price||state.finished?'disabled':''}>購入する</button></div><small>在庫 ×${state.inventory[card.id]}${card.limitedDay?'・本日限定':''}</small></article>`).join('');
  document.querySelectorAll('[data-buy]').forEach(button=>button.addEventListener('click',()=>buySupport(button.dataset.buy)));
}

function buySupport(id){
  const card=SUPPORTS.find(item=>item.id===id); if(!card||state.cash<card.price||state.finished) return;
  state.cash-=card.price; state.expenses+=card.price; state.inventory[id]++;
  $('resultBanner').className='result-banner revealed support-result';
  $('resultBanner').innerHTML=`<span class="result-banner-icon">🛍️</span><div><strong>${card.name}を購入</strong><p>サポートカードの在庫に追加しました。</p></div>`;
  updateUI(-card.price); renderShop();
}

function drawHand(){
  if(state.sick) return [JOBS.find(job=>job.id==='rest')];
  const work = JOBS.filter(job=>!['rest','maintenance'].includes(job.id)).sort(()=>Math.random()-.5).slice(0,2);
  const remaining = JOBS.filter(job=>!work.includes(job));
  const supportChance = Math.random();
  const thirdPool = supportChance < .62 ? remaining.filter(job=>['rest','maintenance'].includes(job.id)) : remaining;
  const third = thirdPool[Math.floor(Math.random()*thirdPool.length)];
  return [...work,third].sort(()=>Math.random()-.5);
}

function signed(n){ return `${n>0?'+':''}${n}`; }
function weightedEvent(job){
  if(job.id==='rest') return Math.random()<.18 ? EVENTS[5] : EVENTS[0];
  if(job.id==='maintenance') return { name:'整備完了', text:'消耗部品を交換し、車両の耐久が大きく回復した。', apply:r=>r };
  const pool = EVENTS.map(event=>({...event, adjusted:event.risk&&job.risky?event.weight*2:event.weight}));
  let roll=Math.random()*pool.reduce((sum,e)=>sum+e.adjusted,0);
  return pool.find(e=>(roll-=e.adjusted)<=0) || pool[0];
}

function takeJob(id){
  if(state.finished) return;
  const job=JOBS.find(j=>j.id===id);
  const event=weightedEvent(job);
  let result={ revenue:job.revenue, expense:job.expense||0, hours:job.hours, stamina:job.stamina, credit:job.credit, vehicle:job.vehicle };
  result=event.apply(result);
  const breakdown=[];
  const outsourced=state.outsourceMultiplier>0&&job.revenue>0;
  if(outsourced){ const multiplier=state.outsourceMultiplier; result.revenue=Math.round(result.revenue*multiplier); breakdown.push(`外注配送：売上${multiplier}倍`); state.outsourceMultiplier=0; }
  if(state.stamina<=15 && !['rest','maintenance'].includes(job.id)) { result.revenue=Math.round(result.revenue*.7); result.credit-=2; breakdown.push('疲労で効率低下'); }
  if(state.vehicle<=15 && !['rest','maintenance'].includes(job.id)) { result.expense+=8000; result.vehicle-=3; breakdown.push('応急整備 ¥8,000'); }
  state.cash += result.revenue-result.expense;
  state.sales += result.revenue;
  state.expenses += result.expense;
  state.totalHours += result.hours;
  state.stamina=clamp(state.stamina+result.stamina,0,100);
  state.credit=clamp(state.credit+result.credit,0,100);
  state.vehicle=clamp(state.vehicle+result.vehicle,0,100);
  if(job.id==='rest') state.sick=false;
  else if(!['maintenance'].includes(job.id) && state.stamina===0) state.sick=true;
  state.logs.unshift({day:state.day,job:job.name,event:event.name,text:event.text,revenue:result.revenue,expense:result.expense,hours:result.hours,extra:breakdown.join('・')});
  showResultBanner(job,event,result);
  if(state.sick) showSickBanner();
  if(state.day>=GAME_DAYS) finishMonth(); else { state.day++; state.supportUsed=false; currentHand=drawHand(); updateUI(result.revenue-result.expense); }
}

function showSickBanner(){
  $('resultBanner').className='result-banner sick';
  $('resultBanner').innerHTML='<span class="result-banner-icon">🤒</span><div><strong>体調不良になりました</strong><p>体力が0になったため、翌日は休養カードしか選べません。</p></div>';
}

function showResultBanner(job,event,result){
  const net=result.revenue-result.expense;
  $('resultBanner').className=`result-banner revealed ${net<0?'cost':''}`;
  $('resultBanner').innerHTML=`<span class="result-banner-icon">${job.icon}</span><div><strong>${event.name}</strong><p>${event.text}　本日の収支 <b>${yen(net)}</b></p></div>`;
}

function finishMonth(){
  state.cash-=FIXED_COSTS; state.expenses+=FIXED_COSTS; state.finished=true; updateUI(-FIXED_COSTS);
  const profit=state.sales-state.expenses;
  const score=(profit>=80000?35:profit>=40000?26:profit>=0?16:profit>=-30000?7:0)+(state.credit*.25)+(state.stamina*.15)+(state.vehicle*.25);
  const titles=[
    {name:'廃業寸前',rarity:'N',comment:'まずは生き残ることから。休養と整備を早めに使おう。'},
    {name:'赤字ルーキー',rarity:'N+',comment:'痛い授業料になった7日間。低リスク案件で立て直そう。'},
    {name:'ぎりぎり完走',rarity:'R',comment:'完走したことが第一歩。支出と車両消耗を見直そう。'},
    {name:'見習いドライバー',rarity:'R+',comment:'仕事の流れはつかめた。次は利益を残す選択に挑戦。'},
    {name:'街の配達人',rarity:'SR',comment:'地域を支える立派な配達人。安定感が育っている。'},
    {name:'堅実オーナー',rarity:'SR+',comment:'稼ぎと管理のバランス良好。事業が軌道に乗ってきた。'},
    {name:'信頼の運び屋',rarity:'SSR',comment:'丁寧な仕事で信用を獲得。指名が増えそうな経営だ。'},
    {name:'軽貨物エース',rarity:'SSR+',comment:'街でも評判のエース。高い収益性と安定感を両立した。'},
    {name:'配送王',rarity:'UR',comment:'圧倒的な判断力。軽貨物業界の頂点が見えている。'},
    {name:'伝説の個人事業主',rarity:'LR',comment:'利益、信用、健康、車両管理。そのすべてを極めた伝説。'}
  ];
  const level=clamp(Math.floor(score/10)+1,1,10);
  const title=titles[level-1];
  state.finalTitle=title.name; state.finalRarity=title.rarity; state.finalProfit=profit;
  $('rankBadge').textContent=level; $('driverTitle').textContent=title.name; $('titleRarity').textContent=title.rarity; $('totalScore').textContent=Math.round(score); $('titleCard').dataset.level=level;
  $('resultTitle').textContent='あなたの称号が決まりました'; $('resultComment').textContent=title.comment;
  $('reportSales').textContent=yen(state.sales); $('reportExpenses').textContent=yen(state.expenses); $('reportProfit').textContent=yen(profit); $('reportCash').textContent=yen(state.cash);
  $('finalStats').innerHTML=`<span>信用 <strong>${state.credit}</strong></span><span>体力 <strong>${state.stamina}</strong></span><span>車両 <strong>${state.vehicle}</strong></span><span>労働 <strong>${state.totalHours}h</strong></span>`;
  setTimeout(()=>$('resultDialog').showModal(),350);
}

function metricStatus(value,type){
  if(type==='stamina') return value>70?'絶好調':value>35?'疲れ気味':value>15?'要休養':'限界寸前';
  if(type==='credit') return value>75?'地域のエース':value>50?'信頼十分':value>25?'駆け出し':'信用不足';
  return value>70?'快調':value>40?'使用感あり':value>15?'要整備':'故障寸前';
}
function setMeter(id,value){ const bar=$(id); bar.style.width=`${value}%`; bar.style.background=value<=20?'var(--red)':value<=40?'var(--orange)':'var(--green)'; }
function updateUI(delta=0){
  $('dayNumber').textContent=state.day; $('dayMessage').textContent=state.finished?'7日間の精算が完了しました。結果を確認しましょう。':'配られた手札から、今日の一手を選ぼう。';
  const completed=state.finished?GAME_DAYS:state.day-1; const percent=Math.round(completed/GAME_DAYS*100); $('progressText').textContent=`${percent}%`; $('progressBar').style.width=`${percent}%`;
  $('cash').textContent=yen(state.cash); $('cashDelta').textContent=delta ? `前日比 ${yen(delta)}` : '開業資金';
  ['stamina','credit','vehicle'].forEach(key=>{ $(key).textContent=state[key]; setMeter(`${key}Bar`,state[key]); $(`${key}Status`).textContent=metricStatus(state[key],key); });
  $('gameLog').innerHTML=state.logs.length ? state.logs.map(log=>`<li><span class="log-day">${log.day}日</span><strong>${log.job}</strong>・${log.hours}時間 <span class="log-event">${log.event} — ${log.text}</span><span class="log-money">売上 ${yen(log.revenue)}${log.expense?` / 経費 ${yen(log.expense)}`:''}</span>${log.extra?`<br>${log.extra}`:''}</li>`).join('') : '<li>案件を選ぶと、ここに一日の記録が残ります。</li>';
  $('logCount').textContent=`${state.logs.length}件`; renderJobs();
  renderSupport();
  document.querySelector('.main-stat').classList.remove('flash'); requestAnimationFrame(()=>document.querySelector('.main-stat').classList.add('flash'));
}
function resetGame(){ state=initialState(); currentHand=drawHand(); $('resultBanner').className='result-banner'; $('resultBanner').innerHTML='<span class="result-banner-icon">🃏</span><div><strong>カードを1枚選んでください</strong><p>仕事、休養、整備。今日の一手が月末の結果を変えます。</p></div>'; $('resultDialog').close(); if($('shopDialog').open)$('shopDialog').close(); updateUI(); }
function shareResultToX(){
  if(!state.finished||!state.finalTitle) return;
  const text=`【LAST MILE // 7】\n7日間の称号は「${state.finalTitle}」［${state.finalRarity}］\n売上 ${yen(state.sales)}｜利益 ${yen(state.finalProfit)}\nあなたも軽貨物経営に挑戦！\n\n#LASTMILE7 #軽貨物経営ゲーム`;
  const params=new URLSearchParams({text});
  if(location.protocol==='https:'||location.protocol==='http:') params.set('url',location.href.split('#')[0].split('?')[0]);
  window.open(`https://x.com/intent/post?${params.toString()}`,'_blank','noopener,noreferrer,width=720,height=640');
}
$('resetButton').addEventListener('click',()=>{ if(confirm('現在の記録を消して最初から始めますか？')) resetGame(); });
$('playAgain').addEventListener('click',resetGame); $('closeResult').addEventListener('click',()=>$('resultDialog').close());
$('shareX').addEventListener('click',shareResultToX);
$('openShop').addEventListener('click',()=>{ renderShop(); $('shopDialog').showModal(); }); $('closeShop').addEventListener('click',()=>$('shopDialog').close());
updateUI();
