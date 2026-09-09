const fail = (statusCode, message, code) => { throw Object.assign(new Error(message), { statusCode, code }); };

const DEFAULT_SURVEY_SETTINGS = {
  descriptionEn: 'Assess Senior, Middle and Lower Leadership in the Ministry of Agriculture based on your direct experience. We do not collect your name, email or phone number.',
  descriptionAm: 'በቀጥታ ባለዎት ልምድ መሠረት የግብርና ሚኒስቴርን ከፍተኛ፣ መካከለኛ እና የታችኛው ደረጃ አመራር ይገምግሙ። ስም፣ ኢሜይል ወይም ስልክ ቁጥር አንሰበስብም።',
  instructionsEn: 'All evaluators, from Senior Leadership to Expert level, will complete the same assessment.\n\nSelect your own leadership level and enter your sex, age and work experience.\n\nYour evaluation starts with Senior Leadership, continues to Middle Level Leadership, and ends with Lower Level Leadership. Complete each section before moving to the next.\n\nRate every statement from 1 to 5, or select N/A when you do not have sufficient information.',
  instructionsAm: 'ከከፍተኛ አመራር እስከ ባለሙያ ደረጃ ያሉ ሁሉም ገምጋሚዎች ተመሳሳይ የግምገማ መጠይቅ ይሞላሉ።\n\nበመጀመሪያ የራስዎን የአመራር ደረጃ ይምረጡ፣ ጾታዎን፣ ዕድሜዎን እና የሥራ ልምድዎን ያስገቡ።\n\nግምገማው በከፍተኛ አመራር ይጀምራል፣ በመካከለኛ ደረጃ እና በዝቅተኛ ደረጃ አመራር ይቀጥላል፣ በመጨረሻም በባለሙያ ግምገማ ይጠናቀቃል። ወደ ቀጣዩ ክፍል ከመሄድዎ በፊት እያንዳንዱን ክፍል ሙሉ በሙሉ ያጠናቅቁ።\n\nእያንዳንዱን የግምገማ መግለጫ ከ1 እስከ 5 ባለው መለኪያ ይመዝኑ። ስለቀረበው መግለጫ በቂ መረጃ ከሌለዎት “N/A (አይመለከተኝም/መረጃ የለኝም)” የሚለውን ይምረጡ።',
  categories: {
    high_level: { titleEn: 'Senior Leadership', titleAm: 'ከፍተኛ ደረጃ አመራር', audienceEn: 'Mministers, state ministers, directors general, commissioners, bureau heads and equivalent senior executives', audienceAm: 'ሚኒስትር፣ ዴኤታዎች፣ ዳይሬክተሮች፣ ኮሚሽነሮች፣ የቢሮ ኃላፊዎች እና እኩያ የሆኑ ከፍተኛ ኃላፊዎች' },
    middle_level: { titleEn: 'Middle Leadership', titleAm: 'መካከለኛ ደረጃ አመራር', audienceEn: 'Lead executives, executives, advisors, and project coordinators', audienceAm: 'መሪ ሥራ አስፈጻሚዎች፣ ሥራ አስፈጻሚዎች፣ አማካሪዎች እና የፕሮጀክት አስተባባሪዎች' },
    lower_level: { titleEn: 'Lower Leadership', titleAm: 'የታችኛው ደረጃ አመራር', audienceEn: 'Team leaders, Desk head', audienceAm: 'የቡድን መሪዎች፣ የዴስክ ኃላፊዎች' },
  },
};
const categoryKeys = Object.keys(DEFAULT_SURVEY_SETTINGS.categories);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function normalizeSurveySettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const categories = input.categories && typeof input.categories === 'object' ? input.categories : {};
  return {
    descriptionEn: text(input.descriptionEn, 2000) || DEFAULT_SURVEY_SETTINGS.descriptionEn,
    descriptionAm: text(input.descriptionAm, 2000) || DEFAULT_SURVEY_SETTINGS.descriptionAm,
    instructionsEn: text(input.instructionsEn, 5000) || DEFAULT_SURVEY_SETTINGS.instructionsEn,
    instructionsAm: text(input.instructionsAm, 5000) || DEFAULT_SURVEY_SETTINGS.instructionsAm,
    categories: Object.fromEntries(categoryKeys.map(key => {
      const supplied = categories[key] && typeof categories[key] === 'object' ? categories[key] : {};
      const defaults = DEFAULT_SURVEY_SETTINGS.categories[key];
      return [key, {
        titleEn: text(supplied.titleEn, 120) || defaults.titleEn,
        titleAm: text(supplied.titleAm, 120) || defaults.titleAm,
        audienceEn: text(supplied.audienceEn, 1000) || defaults.audienceEn,
        audienceAm: text(supplied.audienceAm, 1000) || defaults.audienceAm,
      }];
    })),
  };
}

const withSettings = survey => survey ? { ...survey, settings: normalizeSurveySettings(survey.settings) } : survey;

