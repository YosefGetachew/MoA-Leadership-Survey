const test = require('node:test');
const assert = require('node:assert/strict');
const sections = require('../../frontend/src/levelSurveyQuestions.json');
const { validateSubmission, SURVEY_VERSION, EVALUATOR_LEVELS } = require('../survey-validation');
const { createMockDb } = require('./mock-db.cjs');
const payload = () => ({
  surveyVersion: SURVEY_VERSION, evaluatorLevel: 'expert',
  sex: "female", age: 35, workExperience: 10,
  responses: Object.fromEntries(sections.flatMap(section => section.questions.map(question => [question.code,4]))),
});

test('all four respondent categories must submit the same 69 statements', () => {
  for (const level of EVALUATOR_LEVELS) {
    const input = payload(); input.evaluatorLevel = level;
    const result = validateSubmission(input);
    assert.equal(result.answeredCount,69);
    assert.equal(Object.keys(result.responses).length,69);
    assert.equal(result.evaluatorLevel,level);
  }
});
test('reject incomplete sections, demographics, invalid respondent categories and old clients', () => {
  for (const code of ['HL01','ML01','LL01']) {
    const input=payload(); delete input.responses[code];
    assert.throws(()=>validateSubmission(input), /complete Senior/);
  }
  for (const field of ['sex', 'age', 'workExperience']) { const input=payload(); delete input[field]; assert.throws(()=>validateSubmission(input)); }
  for (const level of ['', 'high_level', 'invalid']) assert.throws(()=>validateSubmission({...payload(),evaluatorLevel:level}), /your leadership level/);
  assert.throws(()=>validateSubmission({...payload(),surveyVersion:'old'}), /survey has changed/);
});
test('strict ratings, valid N/A, no targets or work information persisted', () => {
  for (const value of [0,7,1.5,null,true,'4']) {
    const input=payload();input.responses.HL01=value;
    assert.throws(()=>validateSubmission(input));
  }
  const input=payload(); input.responses.HL01=6; input.responses.ML01=6;
  input.evaluatorName='Do not store';input.evaluatorContact='do-not-store@example.invalid';
  input.evaluatorOrganization='Do not store';input.evaluatorPosition='Do not store';input.assessmentTargets={};input.overallResponses={OR01:4};
  const normalized=validateSubmission(input);
  assert.equal(normalized.naCount,2);
  assert.equal('evaluatorName' in normalized,false);
  assert.equal('evaluatorContact' in normalized,false);
  for(const field of ['evaluatorOrganization','evaluatorPosition','assessmentTargets','overallResponses']) assert.equal(field in normalized,false);
  input.responses.UNKNOWN=4;assert.throws(()=>validateSubmission(input),/unknown questions/);
  for (const info of [{sex:'other'},{sex:''},{age:17},{age:101},{age:35.5},{age:'35'},{age:null},{workExperience:-1},{workExperience:36},{workExperience:1.5},{workExperience:''},{workExperience:null}]) assert.throws(()=>validateSubmission({...payload(),...info}));
  assert.equal(validateSubmission({...payload(),workExperience:0}).workExperience,0);

});

test('HTTP validation, single atomic write, duplicate protection, admin totals and CSV', async t => {
  process.env.NODE_ENV='test';process.env.MINISTRY_ADMIN_SESSION='isolated-test-session-secret';
  const db=createMockDb();
  const {changeWindow}=require('../survey-window');
  const opened=await changeWindow(db.query,{action:'on',revision:0,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()},'test-admin');
  require.cache[require.resolve('../config/db')]={exports:db};
  const app=require('../server');
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const initialStatus=await fetch(url+'/api/survey/status');
  const initialCookie=initialStatus.headers.get('set-cookie').split(';')[0];
  const post=(body,cookie=initialCookie)=>fetch(url+'/api/survey/responses',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({periodId:opened.period.id,...body})});
  const incomplete=payload();delete incomplete.responses.LL18;
  assert.equal((await post(incomplete)).status,400);assert.equal(db.writes,0);
  assert.equal((await post({...payload(),workExperience:-1})).status,400);assert.equal(db.writes,0);
  const result=await post({...payload(),evaluatorName:'Do not store',evaluatorContact:'Do not store'});
  assert.equal(result.status,201);assert.equal(db.writes,1);assert.equal(db.rows.length,1);
  assert.equal(db.rows[0].answeredCount,69);assert.equal(db.rows[0].leadershipLevel,'all_levels');
  assert.equal(JSON.stringify(db.rows).includes('Do not store'),false);
  const cookie=result.headers.get('set-cookie').split(';')[0];
  const status=await fetch(url+'/api/survey/status',{headers:{Cookie:cookie}});
  assert.equal((await status.json()).submitted,true);
  assert.equal((await post(payload(),cookie)).status,409);assert.equal(db.writes,1);
  const {createStaffSession}=require('../auth');
  const adminCookie='moa_reform_admin='+createStaffSession({username:'test-admin',displayName:'Test',role:'admin'});
  assert.equal((await fetch(url+'/api/admin/survey-results')).status,401);
  assert.equal((await fetch(url+'/api/admin/survey-results.csv')).status,401);
  assert.equal((await fetch(url+'/api/admin/survey-results?from=2026-02-30',{headers:{Cookie:adminCookie}})).status,400);
  const filtered=await (await fetch(url+'/api/admin/survey-results?evaluatorLevel=senior_leadership',{headers:{Cookie:adminCookie}})).json();
  assert.equal(filtered.summary.totalResponses,0);assert.equal(filtered.recentResponses.length,0);
  const results=await (await fetch(url+'/api/admin/survey-results',{headers:{Cookie:adminCookie}})).json();
  assert.equal(results.summary.totalResponses,1);
  assert.deepEqual(results.summary.levelCounts,{high_level:1,middle_level:1,lower_level:1});
  assert.equal(results.items.length,69);assert.equal(results.items.some(item=>item.code==='OR01'),false);
  assert.equal(results.recentResponses[0].sex,'female');assert.equal(results.recentResponses[0].age,35);assert.equal(results.recentResponses[0].workExperience,10);
  assert.equal(results.summary.averageScore,4);
  assert.equal(results.summary.completeRate,100);
  assert.equal(results.summary.favorableRate,100);
  assert.equal(results.levels.length,3);assert.equal(results.correlations.length,3);
  assert.equal(results.correlations[0].r,null);
  assert.equal('responses' in results.recentResponses[0],false);
  const csv=await (await fetch(url+'/api/admin/survey-results.csv',{headers:{Cookie:adminCookie}})).text();
  assert.match(csv,/Evaluator leadership level/);assert.match(csv,/Expert/);assert.match(csv,/Work experience \(years\)/);assert.match(csv,/Female/);
  assert.match(csv,/Senior Leadership 1 \(HL01\)/);assert.match(csv,/Middle Leadership 1 \(ML01\)/);assert.match(csv,/Lower Leadership 1 \(LL01\)/);
  assert.doesNotMatch(csv,/OR01|_institution|_position|Organization \/ unit|Position or job title/);
  assert.doesNotMatch(csv,/evaluator_name|evaluator_contact|Email|Full name/);
  const restart=await fetch(url+'/api/survey/restart',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({periodId:opened.period.id})});
  assert.equal(restart.status,403);assert.equal(restart.headers.get('set-cookie'),null);assert.equal(db.rows.length,1);
  assert.equal((await post(payload(),cookie)).status,409);assert.equal(db.writes,1);
  const afterRestart=await fetch(url+'/api/survey/status',{headers:{Cookie:cookie}});
  assert.equal((await afterRestart.json()).submitted,true);
});
