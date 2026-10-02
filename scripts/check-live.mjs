import { createServer } from '../server.mjs';
import { safeText } from '../public/text.js';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (!process.env.GROQ_API_KEY) throw new Error('Configure GROQ_API_KEY before live checks.');
const cases = [
  { name: 'English to Hinglish', text: 'Please let me know when you reach home.', output: 'hinglish', style: 'natural', includes: /ghar/i },
  { name: 'Hindi to English', text: 'मुझे लगता है हमें deadline थोड़ी extend करनी चाहिए।', output: 'english', style: 'natural' },
  { name: 'Mixed language spoken correction', text: 'Actually meeting cancel nahi, Friday pe shift kar do.', output: 'keep', style: 'natural', includes: /cancel\s+(mat|nahi|nahin)/i },
  { name: 'Names, numbers and negation', text: 'Please do not cancel Aarav\'s meeting on Friday at 3 PM. Invite only 12 people, not 20.', output: 'english', style: 'natural', includes: /Aarav/i },
  { name: 'Literary Hindi to English', text: 'रात की खामोशी में उसकी याद एक धीमे जलते दीये की तरह मेरे भीतर चमकती रही।', output: 'english', style: 'literary', excludes: /\b(him|her|his)\b/i },
  { name: 'Literary English to Hinglish', text: 'The evening held its breath as she waited by the window.', output: 'hinglish', style: 'literary', includes: /khidki/i },
  { name: 'Unseen literary English to Hinglish', text: 'Rain tapped softly on the roof while the city lights blurred into the night.', output: 'hinglish', style: 'literary', includes: /baarish|barish/i },
];
const server = createServer({ ...process.env, PUBLIC_ORIGIN: '' });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const headers = { Origin: origin, 'X-Steno': '1' };
if (process.env.APP_PASSWORD) headers.Authorization = 'Basic ' + Buffer.from(`steno:${process.env.APP_PASSWORD}`).toString('base64');
const report = ['# Live provider checks', '', `Run: ${new Date().toISOString()}`, '', `Text model: ${process.env.TEXT_MODEL || 'qwen/qwen3.8-27b'}`, '', 'Synthetic examples only. These checks do not establish accuracy on the user’s speech or actual devices.', ''];
let failed = false;
async function check(name, path, body, type, includes, excludes) {
  const start = Date.now();
  const response = await fetch(origin + path, { method: 'POST', headers: { ...headers, 'Content-Type': type }, body, signal: AbortSignal.timeout(285000) });
  const data = await response.json();
  if (!response.ok) {
    console.log(`${name}: FAIL (HTTP ${response.status}) — ${data.error}`);
    report.push(`## ${name}`, '', `Failed: HTTP ${response.status}. ${data.error}`, ''); failed = true; return;
  }
  safeText(data.transcript); safeText(data.result);
  if (includes) assert.match(data.result, includes);
  if (excludes) assert.doesNotMatch(data.result, excludes);
  const seconds = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`${name}: PASS (${seconds}s) — ${data.result}`);
  report.push(`## ${name}`, '', `Time: ${seconds}s`, '', `Transcript: ${data.transcript}`, '', `Result: ${data.result}`, '');
}
try {
  for (const item of cases) await check(item.name, '/api/process', JSON.stringify(item), 'application/json', item.includes, item.excludes);
  if (process.argv[2]) {
    const flac = process.argv[2].endsWith('.flac');
    await check(flac ? 'Public English audio fixture through Whisper and Qwen' : 'Synthetic English audio through Whisper and Qwen', '/api/process?output=hinglish&style=natural&language=en', await readFile(process.argv[2]), flac ? 'audio/flac' : 'audio/wav', flac ? /desh|country/i : /Friday/i);
  }
  await writeFile(new URL('../live-checks.md', import.meta.url), report.join('\n'));
  if (failed) process.exitCode = 1;
} finally {
  server.closeAllConnections(); await new Promise((done) => server.close(done));
}
