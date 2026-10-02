import { needsRomanization, safeText } from './text.js';
const $ = (id) => document.getElementById(id);
let recorder, stream, timer, recording, busy = false, pendingMic = false;
let discard = false;
let miniWindow = null, openingMini = false;
function syncMini() {
  if (!miniWindow || miniWindow.closed) return;
  const mini = (id) => miniWindow.document.getElementById(id);
  mini('mini-label').textContent = pendingMic ? 'Starting…' : busy ? 'Processing…' : recorder?.state === 'recording' ? 'Stop recording' : 'Start recording';
  mini('mini-record').disabled = $('record').disabled;
  mini('mini-record').classList.toggle('recording', recorder?.state === 'recording');
  mini('mini-record').setAttribute('aria-keyshortcuts', $('record').getAttribute('aria-keyshortcuts'));
  mini('mini-record').title = $('status').textContent;
}
async function openMini() {
  if (miniWindow && !miniWindow.closed) { miniWindow.focus(); return; }
  if (openingMini) return;
  if (!window.documentPictureInPicture?.requestWindow) return message('Your browser does not support a floating mini recorder. Use the main page instead.', true);
  openingMini = true; $('open-mini').disabled = true;
  try {
    const floating = await window.documentPictureInPicture.requestWindow({ width: 200, height: 64, preferInitialWindowPlacement: true, disallowReturnToOpener: true });
    floating.document.title = 'Steno mini recorder';
    const stylesheet = floating.document.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = window.location.origin + '/style.css';
    floating.document.head.append(stylesheet);
    floating.document.body.className = 'mini-body';
    // Only static markup goes into HTML. Model output is assigned as text/value below.
    floating.document.body.innerHTML = '<button id="mini-record" type="button" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg><span id="mini-label">Start recording</span></button>';
    miniWindow = floating;
    const mini = (id) => floating.document.getElementById(id);
    mini('mini-record').onclick = toggle;
    floating.document.addEventListener('keydown', handleShortcut);
    floating.addEventListener('pagehide', () => {
      if (miniWindow !== floating) return;
      miniWindow = null;
      $('open-mini').textContent = '↗ Open mini recorder';
      if (pendingMic && document.hidden) discard = true;
      // Keep the completed audio rather than silently discarding it when the island closes.
      stop();
    }, { once: true });
    $('open-mini').textContent = '↗ Focus mini recorder';
    syncMini();
  } catch {
    message('Could not open the mini recorder. Check browser permissions, or use the main page.', true);
  } finally { openingMini = false; $('open-mini').disabled = false; }
}
const defaultShortcut = { code: 'KeyR', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false };
const modifiers = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];
const supportedKey = (code) => /^(Key[A-Z]|Digit[0-9]|Space|Enter)$/.test(code);
function shortcutError(value) {
  if (!value || !supportedKey(value.code) || !modifiers.every((key) => typeof value[key] === 'boolean')) return 'Choose a letter, number, Space or Enter.';
  if (!value.ctrlKey && !value.altKey && !value.metaKey) return 'Hold Ctrl, Alt or Meta along with your shortcut key.';
  if ((value.ctrlKey || value.metaKey) && !value.altKey && !value.shiftKey && /^(Key[A-Z]|Enter)$/.test(value.code)) return 'That combination overlaps common browser or editing controls. Add Shift or Alt, or try Ctrl + Space.';
  if ((value.ctrlKey || value.metaKey) && !value.altKey && value.shiftKey && /^(Key[BCIJMNPRTW])$/.test(value.code)) return 'That combination is commonly reserved by browsers. Try Alt + Shift plus a letter, or Ctrl + Space.';
  return '';
}
let shortcut = defaultShortcut, choosingShortcut = false;
try {
  const saved = JSON.parse(localStorage.getItem('steno-shortcut'));
  if (!shortcutError(saved)) shortcut = saved;
} catch { /* Storage can be unavailable in managed or private browsers. */ }
function showShortcut() {
  const keys = modifiers.filter((key) => shortcut[key]).map((key) => ({ ctrlKey: 'Ctrl', altKey: 'Alt', shiftKey: 'Shift', metaKey: 'Meta' }[key]));
  keys.push(shortcut.code.replace(/^(Key|Digit)/, ''));
  $('shortcut-label').textContent = keys.join(' + ');
  $('record').setAttribute('aria-keyshortcuts', keys.join('+'));
  $('change-shortcut').textContent = choosingShortcut ? 'Cancel' : 'Change shortcut';
  syncMini();
}
function saveShortcut(value) {
  shortcut = value; choosingShortcut = false; showShortcut();
  try { localStorage.setItem('steno-shortcut', JSON.stringify(shortcut)); message('Shortcut saved for this browser.'); }
  catch { message('Shortcut changed for this visit. Browser storage is blocked, so it cannot be remembered.'); }
}
const message = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); syncMini(); };
function controls() {
  const listening = recorder?.state === 'recording';
  if ((busy || listening) && choosingShortcut) { choosingShortcut = false; showShortcut(); }
  $('record').disabled = busy;
  for (const id of ['rewrite', 'retry', 'output', 'style', 'language', 'change-shortcut', 'reset-shortcut']) $(id).disabled = busy || listening;
  $('transcript').readOnly = busy || listening;
  $('result').readOnly = busy || listening;
  $('copy').disabled = busy || listening || !$('result').value.trim();
  syncMini();
}
async function request(path, body, contentType) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': contentType, 'X-Steno': '1' }, body, signal: AbortSignal.timeout(285000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Server unavailable. Your input is retained; retry.'); }
  if (data.transcript) $('transcript').value = safeText(data.transcript);
  if (!response.ok) throw new Error(data.error || 'Processing failed. Please retry.');
  return data;
}
async function copy(automatic = false) {
  const owner = miniWindow && !miniWindow.closed && miniWindow.document.hasFocus() ? miniWindow : window;
  try {
    const text = safeText($('result').value);
    await owner.navigator.clipboard.writeText(text);
    message('Copied — ready to paste anywhere.');
  } catch {
    message(automatic ? 'Your text is ready. Tap Copy text if automatic copying is blocked.' : 'Clipboard access is blocked. Select the finished text and copy it manually.');
    if (!automatic) {
      const field = $('result');
      if (owner === miniWindow) window.focus();
      field.focus(); field.select();
    }
  }
}
async function process(audio = false) {
  if (busy) return;
  if (!audio && !$('transcript').value.trim()) return message('Record, type, or paste some words first.', true);
  busy = true; controls();
  message(audio ? 'Turning your recording into words…' : 'Refining your words…');
  try {
    const options = { output: $('output').value, style: $('style').value };
    const path = audio ? '/api/process?' + new URLSearchParams({ ...options, language: recording.language }) : '/api/process';
    const data = await request(path, audio ? recording.blob : JSON.stringify({ ...options, text: $('transcript').value }), audio ? recording.blob.type : 'application/json');
    $('result').value = safeText(data.result);
    if (audio) $('retry').hidden = true;
    message('Your text is ready.');
    if ($('autocopy').checked) await copy(true);
  } catch (error) {
    if (audio) $('retry').hidden = false;
    message(error.name === 'TimeoutError' ? 'Processing timed out. Your input is retained; retry.' : error.message, true);
  } finally { busy = false; controls(); }
}
function stop() {
  if (recorder?.state === 'recording') { busy = true; controls(); recorder.stop(); }
}
async function toggle() {
  if (recorder?.state === 'recording') return stop();
  if (busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return message('Recording requires a supported browser on HTTPS or localhost.', true);
  busy = true; pendingMic = true; controls(); discard = false;
  message('Waiting for microphone permission…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (discard) { stream.getTracks().forEach((track) => track.stop()); return; }
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = []; let size = 0, failed = false;
    const language = $('language').value;
    recorder.ondataavailable = ({ data }) => { if (data.size) { chunks.push(data); size += data.size; if (size > 23 * 1024 * 1024) stop(); } };
    recorder.onerror = () => { failed = true; stop(); message('Recording was interrupted. Please record again.', true); };
    recorder.onstop = async () => {
      clearInterval(timer); stream.getTracks().forEach((track) => track.stop());
      $('record').textContent = '● Start recording'; $('record').classList.remove('recording');
      busy = true; controls();
      try {
        if (failed || discard) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) return message('No audio was captured. Please try again.', true);
        recording = { blob, language };
        busy = false;
        await process(true);
      } finally { busy = false; controls(); }
    };
    recorder.start(1000);
    const started = Date.now(); $('timer').textContent = '00:00';
    timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      syncMini();
      if (seconds >= 300) stop();
    }, 250);
    $('record').textContent = '■ Stop recording'; $('record').classList.add('recording');
    message('Listening. Stop when you’re finished (up to 5 minutes).');
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    message(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in browser settings, or paste text below.' : 'Could not start recording. Check your microphone and permissions.', true);
  } finally { busy = false; pendingMic = false; controls(); }
}
// Reject direct Devanagari entry and normalize pasted Hindi before displaying it.
for (const id of ['transcript', 'result']) {
  const field = $(id);
  field.addEventListener('beforeinput', (event) => {
    if (event.data && needsRomanization(event.data)) { event.preventDefault(); message('Use Latin letters for Hindi, or paste a passage to Romanize it.'); }
  });
  let previous = '';
  field.addEventListener('focus', () => { previous = field.value; });
  field.addEventListener('input', () => {
    if (needsRomanization(field.value)) { field.value = previous; message('Hindi must use Latin letters. Paste a passage to Romanize it.'); }
    else previous = field.value;
    controls();
  });
  field.addEventListener('paste', async (event) => {
    const text = event.clipboardData.getData('text');
    if (!needsRomanization(text)) return;
    event.preventDefault();
    if (busy || recorder?.state === 'recording') return;
    const start = field.selectionStart, end = field.selectionEnd;
    busy = true; controls(); message('Writing your pasted Hindi in Latin letters…');
    try {
      const response = await fetch('/api/normalize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Steno': '1' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(100000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not Romanize the passage.');
      field.setRangeText(safeText(data.transcript), start, end, 'end'); previous = field.value;
      message('Pasted in Latin letters.');
    } catch (error) { message(error.message + ' Your existing text is unchanged.', true); }
    finally { busy = false; controls(); }
  });
}
$('record').onclick = toggle;
$('rewrite').onclick = () => process();
$('retry').onclick = () => { if (recording) process(true); };
$('copy').onclick = () => copy();
function handleShortcut(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (choosingShortcut) {
    if (event.code === 'Escape') { event.preventDefault(); choosingShortcut = false; showShortcut(); return message('Shortcut unchanged.'); }
    if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(event.code)) {
      return message('Modifier detected. Keep it held and press a letter, number, Space or Enter.');
    }
    event.preventDefault();
    const value = { code: event.code, ...Object.fromEntries(modifiers.map((key) => [key, Boolean(event[key])])) };
    const error = shortcutError(value);
    console.info('Steno shortcut capture', { ...value, accepted: !error, reason: error });
    if (error) return message(error, true);
    return saveShortcut(value);
  }
  if (event.code !== shortcut.code || modifiers.some((key) => Boolean(event[key]) !== shortcut[key])) return;
  event.preventDefault();
  if (!$('record').disabled) return toggle();
}
document.addEventListener('keydown', handleShortcut);
$('open-mini').onclick = openMini;
$('open-mini').hidden = !window.documentPictureInPicture?.requestWindow;
$('change-shortcut').onclick = () => {
  if ($('change-shortcut').disabled) return;
  choosingShortcut = !choosingShortcut; showShortcut();
  message(choosingShortcut ? 'Hold Ctrl, Alt or Meta, then press a letter, number, Space or Enter. Escape cancels. Browser/system shortcuts may not reach this page.' : 'Shortcut unchanged.');
};
$('reset-shortcut').onclick = () => { if (!$('reset-shortcut').disabled) saveShortcut(defaultShortcut); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !openingMini && (!miniWindow || miniWindow.closed) && (pendingMic || recorder?.state === 'recording')) {
    discard = true; stop(); stream?.getTracks().forEach((track) => track.stop());
    message('Recording stopped because the page left the foreground. Please record again.', true);
  }
});
window.addEventListener('pagehide', () => { discard = true; stop(); stream?.getTracks().forEach((track) => track.stop()); miniWindow?.close(); });
window.addEventListener('offline', () => message('You’re offline. Your current text is still here; processing needs internet.', true));
fetch('/api/status').then((res) => res.json()).then((data) => {
  $('setup').textContent = data.configured ? '' : 'Processing setup is pending. The editor and microphone are available.';
}).catch(() => { $('setup').textContent = 'Reconnect to the server to process your words.'; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
showShortcut(); controls();
