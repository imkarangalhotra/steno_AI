# Steno

Browser-first English/Hinglish voice writing. No client installation, local model, extension, or local server is required for the hosted app. Hindi is always written in Latin letters. Record a complete passage, refine or translate it, then copy and paste anywhere.

## Development

Node.js 24+; no runtime dependencies and no npm install step.

```powershell
Copy-Item .env.example .env
npm start
npm test
```

Open http://localhost:3200. Put your Groq key in `.env` as `GROQ_API_KEY`; never put it in frontend code, Git, or chat. The interface works without a key; processing reports that setup is pending. Default models: `whisper-large-v3` for transcription and `qwen/qwen3.8-27b` for text. The Qwen model is currently a preview candidate; set `TEXT_MODEL` to another available model if required. Real language quality must be assessed with recordings rather than mocked tests.

Provider references checked October 2, 2026: [Groq model catalog](https://console.groq.com/docs/models) and [speech endpoint documentation](https://console.groq.com/docs/speech-to-text). Availability and prices may change.

## Deploy on Railway or another Node/Docker host

Deploy this repository as a Node service (start command `npm start`) or use the included Dockerfile (no build dependencies). Choose these environment variables in the host dashboard:

| Variable | Value |
| --- | --- |
| HOST | 0.0.0.0 |
| PORT | Host-provided port, or 3200 |
| GROQ_API_KEY | Your private provider key |
| TEXT_MODEL | Available multilingual text model; defaults to qwen/qwen3.8-27b |
| APP_USERNAME | Optional custom login username; defaults to steno |
| APP_PASSWORD | A strong private password for your personal app |
| PUBLIC_ORIGIN | Exact public HTTPS origin, e.g. https://steno.example.com, no trailing slash |

Configure `/healthz` for health checks. The host/reverse proxy must provide HTTPS, preserve the request Host, allow audio uploads up to 24 MB, and allow processing requests lasting up to 285 seconds. Generate the hostname first, then set `PUBLIC_ORIGIN` and redeploy. A persistent disk is required for the dictionary; mount it at /data for Docker, or set DICTIONARY_PATH to a durable file location. No credentials are baked into the container. Browser login username defaults to `steno`; set `APP_USERNAME` to change it. Set `APP_PASSWORD` to change the password. Save the variables and redeploy for changes to take effect. The ordinary /login page works without a browser authentication pop-up or developer tools. A signed HttpOnly cookie remembers this browser for 90 days; changing either credential invalidates its sessions. Hosted cookies are Secure. Clearing cookies or resetting a VDI browser profile requires another sign-in. Failed login attempts are limited to five per minute per process. Login pages and API responses are never cached. Binding beyond loopback is refused without a password and HTTPS origin.

This is a long-running Node service, not a static-only site. Netlify requires a serverless backend adaptation and checking upload/time limits; the current deployment target is a Node/Docker host. The production application is deployed on Railway.

The app limits inference to 12 requests/minute and 2 concurrent requests per process. For this personal app, use one instance. A shared rate limiter is needed before multiple replicas or users. Same-origin checks supplement authentication; they do not replace it. Provider timeouts/errors are shown without forwarding sensitive provider responses. The provider key never reaches the client.

## Behavior and limitations

- Output: English (default) or Hinglish in Latin letters. Mixed Hindi/English input preserves the language of each phrase in Hinglish mode. Style: natural or literary. Recording uses the English recognition setting; the Hindi and auto-detect input choices are removed. English recognition may be less accurate for Hindi-heavy Hinglish; output script and recognition accuracy are separate concerns.
- Reasoning model: Qwen (default, with its existing TEXT_MODEL configuration) or GPT-OSS 120B. Both share the same dictionary, grammar, punctuation, language and style rules. GPT-OSS uses low reasoning effort and returns only finished text. Whisper remains the speech recognizer. The floating recorder uses the main page's selected model. Switch models and use Refine text on the same transcript for direct comparisons.
- Refinement treats the transcript as quoted source text. Questions stay questions and requests stay requests; the model should edit or translate them, without answering or adding refusals. Both models receive the same editing examples and source-data boundary. Run `node --env-file=.env scripts/check-dictation.mjs` to check the screenshot regression, English/Hinglish questions and a genuinely dictated refusal against live Groq models. This optional check uses synthetic text and consumes API quota; prompts cannot guarantee perfect model behavior on every passage.
- Available models are defined in the small `models` list inside `createServer` in `server.mjs`. The authenticated status API supplies labels to the selector; request validation and processing use that same list. Add/remove entries there to change the available models without editing the recording or dictionary code.
- Default shortcut: Alt + Shift + R while the Steno page has keyboard focus (including text fields). Change shortcut accepts a letter/number, Space or Enter with Ctrl, Alt or Meta; Escape cancels and Reset restores the default. Common browser/editing combinations are rejected with an explanation; OS-reserved shortcuts may never reach the page. Capture attempts are logged only in the browser console during shortcut setup (no typing outside setup, credentials or dictation). The preference is stored in localStorage for this browser and origin; it does not sync across devices, and clearing site data resets it. When storage is blocked, changes work only for the current visit. Held-key repeats are ignored and shortcut changes are disabled during recording/processing. This is not a system-wide shortcut; microphone permission is still required.
- Transcription and editing use the original recognition output internally. A separate normalization step converts Devanagari or Urdu-script recognizer output into Latin letters. Both displayed fields reject these scripts before returning to the browser.
- Pasting Devanagari triggers Romanization before display. Direct Devanagari input is refused; Latin Hindi typing is supported.
- Recording stops at five minutes or approximately 23 MB. Without a mini recorder, keep the page foregrounded; switching away stops and discards the interrupted recording without sending it.
- Open mini recorder uses Document Picture-in-Picture in supporting desktop browsers. It contains a full button with a mic icon and Say it loud/Stop recording label, requests a compact 320 by 140 pixel recorder area and expands for Teach a word (the browser enforces its own minimum size), shows Processing while busy, and automatically copies results when enabled. Outputs, errors, retry and manual Copy remain on the main page. The compact window has no app scrolling; its browser-controlled origin/title bar and minimum size cannot be removed. Keep the main tab open; switching to another app while the mini window is open no longer discards recording. Drag it yourself between monitors. Closing it stops and processes active audio; closing the main tab ends the session. The same saved shortcut works when either Steno window has focus, not while another app is focused. The control is hidden when the API is unavailable. Clipboard access uses the focused Steno window. Mobile/unsupported browsers keep the ordinary-page workflow.
- Failed requests preserve the latest complete recording and existing text in page memory for retry. Closing/reloading the page clears them. The app stores no dictation history and logs no content. Groq processing/retention policies still apply.
- Auto-copy is attempted only after a validated result. Permissions may require a fresh click on Copy text. Manual selection remains available. A PWA cannot paste into other apps itself.
- Service worker caches only UI assets. Offline recording/editor access may work, but inference needs internet. A home-screen shortcut is optional.
- Test on the actual managed Chrome/Edge browser, Android Chrome, and iPhone Safari. Permission restrictions, background recording, and mobile audio formats vary. Office policy must permit microphone and hosted processing.

## Live provider checks

With the key in `.env`, run `node --env-file=.env scripts/check-provider.mjs --inference` to check model access without printing credentials. Run `node --env-file=.env scripts/check-live.mjs` for synthetic text examples. An optional WAV/FLAC file path adds an audio check; the included assertions expect the documented Friday-meeting WAV or the public Whisper JFK FLAC fixture. Reports go to `live-checks.md`; do not use private recordings for a committed report.

On October 2, 2026, seven text cases and one public English audio fixture passed against live Groq models. This exposed and corrected language drift in keep-language/literary Hinglish modes and an inferred gender in an ambiguous Hindi literary passage. The initial project-model permission block was resolved in the user's Groq settings. Steno now reports that block clearly if it recurs. See `live-checks.md` for sample results. These sample checks do not establish general translation quality or personal speech accuracy.

## Remaining acceptance work

Use the cases in `implementation plan.md` plus personal recordings covering names, numbers, negation, code switching, corrections, idioms and literary imagery. Check fidelity, readable Roman Hindi, latency and clipboard behavior. The key and live provider baseline are now verified. Hosted/device checks require an HTTPS deployment and the actual devices. No device compatibility claim is made from the local checks alone.

Current checks: eight automated tests pass, including dictionary persistence, account isolation, stale-edit rejection, prompt integration, and shared form save/retry/cancel behavior. Visual browser QA is unavailable in this session; Docker is not installed locally. Railway builds and hosted checks verify the deployed container; real-device layout and microphone checks remain manual.

### Personal dictionary

The main page follows dictionary design version 1; the floating recorder follows flow version 2. Add vocabulary directly, or save a misspelling and its preferred spelling. Search, edit and delete entries in the sidebar; Teach a word opens the same form in the floating recorder. Failed saves retain entered values and provide retry. Newer edits from another device are protected by a version check.

The floating recorder also has English and Hinglish output buttons beside Teach a word. Exactly one output language is active and stays synchronized with the main page. You can switch while speaking; the last choice before stopping is used for the finished text. Selection is locked while processing. Teach a word retains its existing form and behavior.

Entries live in server-side SQLite, scoped to `APP_USERNAME`, and are fetched on reload/focus. No dictionary is stored in browser storage. The current app supports one configured login; devices using that login share its dictionary. Up to 100 entries, each 80 characters, are supported. Changing the configured username selects a separate dictionary.

Node 24 provides the SQLite API without an added package. Set `DICTIONARY_PATH` to a durable file location; locally it defaults to `data/steno.sqlite`. The Docker image uses `/data/steno.sqlite`: mount a persistent volume at `/data` before deploying. The startup command initializes that directory's ownership and runs Node as the non-root node user. Keep one service replica with this volume; use a shared database if multiple replicas become necessary. See [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) and [Railway volume documentation](https://docs.railway.com/volumes).

Whisper receives a conservatively bounded vocabulary hint using recently updated preferred words. Qwen receives dictionary entries as data and applies spelling corrections only when context supports them. These are vocabulary hints, not guaranteed forced replacements or model training. Full recordings and dictation history are not retained.
