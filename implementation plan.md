# Steno — Implementation Plan

Status: First implementation built. Automated checks and a live provider baseline completed; personal speech quality, hosted deployment, visual layout review, and actual device validation remain pending.

## Goal

Build a personal, browser-first voice writing application with optional PWA installation. It must work from an ordinary browser tab on an office laptop without installing desktop software, browser extensions, or a local server. The same hosted application will serve mobile browsers.

Recording and the interface run on the client device. Speech recognition and language-model inference run on a provider such as Groq through a small hosted backend. Models will not run on the user device.

## Confirmed requirements

- Primary input: English, Hindi, and mixed Hinglish speech.
- All Hindi text displayed by the application must use Latin letters (Roman Hindi / Hinglish), including the source transcript and the finished result. Devanagari is not an output option in any mode.
- Preserve meaning, tone, idioms, names, numbers, negation, and clear spoken self-corrections.
- Translate naturally rather than copying source-language syntax word for word.
- Provide a literary style for passages that need imagery, rhythm, emotional tone, and intentional ambiguity preserved. Do not automatically make everyday dictation poetic.
- Automatically attempt to copy the finished result to the clipboard. Confirm success only when the browser reports success. Provide an explicit Copy button and manual-selection fallback.
- Users paste into their destination application themselves. System-wide shortcuts and automatic insertion into other applications are outside scope.
- Desktop priority: Chrome and Edge, including a managed office browser.
- Mobile priority: Chrome on Android, with Safari on iPhone also tested and supported where browser capabilities permit.
- PWA installation is optional. Ordinary browser-tab use must provide the complete workflow.

## Output and style controls

Output language and writing style are separate controls.

| Output | Behavior |
| --- | --- |
| English | Natural English from English, Hindi, or Hinglish input. |
| Hinglish | Conversational Hindi written only in Latin letters, retaining familiar English words naturally. |
| Keep my language | Preserve the spoken language mix; every Hindi word is written in Latin letters. |

| Style | Behavior |
| --- | --- |
| Clean / natural (default) | Remove accidental fillers and repetitions, correct grammar and punctuation, and preserve the speaker's voice. Translation uses natural idiomatic phrasing. |
| Literary | Preserve voice, imagery, rhythm, emotion, and ambiguity without inventing information or embellishing the source. |

Roman Hindi spelling varies. Start with readable conversational spellings and evaluate consistency on user examples. Add personal spelling preferences only when needed.

## Example acceptance cases

| Input | Output choice | Expected behavior |
| --- | --- | --- |
| Please let me know when you reach home. | Hinglish | Ghar pahunch jao toh mujhe bata dena. |
| Mujhe lagta hai humein deadline thodi extend karni chahiye. | English | I think we should extend the deadline a little. |
| Actually meeting cancel nahi, Friday pe shift kar do. | Keep my language | Meeting cancel mat karo, Friday pe shift kar do. |
| Hindi speech recognized internally in Devanagari | Any | The displayed transcript and result contain no Devanagari; Hindi words are rendered in Latin letters. |

Examples define intent, not a requirement for exact string matching. Evaluate fidelity and naturalness with the user.

## Architecture

Browser microphone -> hosted backend -> speech recognition -> source transcript normalization -> LLM editing / translation -> browser result -> clipboard attempt.

- Frontend: responsive web interface, native browser microphone recording, editable transcript, editable result, and optional PWA manifest/service worker.
- Backend: a small Node.js service validating requests and calling the provider. Keep provider keys in server environment variables, never frontend code.
- Initial speech candidate: Groq whisper-large-v3. Compare turbo only if recordings show acceptable quality.
- Initial text candidate: a multilingual instruction-following Qwen model available on Groq. The previously checked qwen/qwen3.8-27b is a preview candidate, not a permanent dependency. Recheck availability, limits, and pricing before implementation.
- Transcribe in the source language first. If the recognizer produces Devanagari internally, normalize Hindi into Latin letters before displaying it. Preserve the provider source internally during processing so translation does not depend solely on potentially ambiguous Roman spellings.
- Enforce the Latin-only Hindi requirement in backend output validation for both displayed fields. Do not silently publish Devanagari or strip characters destructively. If normalization fails, provide a retryable error.
- Inference remains hosted even when the browser runs on the user's own computer.

## User workflow

1. Open the hosted URL in a browser; optionally add it to the home screen if permitted.
2. Select output language and writing style.
3. Press Start, speak, and press Stop.
4. Transcribe, normalize the displayed transcript, and process the final text.
5. Show the editable transcript and finished result.
6. Attempt automatic clipboard copy if enabled.
7. Show Copied only on success; otherwise offer Copy and manual selection.
8. Paste into any destination app.

Also support typing or pasting a transcript for editing without recording. The same Latin-only Hindi rule applies.

## Implementation phases

### 1. Agree on layout and validate model behavior

- Review a simple screen layout before coding the interface.
- Prepare a small set of English, Hindi, and Hinglish examples, including idioms, names, numbers, negation, spoken corrections, and literary passages.
- Recheck provider models and test actual recordings once server credentials are configured.
- Assess transcription accuracy, Roman Hindi readability, preserved meaning, naturalness, and end-to-end latency.
- Select models from observed results rather than parameter count alone.

