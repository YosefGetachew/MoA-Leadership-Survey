const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { invitationSettings, sendInvitation, sendPasswordReset } = require('../invitation-mail');

test('invitations use the public HTTPS origin and TLS SMTP without emailing a password', async () => {
  process.env.NODE_ENV = 'production';
  process.env.APP_PUBLIC_URL = 'https://leadershipsurvey.moa.gov.et/';
  process.env.SMTP_HOST = 'mail.moa.gov.et';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_FROM = 'survey@moa.gov.et';
  process.env.SMTP_USER = 'mailer';
  process.env.SMTP_PASSWORD = 'test-only-mail-secret';
  delete process.env.FTMS_EMAIL_ENV_FILE;
  assert.equal(invitationSettings().origin, 'https://leadershipsurvey.moa.gov.et');
  const original = nodemailer.createTransport;
  let transportOptions;
  let message;
  nodemailer.createTransport = options => {
    transportOptions = options;
    return { sendMail: async sent => { message = sent; } };
  };
  try {
    await sendInvitation({ email: 'person@example.org', displayName: 'Test Person', token: 'test-one-time-token' });
    assert.equal(transportOptions.requireTLS, true);
    assert.equal(transportOptions.secure, false);
    assert.equal(message.to, 'person@example.org');
    assert.match(message.text, /https:\/\/leadershipsurvey\.moa\.gov\.et\/#admin\/invite\/test-one-time-token/);
    assert.doesNotMatch(message.text, /test-only-mail-secret/);
    await sendPasswordReset({ email: 'person@example.org', displayName: 'Test Person', token: 'reset-one-time-token' });
    assert.match(message.text, /https:\/\/leadershipsurvey\.moa\.gov\.et\/#admin\/reset\/reset-one-time-token/);
    assert.match(message.text, /1 hour/);
    assert.doesNotMatch(message.text, /test-only-mail-secret/);
    process.env.APP_PUBLIC_URL = 'http://leadershipsurvey.moa.gov.et';
    assert.throws(invitationSettings, /APP_PUBLIC_URL/);
  } finally { nodemailer.createTransport = original; }
});

test('FTMS mail settings are reused from its env file without copying credentials into survey settings', () => {
  process.env.NODE_ENV = 'development';
  process.env.APP_PUBLIC_URL = 'http://localhost:3000';
  process.env.FTMS_EMAIL_ENV_FILE = path.join(__dirname, 'fixtures', 'ftms-email.env');
  delete process.env.SMTP_HOST;
  const settings = invitationSettings();
  assert.equal(settings.source, 'ftms');
  assert.equal(settings.host, 'smtp.gmail.com');
  assert.equal(settings.port, 587);
  assert.equal(settings.auth.user, 'ftms-test@example.org');
  assert.equal(settings.auth.pass, 'fixture-only-app-password');
  assert.match(settings.from, /MoA Leadership Survey/);
  process.env.FTMS_EMAIL_ENV_FILE = 'relative-file.env';
  assert.throws(invitationSettings, /FTMS email is unavailable/);
});
