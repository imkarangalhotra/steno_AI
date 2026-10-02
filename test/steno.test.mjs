import test from 'node:test';
import assert from 'node:assert/strict';
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
  const auth = 'Basic ' + Buffer.from('my-user:test-pass').toString('base64');
  const headers = { Authorization: auth, Origin: origin, 'X-Steno': '1', 'Content-Type': 'application/json' };
  const post = (data) => fetch(origin + '/api/process', { method: 'POST', headers, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    assert.equal((await fetch(origin)).status, 401);
    assert.equal((await fetch(origin, { headers: { Authorization: 'Basic ' + Buffer.from('steno:test-pass').toString('base64') } })).status, 401);
    const page = await fetch(origin, { headers: { Authorization: auth } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.has('www-authenticate'), false);
    assert.equal((await page.text()).includes('mock-private-key'), false);
    assert.equal((await fetch(origin + '/.env', { headers: { Authorization: auth } })).status, 404);
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
