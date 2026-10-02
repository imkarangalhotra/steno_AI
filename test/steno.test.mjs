import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, instructions } from '../server.mjs';
import { needsRomanization, safeText } from '../public/text.js';

test('language policy rejects Devanagari rather than deleting it', () => {
  assert.equal(needsRomanization('Mujhe meeting ka time bata dena.'), false);
  assert.equal(needsRomanization('मुझे meeting का time बता देना'), true);
  assert.equal(needsRomanization('१२३'), true);
  assert.throws(() => safeText('Hello नमस्ते'));
  assert.throws(() => safeText('  '));
  assert.match(instructions('hinglish', 'literary'), /intentional ambiguity/);
  assert.match(instructions('keep', 'natural'), /Do NOT translate Roman Hindi into English/);
  assert.match(instructions('hinglish', 'literary'), /do not return English-only sentences/);
  assert.throws(() => instructions('hindi', 'natural'));
});

test('real HTTP pipeline preserves original source, handles failures and protects inference', async () => {
  const calls = [];
  let replyText = 'Meeting cancel mat karo, Friday pe shift kar do.';
  let finish = 'stop'; let providerStatus = 200;
  const provider = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/audio/transcriptions')) return Response.json({ text: 'मीटिंग cancel नहीं, Friday पे shift कर दो।' });
    const body = JSON.parse(options.body);
    if (providerStatus === 403) return Response.json({ error: { code: 'model_permission_blocked_project', message: 'Sensitive raw provider detail' } }, { status: 403 });
    const text = body.messages[0].content.startsWith('Transliterate') ? 'Meeting cancel nahi, Friday pe shift kar do.' : replyText;
    return Response.json({ choices: [{ finish_reason: finish, message: { content: text } }] }, { status: providerStatus });
  };
  const server = createServer({ GROQ_API_KEY: 'mock-private-key', APP_USERNAME: 'my-user', APP_PASSWORD: 'test-pass' }, provider);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(origin + '/login', { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'my-user', password: 'test-pass' }) });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, Origin: origin, 'X-Steno': '1', 'Content-Type': 'application/json' };
  const post = (data) => fetch(origin + '/api/process', { method: 'POST', headers, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    const anonymous = await fetch(origin, { redirect: 'manual' });
    assert.equal(anonymous.status, 303);
    assert.equal(anonymous.headers.get('location'), '/login');
    assert.equal(anonymous.headers.has('www-authenticate'), false);
    assert.equal((await fetch(origin + '/api/status')).status, 401);
    const page = await fetch(origin, { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.has('www-authenticate'), false);
    assert.equal((await page.text()).includes('mock-private-key'), false);
    assert.equal((await fetch(origin + '/.env', { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(origin + '/api/process', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal((await post({ text: 'Hello', output: 'hindi', style: 'natural' })).status, 400);
    assert.equal((await fetch(origin + '/api/process', { method: 'POST', headers, body: '{' })).status, 400);
    assert.equal(calls.length, 0);
    const audio = await fetch(origin + '/api/process?output=keep&style=natural&language=', { method: 'POST', headers: { ...headers, 'Content-Type': 'audio/webm;codecs=opus' }, body: 'fake-audio' });
    assert.equal(audio.status, 200);
    const result = await audio.json();
    assert.equal(needsRomanization(result.transcript), false);
    assert.equal(needsRomanization(result.result), false);
    assert.equal(calls.length, 3);
    assert.match(JSON.parse(calls[2].options.body).messages[1].content, /मीटिंग/);
    assert.equal(calls[0].options.body.get('model'), 'whisper-large-v3');
    assert.equal(JSON.stringify(result).includes('mock-private-key'), false);
    replyText = 'नमस्ते';
    const rejected = await post({ text: 'Hello', output: 'hinglish', style: 'natural' });
    assert.equal(rejected.status, 502);
    const failure = await rejected.json();
    assert.equal(failure.transcript, 'Hello');
    assert.equal(JSON.stringify(failure).includes('नमस्ते'), false);
    replyText = 'Usable text'; finish = 'length';
    assert.equal((await post({ text: 'Hello', output: 'english', style: 'natural' })).status, 502);
    finish = 'stop'; providerStatus = 429;
    assert.equal((await post({ text: 'Hello', output: 'english', style: 'natural' })).status, 502);
    providerStatus = 200;
    providerStatus = 403;
    const blocked = await post({ text: 'Hello', output: 'english', style: 'natural' });
    assert.equal(blocked.status, 502);
    const blockedBody = await blocked.json();
    assert.match(blockedBody.error, /Groq project/);
    assert.equal(JSON.stringify(blockedBody).includes('Sensitive raw provider detail'), false);
    providerStatus = 200;
    for (let i = 0; i < 7; i++) await post({ text: 'Hello', output: 'english', style: 'natural' });
    assert.equal((await post({ text: 'Hello', output: 'english', style: 'natural' })).status, 429);
  } finally { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
});

test('page login sets a protected persistent session and rejects invalid credentials and cookies', async () => {
  const config = { APP_USERNAME: 'my-user', APP_PASSWORD: 'test-pass', PUBLIC_ORIGIN: 'https://steno.example' };
  let server = createServer(config);
  const start = async () => { await new Promise((done) => server.listen(0, '127.0.0.1', done)); return `http://127.0.0.1:${server.address().port}`; };
  const close = async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); };
  let origin = await start();
  const login = (username = 'my-user', password = 'test-pass', requestOrigin = config.PUBLIC_ORIGIN) => fetch(origin + '/login', {
    method: 'POST', redirect: 'manual', headers: { Origin: requestOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  });
  try {
    const page = await fetch(origin + '/login');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'same-origin');
    assert.match(await page.text(), /name="username"/);
    assert.equal((await fetch(origin + '/style.css')).status, 200);
    assert.equal((await login('my-user', 'test-pass', 'https://evil.example')).status, 403);
    assert.equal((await login('my-user', 'test-pass', 'null')).status, 403);
    assert.equal((await login('wrong')).status, 401);
    const signedIn = await login();
    assert.equal(signedIn.status, 303);
    const header = signedIn.headers.get('set-cookie');
    assert.match(header, /^__Host-steno-session=/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=7776000']) assert.ok(header.includes(flag));
    assert.equal(header.includes('test-pass'), false);
    const cookie = header.split(';')[0];
    assert.equal((await fetch(origin + '/api/status', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(origin + '/api/status', { headers: { Cookie: cookie + '0' } })).status, 401);
    const expires = Date.now() - 1000;
    const expired = `__Host-steno-session=${expires}.${createHmac('sha256', 'test-pass').update(`my-user:${expires}`).digest('hex')}`;
    assert.equal((await fetch(origin + '/api/status', { headers: { Cookie: expired } })).status, 401);
    await close(); server = createServer(config); origin = await start();
    assert.equal((await fetch(origin + '/api/status', { headers: { Cookie: cookie } })).status, 200);
    await close(); server = createServer({ ...config, APP_PASSWORD: 'new-pass' }); origin = await start();
    assert.equal((await fetch(origin + '/api/status', { headers: { Cookie: cookie } })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login()).status, 401);
    assert.equal((await login('my-user', 'new-pass')).status, 429);
  } finally { await close(); }
});

test('missing key and oversized requests fail without calling provider', async () => {
  const server = createServer({}, () => { throw new Error('Must not call provider'); });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: origin, 'X-Steno': '1', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(origin + '/api/process', { method: 'POST', headers, body: JSON.stringify({ text: 'Hello', output: 'keep', style: 'natural' }) })).status, 503);
    assert.equal((await fetch(origin + '/api/process', { method: 'POST', headers, body: JSON.stringify({ text: 'a'.repeat(150001) }) })).status, 413);
  } finally { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
});
