import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const moduleSource=fs.readFileSync(new URL('../approval-email.js',import.meta.url),'utf8');
const {approvalMailto}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
const source=fs.readFileSync(new URL('../admin.js',import.meta.url),'utf8');
function setup(email='tester+mail@example.test',navigateError=false){
 const nodes={};let html='',finish,removed=false,navigations=[];
 const $=id=>nodes[id]??={value:'',type:'password',textContent:'',replaceChildren(){removed=true;}};
 const location={};Object.defineProperty(location,'href',{set(v){if(navigateError)throw Error('blocked');navigations.push(v);}});
 const context={$,esc:s=>s,approvalMailto,window:{location,GOFISHING_PUBLIC_URL:'https://jaegyunkim.github.io/frontend-go-fishing/'},dialog:s=>{html=s;return new Promise(r=>finish=r);}};
 vm.runInNewContext(source.slice(source.indexOf('const showSecret ='),source.indexOf('// ---- AI 연결'))+'\nglobalThis.open=showSecret;',context);
 const pending=context.open('승인 완료','test-only&?#한글',email);
 return {nodes,pending,click:()=>nodes['#sendApprovalEmail'].onclick(),close:()=>finish(),html:()=>html,removed:()=>removed,navigations};
}
test('메일 수신자·친절한 제목·접속 주소·임시 비밀번호·변경 안내',()=>{
 const url=new URL(approvalMailto(' tester+mail@example.test ','test-only&?#한글'));
 assert.equal(decodeURIComponent(url.pathname),'tester+mail@example.test');
 assert.equal(url.searchParams.get('subject'),'바다낚시 출조 AI 에이전트, 가입이 승인되었습니다!');
 const body=url.searchParams.get('body');assert.ok(body.includes('https://jaegyunkim.github.io/frontend-go-fishing/'));assert.ok(body.includes('임시 비밀번호: test-only&?#한글'));assert.ok(body.includes('비밀번호를 꼭 변경'));assert.deepEqual([...url.searchParams.keys()],['subject','body']);
});
test('수신자 헤더·추가 수신자 주입 거부',()=>{
 for(const email of ['x@example.test?bcc=other@example.test','x@example.test\r\nBcc: a@b.test','a@b.test,c@d.test','a@b.test;c@d.test','not-email',''])assert.throws(()=>approvalMailto(email,'test-only'));
 assert.throws(()=>approvalMailto('a@b.test',''));
});
test('클릭 전 메일 URL 생성·이동 없음, 클릭 때만 메일 앱 요청, 팝업 유지',async()=>{
 const x=setup();assert.match(x.html(),/id="sendApprovalEmail" type="button"/);assert.equal(x.navigations.length,0);assert.ok(!x.html().includes('test-only'));assert.equal(x.nodes['#issuedSecret'].type,'password');
 x.click();assert.equal(x.navigations.length,1);assert.ok(x.navigations[0].startsWith('mailto:'));assert.equal(x.removed(),false);assert.match(x.nodes['#approvalMailStatus'].textContent,/직접 보내/);
 x.close();await x.pending;assert.equal(x.removed(),true);
});
test('메일 앱 호출 실패 안내에도 비밀번호·팝업 유지',async()=>{
 const x=setup(undefined,true);x.click();assert.match(x.nodes['#approvalMailStatus'].textContent,/열지 못/);assert.equal(x.nodes['#issuedSecret'].value,'test-only&?#한글');x.close();await x.pending;
});
test('계정 발급·비밀번호 초기화 팝업에는 승인 메일 버튼 없음',async()=>{
 const x=setup(null);assert.ok(!x.html().includes('sendApprovalEmail'));assert.equal(x.navigations.length,0);x.close();await x.pending;
 assert.ok(source.includes("showSecret(out.user.loginId+' 승인 완료',out.tempPassword,out.user.loginId)"));
});