Completion: agreed interface layout and a model baseline that satisfies the language requirements.

### 2. Build the responsive browser workspace

- Start/Stop recording controls and clear recording/processing indicators.
- Output choice and separate writing-style control.
- Editable source transcript and final text.
- Accessible labels, keyboard controls within the page, readable mobile layout, and clear errors.
- Native browser recording with supported-format detection rather than assuming one audio format across platforms.

Completion: desktop and mobile UI works without installation.

### 3. Connect the backend and provider pipeline

- Protect API credentials on the server.
- Validate audio format, request size, text length, and output controls.
- Transcribe and process source material as data, not instructions to the assistant.
- Normalize Hindi in displayed transcripts and results into Latin letters and validate the requirement.
- Preserve current-session recordings for retry and source text for reprocessing when requests fail.
- Do not replace usable text with an empty or truncated model result.

Completion: real dictation and pasted-text editing work end to end, with recoverable failures.

### 4. Add clipboard behavior

- Attempt automatic copy after successful processing when enabled.
- Show accurate copy-success status.
- Provide a user-initiated Copy button and manual selection when permissions block copying.
- Copy the current edited result when the user presses Copy.

Completion: Chrome/Edge clipboard behavior verified; mobile and Safari fallback verified.

### 5. Add PWA support and secure hosting

- Add manifest, suitable icons, and optional standalone display.
- Cache only the application shell; do not cache API requests, audio, transcripts, or credentials.
- Host the frontend and backend over HTTPS.
- Protect the hosted inference endpoints with access control and request limits before public exposure.
- Keep browser-tab access fully functional when installation is unavailable or blocked.

Completion: one hosted URL works on the office laptop and phone.

### 6. Validate on target devices

- Chrome and Edge desktop: permissions, recording, processing, edits, retries, and clipboard behavior.
- Android Chrome and iPhone Safari: microphone permission, supported audio format, viewport, stop/start cycles, copy fallback, and optional home-screen behavior.
- Failure cases: denied microphone, no speech, offline state, provider timeout/rate limit, missing credentials, and malformed/truncated model output.
- Verify no Devanagari appears in displayed transcripts or results, including mixed-language input and pasted text.
- Review model output against originals for omissions, invented details, changed numbers/negation, and flattened literary imagery.

Completion: core workflow is reliable on actual devices and the managed office browser.

## Boundaries and operating assumptions

- First release records a complete passage and processes it after Stop. Continuous streaming and automatic silence detection are deferred.
- Recording is foreground-first. Do not promise reliable recording while a phone is locked or the browser is suspended.
- Internet is required for transcription and editing. Offline PWA support covers the interface only.
- Browser clipboard restrictions can require a fresh click even after Stop was clicked earlier.
- The office must permit website access, microphone use, and provider processing. A PWA does not bypass managed-browser policies.
- No native application, extension, background system-wide dictation, automatic cross-app paste, screen reading, or app-specific formatting in the first release.
- No fine-tuning, model training, vector database, or multi-agent pipeline unless evaluation demonstrates a concrete need.
- Do not persist a dictation history by default. Current-session retry data is temporary; document provider retention separately.

## Credentials and development approval

- No API key is needed for planning or the initial interface work.
- Configure GROQ_API_KEY as a server secret when testing live inference. Do not paste keys into chat or commit them.
- This project is D:\Work\Steno and is separate from Swiggy_Order_Assistant.
- The user authorized implementation on October 2, 2026. Deployment must serve other devices without a local client server. No hosting provider has been chosen; target a portable Node/Docker service first.

## Implementation checkpoint — October 2, 2026

- Built responsive recording/editing interface, English/Hinglish/keep-language outputs, separate natural/literary style, automatic clipboard attempt and fallbacks.
- Built hosted Groq pipeline, server-side Romanization/validation, retained source for editing, temporary client retries, authentication and per-process request limits.
- Added PWA shell and raster icons, Dockerfile, environment template, health endpoint, and deployment instructions.
- Automated checks cover API validation, authentication, script restrictions, preserved original source, incomplete/provider-error responses, copy success/fallback, and failed-paste preservation.
- Groq's current catalog lists whisper-large-v3 and qwen/qwen3.8-27b (preview). This is an evaluation baseline; live quality is unverified.
- Live checkpoint: the private Groq key was configured and verified. The user enabled Qwen at the project level after a permissions error. Seven synthetic text cases and a public English audio fixture now pass through the real pipeline; output drift and inferred literary gender found during these checks were corrected. Results are in live-checks.md. Personal Hindi/Hinglish recordings remain untested.
- Remaining: review the working layout with the user, test personal speech examples, choose a host and deploy over HTTPS, and validate managed Chrome/Edge plus Android/iPhone devices.
- No public deployment, hosting account, or native client installation was created.
- User-approved addition: a manually opened floating mini recorder using native Document Picture-in-Picture. It shares the existing recording session and permits desktop recording with the main tab in the background while the mini window is open. Browser support is detected; keyboard shortcuts remain scoped to Steno windows.
