import {api} from './auth.js?v=1.16.4';
const form=document.querySelector('#requestForm');
const result=document.querySelector('#result');
const button=document.querySelector('#registerSubmit');
const dialog=document.querySelector('#registrationSuccess');
function showMessage(title,text){document.querySelector('#successTitle').textContent=title;document.querySelector('#successDescription').textContent=text;dialog.showModal();}
const successText='관리자가 확인한 뒤, 신청하신 이메일로 임시 비밀번호를 안내해 드리겠습니다. 조금만 기다려 주십시오.';
let submitting=false;
function feedback(message,error=false){
 result.textContent=message;
 result.hidden=!message;
 result.className='registration-result '+(error?'error':'success');
 result.setAttribute('role',error?'alert':'status');
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(submitting||!form.reportValidity())return;
 submitting=true;button.disabled=true;button.textContent='신청 중…';form.setAttribute('aria-busy','true');
 feedback('신청 내용을 보내고 있습니다. 잠시만 기다려 주십시오.');
 try{
  const h=await api('/healthz',{noAuth:true});
  if(h.version==='1.2.1')throw new Error('가입 기능을 준비 중입니다. 관리자가 서버 업데이트를 마치면 신청할 수 있습니다.');
  const fields=Object.fromEntries(new FormData(form));fields.consent=fields.consent==='on';
  // 이전 서버 호환: 이미 입력한 이메일만 재사용, 별도 연락처 수집 없음.
  if(['1.3.0','1.3.1'].includes(h.version))fields.contact=fields.loginId.slice(0,100);
  const out=await api('/v1/auth/register',{method:'POST',noAuth:true,body:JSON.stringify(fields)});
  if(out.ok!==true)throw new Error(out.message||'접수 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주십시오.');
  const date=out.requestedAt?new Date(new Date(out.requestedAt).getTime()+9*3600000).toISOString().slice(0,10).replaceAll('-','.'):null;
  const what=out.reapplied?'다시 신청이 접수되었습니다':'이용 신청이 접수되었습니다';
  const title=date?date+'에 '+what:what;
  feedback(title+'. '+successText);
  form.reset();
  showMessage(title,successText);
 }catch(e){
  const known={REGISTRATION_PENDING:'이미 신청하셨습니다',ALREADY_REGISTERED:'이미 가입된 이메일입니다',REGISTRATION_REVIEWED:'신청 상태를 확인해 주십시오',REGISTRATION_RATE:'잠시 후 다시 신청해 주십시오'};
  const title=known[e.code]||'신청이 접수되지 않았습니다';
  const text=known[e.code]?e.message:e.message+'\n입력하신 내용은 그대로 두었으니 잠시 후 다시 시도해 주십시오.';
  feedback(text,true);
  // 어떤 결과든 안내창으로 알려 준다(작은 글씨만으로는 놓치기 쉬움)
  showMessage(title,text);
 }finally{
  submitting=false;button.disabled=false;button.textContent='가입 신청하기';form.setAttribute('aria-busy','false');
 }
});
