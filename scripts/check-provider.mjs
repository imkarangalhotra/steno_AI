// Safe diagnostics: never print credentials, headers or raw provider errors.
if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is missing or empty.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.error(`Model catalog request failed (HTTP ${response.status}).`);
      process.exitCode = 1;
    } else {
      const models = (await response.json()).data.map((model) => model.id);
      console.log(JSON.stringify({ configuredModel: process.env.TEXT_MODEL || 'qwen/qwen3.8-27b',
        relevantModels: models.filter((id) => /qwen|whisper|llama|gpt-oss/.test(id)) }, null, 2));
      if (process.argv.includes('--inference')) {
        const check = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.TEXT_MODEL || 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'Reply with OK.' }], max_completion_tokens: 32 }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await check.json();
        let message = String(data.error?.message || '');
        for (const secret of [process.env.GROQ_API_KEY, process.env.APP_PASSWORD].filter(Boolean)) message = message.replaceAll(secret, '[redacted]');
        console.log(JSON.stringify({ inferenceStatus: check.status, errorCode: data.error?.code, message: message.slice(0, 1500) }, null, 2));
      }
    }
  } catch {
    console.error('Unable to reach Groq. Network access or connectivity may be restricted.');
    process.exitCode = 1;
  }
}
