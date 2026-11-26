const A=[["gpt","GPT","종합 분석","#55c99a"],["gemini","Gemini","다각도 탐색","#6d9cff"],["claude","Claude","논리와 맥락","#b18af2"],["perplexity","Perplexity","근거 중심","#49c9c2"],["grok","Grok","비판적 관점","#aab3c2"]];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let chosen=new Set(A.map(x=>x[0])),settings=JSON.parse(localStorage.getItem("afc-settings")||'{"theme":"dark","rounds":"3"}');
const getHistory=()=>JSON.parse(localStorage.getItem("afc-history")||"[]");
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function drawAI(){
  $("#aiGrid").innerHTML=A.map(a=>'<button class="ai-card '+(chosen.has(a[0])?"selected":"")+'" style="--ai:'+a[3]+'" data-ai="'+a[0]+'"><i class="dot"></i><span><strong>'+a[1]+'</strong><small>'+a[2]+'</small></span><b class="check">'+(chosen.has(a[0])?"✓":"＋")+'</b></button>').join("");
  $("#profiles").innerHTML=A.map(a=>'<article class="history-item" style="border-left:3px solid '+a[3]+'"><b>'+a[1]+'</b><p>'+a[2]+'</p></article>').join("");
  $$("[data-ai]").forEach(b=>b.onclick=()=>{chosen.has(b.dataset.ai)?chosen.delete(b.dataset.ai):chosen.add(b.dataset.ai);drawAI()});
}
function view(v){
  $$(".view").forEach(x=>x.hidden=x.id!=="view-"+v);
  $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  $("#pageTitle").textContent=({debate:"AI 토론실",history:"토론 기록",participants:"AI 참가자",settings:"설정"})[v];
  if(v==="history")drawHistory();
  $("#sidebar").classList.remove("open");
}
function showTranscript(items){
  $("#rounds").innerHTML=items.map(x=>{
    const ai=A.find(a=>a[0]===x.id),color=ai?.[3]||"#8da3ff";
    const state=x.status==="success"?"실제 응답":x.status==="demo"?"데모 응답":x.status==="not_configured"?"미설정":"오류";
    return '<article class="response" style="--ai:'+color+'"><h4>'+safe(x.name)+' · ROUND '+x.round+' · '+state+'</h4><p>'+safe(x.text||x.error)+'</p></article>';
  }).join("");
}
function drawHistory(){
  const h=getHistory();
  $("#history").innerHTML=h.length?h.map((r,i)=>'<article class="history-item"><b>'+safe(r.q)+'</b><p>'+new Date(r.date).toLocaleString("ko-KR")+' · '+r.people.map(safe).join(", ")+'</p><button class="link" data-record="'+i+'">결과 보기</button></article>').join(""):'<article class="history-item">저장된 토론이 없습니다.</article>';
  $$("[data-record]").forEach(b=>b.onclick=()=>{
    const r=getHistory()[+b.dataset.record];view("debate");$("#question").value=r.q;
    $("#debatePanel").hidden=false;showTranscript(r.items);$("#judge").hidden=false;
    $("#judge").innerHTML="<h3>🏆 최종 심판</h3><p>"+safe(r.judge)+"</p>";
    $("#status").textContent="저장된 결과 · "+(r.mode==="live"?"실제 API":"데모");
  });
}
async function refreshHealth(){
  try{
    const r=await fetch("/api/health");const data=await r.json();
    $("#modeBadge").textContent=data.mode==="live"?"LIVE API":"LOCAL · DEMO";
    $("#modeHelp").textContent=data.mode==="live"?"실제 API 모드 · 공급자별 설정 상태 확인":"로컬 데모 모드 · 실제 API 호출 없음";
  }catch{
    $("#modeBadge").textContent="서버 미연결";
    $("#modeHelp").textContent="로컬 서버를 실행한 뒤 페이지를 새로고침하세요.";
  }
}
async function start(){
  const question=$("#question").value.trim(),participants=[...chosen],rounds=Number(settings.rounds);
  if(!question)return $("#question").focus();
  if(!participants.length)return alert("AI 참가자를 한 명 이상 선택해 주세요.");
  $("#debatePanel").hidden=false;$("#judge").hidden=true;$("#rounds").innerHTML="";
  $("#progress").style.width="8%";$("#status").textContent="로컬 서버에 연결하는 중…";
  $("#start").disabled=true;$("#start").textContent="토론 진행 중…";
  try{
    const response=await fetch("/api/debate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,participants,rounds})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"토론 요청에 실패했습니다.");
    showTranscript(data.transcript||[]);
    $("#progress").style.width="100%";
    $("#judge").hidden=false;
    $("#judge").innerHTML="<h3>🏆 최종 심판 · "+(data.judge?.status==="success"?"GPT 실제 응답":"결과")+"</h3><p>"+safe(data.judge?.text||"판정 결과가 없습니다.")+"</p>";
    const successes=(data.transcript||[]).filter(x=>x.status==="success").length;
    const demos=(data.transcript||[]).filter(x=>x.status==="demo").length;
    const errors=(data.transcript||[]).filter(x=>["error","not_configured"].includes(x.status)).length;
    $("#status").textContent=data.mode==="demo"?"데모 토론 완료 · 실제 AI 호출 없음":'실제 API 응답 '+successes+'개 · 미설정/오류 '+errors+'개';
    const h=getHistory();h.unshift({q:question,date:new Date().toISOString(),mode:data.mode,people:participants.map(id=>A.find(a=>a[0]===id)?.[1]||id),items:data.transcript||[],judge:data.judge?.text||""});
    localStorage.setItem("afc-history",JSON.stringify(h.slice(0,50)));
  }catch(error){
    $("#status").textContent="요청 실패";
    $("#rounds").innerHTML='<article class="response"><h4>서버 오류</h4><p>'+safe(error.message)+'</p><p>터미널에서 npm run dev가 실행 중인지 확인하고 다시 시도해 주세요.</p></article>';
    $("#progress").style.width="0";
  }finally{
    $("#start").disabled=false;$("#start").textContent="토론 시작 →";
  }
}
$("#start").onclick=start;
$("#newDebate").onclick=()=>{view("debate");$("#question").value="";$("#debatePanel").hidden=true;$("#progress").style.width="0"};
$("#selectAll").onclick=()=>{chosen=chosen.size===A.length?new Set():new Set(A.map(x=>x[0]));drawAI()};
$$(".nav").forEach(b=>b.onclick=()=>view(b.dataset.view));
$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
function applyTheme(){document.body.classList.toggle("light",settings.theme==="light");$("#themeChoice").value=settings.theme;$("#roundChoice").value=settings.rounds;localStorage.setItem("afc-settings",JSON.stringify(settings))}
$("#theme").onclick=()=>{settings.theme=settings.theme==="dark"?"light":"dark";applyTheme()};
$("#themeChoice").onchange=e=>{settings.theme=e.target.value;applyTheme()};
$("#roundChoice").onchange=e=>{settings.rounds=e.target.value;applyTheme()};
$("#backup").onclick=()=>{const blob=new Blob([JSON.stringify(getHistory(),null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="afc-backup.json";a.click();URL.revokeObjectURL(a.href)};
$("#clear").onclick=()=>{if(confirm("저장된 토론 기록을 모두 삭제할까요?")){localStorage.removeItem("afc-history");drawHistory()}};
drawAI();applyTheme();refreshHealth();
