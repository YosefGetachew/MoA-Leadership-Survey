const test = require('node:test');
const assert = require('node:assert/strict');
const sections = require('../../frontend/src/levelSurveyQuestions.json');
const { validateSubmission, SURVEY_VERSION, EVALUATOR_LEVELS } = require('../survey-validation');
const { createMockDb } = require('./mock-db.cjs');
const codes = sections.flatMap(section => section.questions.map(question => question.code));
const payload = () => ({
  surveyVersion: SURVEY_VERSION, evaluatorLevel: 'expert',
  sex: "female", age: 35, workExperience: 10,
  responses: Object.fromEntries(sections.flatMap(section => section.questions.map(question => [question.code,4]))),
});

test('all four respondent categories must submit the same 69 statements', () => {
  for (const level of EVALUATOR_LEVELS) {
    const input = payload(); input.evaluatorLevel = level;
    const result = validateSubmission(input, codes);
    assert.equal(result.answeredCount,69);
    assert.equal(Object.keys(result.responses).length,69);
    assert.equal(result.evaluatorLevel,level);
  }
});
test('reject incomplete sections, demographics, invalid respondent categories and old clients', () => {
  for (const code of ['HL01','ML01','LL01']) {
    const input=payload(); delete input.responses[code];
    assert.throws(()=>validateSubmission(input, codes), /complete Senior/);
  }
  for (const field of ['sex', 'age', 'workExperience']) { const input=payload(); delete input[field]; assert.throws(()=>validateSubmission(input, codes)); }
  for (const level of ['', 'high_level', 'invalid']) assert.throws(()=>validateSubmission({...payload(),evaluatorLevel:level}, codes), /your leadership level/);
  assert.throws(()=>validateSubmission({...payload(),surveyVersion:'old'}, codes), /survey has changed/);
});
test('strict ratings, valid N/A, no targets or work information persisted', () => {
  for (const value of [0,7,1.5,null,true,'4']) {
    const input=payload();input.responses.HL01=value;
    assert.throws(()=>validateSubmission(input, codes));
  }
  const input=payload(); input.responses.HL01=6; input.responses.ML01=6;
  input.evaluatorName='Do not store';input.evaluatorContact='do-not-store@example.invalid';
  input.evaluatorOrganization='Do not store';input.evaluatorPosition='Do not store';input.assessmentTargets={};input.overallResponses={OR01:4};
  const normalized=validateSubmission(input, codes);
  assert.equal(normalized.naCount,2);
  assert.equal('evaluatorName' in normalized,false);
  assert.equal('evaluatorContact' in normalized,false);
  for(const field of ['evaluatorOrganization','evaluatorPosition','assessmentTargets','overallResponses']) assert.equal(field in normalized,false);
  input.responses.UNKNOWN=4;assert.throws(()=>validateSubmission(input, codes),/unknown questions/);
  for (const info of [{sex:'other'},{sex:''},{age:17},{age:101},{age:35.5},{age:'35'},{age:null},{workExperience:-1},{workExperience:36},{workExperience:1.5},{workExperience:''},{workExperience:null}]) assert.throws(()=>validateSubmission({...payload(),...info}, codes));
  assert.equal(validateSubmission({...payload(),workExperience:0}, codes).workExperience,0);

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
  const publicQuestions=await (await fetch(url+'/api/survey/questions')).json();
  assert.equal(publicQuestions.sections.length,3);assert.equal(publicQuestions.sections.flatMap(section=>section.questions).length,69);
  assert.ok(publicQuestions.sections[0].questions[0].textAm);
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
  const managed=await (await fetch(url+'/api/admin/questions',{headers:{Cookie:adminCookie}})).json();
  assert.equal(managed.sections.flatMap(section=>section.questions).length,69);
  const original=managed.sections[0].questions[0];
  const edited=await fetch(url+'/api/admin/questions/HL01',{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({leadershipLevel:'lower_level',textEn:'Edited English wording',textAm:'የተሻሻለ የአማርኛ ጽሑፍ',dimension:'Changed dimension',sortOrder:9999,active:false})});
  assert.equal(edited.status,200);
  const refreshed=await (await fetch(url+'/api/survey/questions')).json();
  const editedQuestion=refreshed.sections.flatMap(section=>section.questions.map(question=>({...question,leadershipLevel:section.level}))).find(question=>question.code==='HL01');
  assert.equal(editedQuestion.text,'Edited English wording');
  assert.equal(editedQuestion.textAm,'የተሻሻለ የአማርኛ ጽሑፍ');
  assert.equal(editedQuestion.leadershipLevel,'high_level');
  assert.equal(editedQuestion.sortOrder,original.sortOrder);
  assert.equal(editedQuestion.dimension,original.dimension);
  assert.equal(editedQuestion.active,true);
  const added=await fetch(url+'/api/admin/questions',{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({code:'HL99',leadershipLevel:'high_level',textEn:'New English question',textAm:'አዲስ የአማርኛ ጥያቄ',sortOrder:999,active:true})});
  assert.equal(added.status,201);
  assert.equal((await fetch(url+'/api/admin/questions',{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({code:'HL99',leadershipLevel:'high_level',textEn:'Duplicate',textAm:'ድጋሚ',sortOrder:999,active:true})})).status,409);
  const withNewQuestion=await (await fetch(url+'/api/survey/questions')).json();
  assert.equal(withNewQuestion.sections.flatMap(section=>section.questions).length,70);

  const catalogue=await (await fetch(url+'/api/admin/surveys',{headers:{Cookie:adminCookie}})).json();
  assert.equal(catalogue.surveys.length,1);assert.equal(catalogue.surveys[0].published,true);
  const createdResponse=await fetch(url+'/api/admin/surveys',{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({nameEn:'Second Named Survey',nameAm:'ሁለተኛ ዳሰሳ',copyQuestionsFromId:'1'})});
  assert.equal(createdResponse.status,201);
  const created=(await createdResponse.json()).survey;
  assert.equal(created.nameEn,'Second Named Survey');assert.equal(created.published,false);assert.equal(created.questionCount,70);
  const copied=await (await fetch(url+`/api/admin/questions?surveyId=${created.id}`,{headers:{Cookie:adminCookie}})).json();
  assert.equal(copied.sections.flatMap(section=>section.questions).length,70);
  const changedCopy=await fetch(url+'/api/admin/questions/HL01',{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({surveyId:created.id,leadershipLevel:'high_level',textEn:'Second survey wording',textAm:'የሁለተኛው ዳሰሳ ጥያቄ',dimension:'Vision',sortOrder:10,active:true})});
  assert.equal(changedCopy.status,200);
  assert.equal((await (await fetch(url+'/api/survey/questions')).json()).sections[0].questions[0].text,'Edited English wording');
  assert.equal((await fetch(url+`/api/admin/surveys/${created.id}/publish`,{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:'{}'})).status,409);
  const closed=await fetch(url+'/api/admin/survey-window',{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'off',revision:opened.revision})});
  assert.equal(closed.status,200);
  const published=await fetch(url+`/api/admin/surveys/${created.id}/publish`,{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:'{}'});
  assert.equal(published.status,200);
  const currentQuestions=await (await fetch(url+'/api/survey/questions')).json();
  assert.equal(currentQuestions.survey.nameEn,'Second Named Survey');assert.equal(currentQuestions.sections[0].questions[0].text,'Second survey wording');
  const currentStatus=await (await fetch(url+'/api/survey/status')).json();
  assert.equal(currentStatus.availability.survey.id,created.id);assert.equal(currentStatus.availability.isOpen,false);
  const settingsCatalogue=await (await fetch(url+'/api/admin/surveys',{headers:{Cookie:adminCookie}})).json();
  const selectedSettings=settingsCatalogue.surveys.find(survey=>survey.id===created.id);
  assert.match(selectedSettings.settings.descriptionEn,/Assess Senior, Middle and Lower Leadership/);
  assert.match(selectedSettings.settings.descriptionAm,/የግብርና ሚኒስቴርን/);
  assert.match(selectedSettings.settings.instructionsEn,/All evaluators/);
  assert.match(selectedSettings.settings.instructionsAm,/ሁሉም ገምጋሚዎች/);
  selectedSettings.settings.descriptionEn='A custom public introduction.';
  selectedSettings.settings.categories.high_level.titleEn='Executive Tier';
  selectedSettings.settings.categories.high_level.titleAm='የሥራ አስፈጻሚ ደረጃ';
  const settingsSaved=await fetch(url+`/api/admin/surveys/${created.id}`,{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({nameEn:'Renamed Survey',nameAm:'የተሰየመ ዳሰሳ',settings:selectedSettings.settings})});
  assert.equal(settingsSaved.status,200);
  const configuredQuestions=await (await fetch(url+'/api/survey/questions')).json();
  assert.equal(configuredQuestions.survey.nameEn,'Renamed Survey');assert.equal(configuredQuestions.sections[0].title,'Executive Tier');assert.equal(configuredQuestions.sections[0].titleAm,'የሥራ አስፈጻሚ ደረጃ');
  const oldResults=await (await fetch(url+'/api/admin/survey-results?surveyId=1',{headers:{Cookie:adminCookie}})).json();
  const newResults=await (await fetch(url+`/api/admin/survey-results?surveyId=${created.id}`,{headers:{Cookie:adminCookie}})).json();
  assert.equal(oldResults.summary.totalResponses,1);assert.equal(newResults.summary.totalResponses,0);
});