const slugify = value => String(value || '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return 1;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Select a valid survey.', 'INVALID_SURVEY');
  return id;
}

async function listSurveys(query) {
  const rows = await query(`SELECT s.id::text,name_en AS "nameEn",name_am AS "nameAm",slug,settings,published,archived,
      s.created_at AS "createdAt",s.updated_at AS "updatedAt",
      count(DISTINCT q.code)::integer AS "questionCount",count(DISTINCT r.id)::integer AS "responseCount"
    FROM surveys s
    LEFT JOIN survey_questions q ON q.survey_id=s.id AND q.active=true
    LEFT JOIN leadership_assessment_responses r ON r.survey_id=s.id
    WHERE s.archived=false
    GROUP BY s.id ORDER BY s.published DESC,s.updated_at DESC,s.id DESC`);
  return rows.map(withSettings);
}

async function getSurvey(query, value) {
  const id = normalizeId(value);
  const rows = await query(`SELECT id::text,name_en AS "nameEn",name_am AS "nameAm",slug,settings,published,archived,
      created_at AS "createdAt",updated_at AS "updatedAt" FROM surveys WHERE id=$1 AND archived=false`, [id]);
  if (!rows[0]) fail(404, 'Survey not found.', 'SURVEY_NOT_FOUND');
  return withSettings(rows[0]);
}

async function getPublishedSurvey(query) {
  const rows = await query(`SELECT id::text,name_en AS "nameEn",name_am AS "nameAm",slug,settings,published
    FROM surveys WHERE published=true AND archived=false LIMIT 1`);
  if (!rows[0]) fail(503, 'No survey has been published. Ask an administrator to publish a survey.', 'NO_PUBLISHED_SURVEY');
  return withSettings(rows[0]);
}

async function uniqueSlug(query, name) {
  const base = slugify(name) || 'survey';
  let candidate = base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const exists = await query('SELECT id FROM surveys WHERE slug=$1 LIMIT 1', [candidate]);
    if (!exists.length) return candidate;
    candidate = `${base.slice(0, Math.max(1, 69 - String(suffix).length))}-${suffix}`;
  }
  fail(409, 'A unique survey name could not be created.', 'SURVEY_NAME_CONFLICT');
}

async function createSurvey(query, body, username) {
  const nameEn = typeof body?.nameEn === 'string' ? body.nameEn.trim().slice(0, 160) : '';
  const nameAm = typeof body?.nameAm === 'string' ? body.nameAm.trim().slice(0, 160) : '';
  if (nameEn.length < 3) fail(400, 'Enter a survey name of at least 3 characters.', 'INVALID_SURVEY_NAME');
  const slug = await uniqueSlug(query, nameEn);
  const rows = await query(`INSERT INTO surveys(name_en,name_am,slug,created_by) VALUES($1,$2,$3,$4)
    RETURNING id::text,name_en AS "nameEn",name_am AS "nameAm",slug,published,archived,created_at AS "createdAt",updated_at AS "updatedAt"`,
  [nameEn, nameAm || null, slug, username]);
  const survey = rows[0];
  const copyFromId = body?.copyQuestionsFromId ? normalizeId(body.copyQuestionsFromId) : null;
  if (copyFromId) {
    await query(`UPDATE surveys target SET settings=source.settings,updated_at=now() FROM surveys source WHERE target.id=$1 AND source.id=$2`, [Number(survey.id), copyFromId]);
    await query(`INSERT INTO survey_questions(survey_id,code,leadership_level,text_en,text_am,dimension,sort_order,active,updated_by)
      SELECT $1,code,leadership_level,text_en,text_am,dimension,sort_order,active,$2
      FROM survey_questions WHERE survey_id=$3`, [Number(survey.id), username, copyFromId]);
  }
  return getSurvey(query, survey.id);
}

async function updateSurvey(query, value, body) {
  const id = normalizeId(value);
  const nameEn = text(body?.nameEn, 160);
  const nameAm = text(body?.nameAm, 160);
  if (nameEn.length < 3) fail(400, 'Enter a survey name of at least 3 characters.', 'INVALID_SURVEY_NAME');
  const settings = normalizeSurveySettings(body?.settings);
  const rows = await query(`UPDATE surveys SET name_en=$2,name_am=$3,settings=$4::jsonb,updated_at=now() WHERE id=$1 AND archived=false
    RETURNING id::text,name_en AS "nameEn",name_am AS "nameAm",slug,settings,published,archived,created_at AS "createdAt",updated_at AS "updatedAt"`,
  [id, nameEn, nameAm || null, JSON.stringify(settings)]);
  if (!rows[0]) fail(404, 'Survey not found.', 'SURVEY_NOT_FOUND');
  return withSettings(rows[0]);
}

module.exports = { DEFAULT_SURVEY_SETTINGS, normalizeSurveySettings, normalizeId, listSurveys, getSurvey, getPublishedSurvey, createSurvey, updateSurvey };
