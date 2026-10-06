# Steno

Browser-first English/Hinglish voice writing. No client installation, local model, extension, or local server is required for the hosted app. Hindi is always written in Latin letters. Record a complete passage, refine or translate it, then copy and paste anywhere.

## Development

Node.js 22+; no runtime dependencies and no npm install step.

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

Configure `/healthz` for health checks. The host/reverse proxy must provide HTTPS, preserve the request Host, allow audio uploads up to 24 MB, and allow processing requests lasting up to 285 seconds. Generate the hostname first, then set `PUBLIC_ORIGIN` and redeploy. No persistent disk is required. No credentials are baked into the container. Browser login username defaults to `steno`; set `APP_USERNAME` to change it. Set `APP_PASSWORD` to change the password. Save the variables and redeploy for changes to take effect. The ordinary /login page works without a browser authentication pop-up or developer tools. A signed HttpOnly cookie remembers this browser for 90 days; changing either credential invalidates its sessions. Hosted cookies are Secure. Clearing cookies or resetting a VDI browser profile requires another sign-in. Failed login attempts are limited to five per minute per process. Login pages and API responses are never cached. Binding beyond loopback is refused without a password and HTTPS origin.

This is a long-running Node service, not a static-only site. Netlify requires a serverless backend adaptation and checking upload/time limits; the current deployment target is a Node/Docker host. No provider account or deployment has been created yet.

The app limits inference to 12 requests/minute and 2 concurrent requests per process. For this personal app, use one instance. A shared rate limiter is needed before multiple replicas or users. Same-origin checks supplement authentication; they do not replace it. Provider timeouts/errors are shown without forwarding sensitive provider responses. The provider key never reaches the client.

## Behavior and limitations

- Output: English, Hinglish, or keep the original language mixture. Mixed Hindi/English input preserves the language of each phrase in Hinglish and keep-language modes. Style: natural or literary. Spoken language defaults to Hindi/Hinglish; English and Auto-detect remain available.
- Default shortcut: Alt + Shift + R while the Steno page has keyboard focus (including text fields). Change shortcut accepts a letter/number, Space or Enter with Ctrl, Alt or Meta; Escape cancels and Reset restores the default. Common browser/editing combinations are rejected with an explanation; OS-reserved shortcuts may never reach the page. Capture attempts are logged only in the browser console during shortcut setup (no typing outside setup, credentials or dictation). The preference is stored in localStorage for this browser and origin; it does not sync across devices, and clearing site data resets it. When storage is blocked, changes work only for the current visit. Held-key repeats are ignored and shortcut changes are disabled during recording/processing. This is not a system-wide shortcut; microphone permission is still required.
- Transcription and editing use the original recognition output internally. A separate normalization step converts Devanagari or Urdu-script recognizer output into Latin letters. Both displayed fields reject these scripts before returning to the browser.
- Pasting Devanagari triggers Romanization before display. Direct Devanagari input is refused; Latin Hindi typing is supported.
- Recording stops at five minutes or approximately 23 MB. Without a mini recorder, keep the page foregrounded; switching away stops and discards the interrupted recording without sending it.
- Open mini recorder uses Document Picture-in-Picture in supporting desktop browsers. It contains a full button with a mic icon and Say it loud/Stop recording label, requests a compact 200 by 64 pixel content area (the browser enforces its own minimum size), shows Processing while busy, and automatically copies results when enabled. Outputs, errors, retry and manual Copy remain on the main page. The compact window has no app scrolling; its browser-controlled origin/title bar and minimum size cannot be removed. Keep the main tab open; switching to another app while the mini window is open no longer discards recording. Drag it yourself between monitors. Closing it stops and processes active audio; closing the main tab ends the session. The same saved shortcut works when either Steno window has focus, not while another app is focused. The control is hidden when the API is unavailable. Clipboard access uses the focused Steno window. Mobile/unsupported browsers keep the ordinary-page workflow.
- Failed requests preserve the latest complete recording and existing text in page memory for retry. Closing/reloading the page clears them. The app stores no dictation history and logs no content. Groq processing/retention policies still apply.
- Auto-copy is attempted only after a validated result. Permissions may require a fresh click on Copy text. Manual selection remains available. A PWA cannot paste into other apps itself.
- Service worker caches only UI assets. Offline recording/editor access may work, but inference needs internet. A home-screen shortcut is optional.
- Test on the actual managed Chrome/Edge browser, Android Chrome, and iPhone Safari. Permission restrictions, background recording, and mobile audio formats vary. Office policy must permit microphone and hosted processing.

## Live provider checks

With the key in `.env`, run `node --env-file=.env scripts/check-provider.mjs --inference` to check model access without printing credentials. Run `node --env-file=.env scripts/check-live.mjs` for synthetic text examples. An optional WAV/FLAC file path adds an audio check; the included assertions expect the documented Friday-meeting WAV or the public Whisper JFK FLAC fixture. Reports go to `live-checks.md`; do not use private recordings for a committed report.

On October 2, 2026, seven text cases and one public English audio fixture passed against live Groq models. This exposed and corrected language drift in keep-language/literary Hinglish modes and an inferred gender in an ambiguous Hindi literary passage. The initial project-model permission block was resolved in the user's Groq settings. Steno now reports that block clearly if it recurs. See `live-checks.md` for sample results. These sample checks do not establish general translation quality or personal speech accuracy.

## Remaining acceptance work

Use the cases in `implementation plan.md` plus personal recordings covering names, numbers, negation, code switching, corrections, idioms and literary imagery. Check fidelity, readable Roman Hindi, latency and clipboard behavior. The key and live provider baseline are now verified. Hosted/device checks require an HTTPS deployment and the actual devices. No device compatibility claim is made from the local checks alone.

Current checks: five automated tests pass (language boundaries, HTTP/provider pipeline, missing-key/size rejection, and browser-controller behavior with simulated microphone/clipboard). All application assets and `/healthz` were served successfully. Visual browser QA was unavailable in this development session; Docker was not installed, so the container has not been built here. These are pending checks, not completed acceptance tests.
