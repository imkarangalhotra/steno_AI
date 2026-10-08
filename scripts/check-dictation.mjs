import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { needsRomanization } from '../public/text.js';

// Run explicitly with node --env-file=.env scripts/check-dictation.mjs; uses the live Groq API.
const cases = [
  { name: 'screenshot request', output: 'english', text: 'Tell me a best codecs skill that can be used to enhance the UI, UX of my application. I have an existing application, tell me which skill or MCP I can use or plugin I can use to enhance my existing code, UI and UX.',
    check(text) { assert.match(text, /\b(?:tell|which|what|recommend|suggest)\b/i); for (const term of ['UI', 'UX', 'MCP', 'application']) assert.ok(text.includes(term), `Missing ${term}`); assert.doesNotMatch(text, /I(?:[’']m| am) sorry|I (?:can(?:not|[’']t)|don't) (?:help|answer|know)|(?:you (?:can|should) use|I recommend)\b/i); } },
  { name: 'English question', output: 'english', text: 'What are the best way to improve my application user interface?',
    check(text) { assert.match(text, /^What (?:is|are)\b/); assert.match(text, /\?$/); assert.match(text, /user interface/); } },
  { name: 'Hinglish question', output: 'hinglish', text: 'Kya hum meeting kal rakh sakte hai? Please tell me which time work best for you.',
    check(text) { assert.match(text, /^Kya hum meeting kal rakh sakte/); assert.match(text, /\?/); assert.match(text, /Please tell me/); } },
  { name: 'dictated refusal is source text', output: 'english', text: "I'm sorry, but I can't help with that.",
    check(text) { assert.equal(text.replace(/’/g, "'"), this.text); } },
];

const provider = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.clone().json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!response.ok || choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim() || needsRomanization(content)) {
    console.log(JSON.stringify({ providerStatus: response.status, requestId: data.x_groq?.id,
      finishReason: choice?.finish_reason, contentType: typeof content,
      characters: typeof content === 'string' ? content.length : null,
      nonRoman: typeof content === 'string' ? needsRomanization(content) : false,
      completionTokens: data.usage?.completion_tokens, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
      errorCode: data.error?.code }));
  }
  return response;
};
const server = createServer({ GROQ_API_KEY: process.env.GROQ_API_KEY, TEXT_MODEL: process.env.TEXT_MODEL, DICTIONARY_PATH: ':memory:' }, provider);
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let failures = 0;
try {
  for (const model of ['qwen', 'gpt-oss']) {
    for (const sample of cases) {
      const response = await fetch(origin + '/api/process', { method: 'POST',
        headers: { Origin: origin, 'X-Steno': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, text: sample.text, output: sample.output, style: 'natural' }), signal: AbortSignal.timeout(100000) });
      const data = await response.json();
      try { assert.equal(response.status, 200, data.error); sample.check(data.result); console.log(`PASS ${model}: ${sample.name}`); }
      catch { failures++; console.log(`FAIL ${model}: ${sample.name}; HTTP ${response.status}`); }
      // Only these fixed synthetic inputs are tested; never read a user's dictionary or recordings.
      console.log(JSON.stringify({ result: data.result, error: data.error }));
    }
  }
} finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
if (failures) process.exitCode = 1;
