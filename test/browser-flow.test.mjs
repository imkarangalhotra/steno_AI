import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { needsRomanization, safeText } from '../public/text.js';

test('browser controller copies only successful results and preserves text on errors', async () => {
  const fields = new Map();
  for (const id of ['status', 'output', 'style', 'language', 'model', 'record', 'record-label', 'timer', 'transcript', 'result', 'rewrite', 'retry', 'autocopy', 'copy', 'setup', 'shortcut-label', 'change-shortcut', 'reset-shortcut', 'open-mini']) {
    fields.set(id, { value: '', checked: id === 'autocopy', hidden: false, events: {},
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, addEventListener(name, callback) { this.events[name] = callback; },
      focus() { this.events.focus?.(); }, select() { this.selected = true; }, setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; },
      replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ''; },
      setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); } });
  }
  fields.get('output').value = 'keep'; fields.get('style').value = 'natural'; fields.get('model').value = 'qwen';
  const copied = [], requestsMade = []; let failCopy = false, failProcess = false, failNormalize = false;
  let currentRecorder, stoppedTracks = 0;
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('audio/webm'); }
    constructor() { this.mimeType = 'audio/webm;codecs=opus'; currentRecorder = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['test audio']) }); this.finished = this.onstop(); }
  }
  const documentEvents = {};
  const stored = new Map();
  const context = { needsRomanization, safeText, URLSearchParams, AbortSignal,
    createDictionary: () => ({ refresh() {}, mountForm(root, onSaved, onCancel) { return { focus() {}, cancel: onCancel }; } }),
    console: { info() {} },
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    Blob, MediaRecorder: Recorder, setInterval: () => 1, clearInterval() {},
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() { stoppedTracks++; } }] }; } }, clipboard: { async writeText(text) { if (failCopy) throw new Error('Denied'); copied.push(text); } } },
    document: { createElement: () => ({}), getElementById: (id) => fields.get(id), addEventListener(name, callback) { documentEvents[name] = callback; } },
    window: { MediaRecorder: Recorder, location: { origin: 'http://localhost:3200' }, addEventListener() {} },
    fetch: async (path, options) => {
      requestsMade.push({ path, options });
      if (path === '/api/status') return Response.json({ configured: false, models: [{ id: 'qwen', label: 'Qwen' }, { id: 'gpt-oss', label: 'GPT-OSS 120B' }] });
      if (path === '/api/normalize') return Response.json(failNormalize ? { error: 'Unavailable' } : { transcript: 'Namaste' }, { status: failNormalize ? 502 : 200 });
      return Response.json(failProcess ? { error: 'Provider rate limit reached.', transcript: 'Original words' } : { transcript: 'Original words', result: 'Finished words' }, { status: failProcess ? 502 : 200 });
    },
  };
  context.window.navigator = context.navigator;
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '');
  vm.runInNewContext(source, context);
  const field = (id) => fields.get(id);
  field('transcript').value = 'Hello';
  field('model').value = 'gpt-oss';
  await field('rewrite').onclick();
  assert.equal(JSON.parse(requestsMade.find(request => request.path === '/api/process').options.body).model, 'gpt-oss');
  assert.equal(field('model').children[1].textContent, 'GPT-OSS 120B');
  assert.equal(field('model').value, 'gpt-oss');
  assert.equal(field('result').value, 'Finished words');
  assert.deepEqual(copied, ['Finished words']);
  assert.match(field('status').textContent, /Copied/);
  failCopy = true;
  await field('rewrite').onclick();
  assert.match(field('status').textContent, /Tap Copy/);
  await field('copy').onclick();
  assert.equal(field('result').selected, true);
  failCopy = false; failProcess = true;
  await field('rewrite').onclick();
  assert.equal(field('result').value, 'Finished words');
  assert.equal(field('transcript').value, 'Original words');
  assert.equal(copied.length, 1);
  field('result').focus();
  field('result').value = 'नमस्ते';
  field('result').events.input();
  assert.equal(field('result').value, 'Finished words');
  field('transcript').selectionStart = 0; field('transcript').selectionEnd = field('transcript').value.length;
  let prevented = false;
  const paste = { clipboardData: { getData: () => 'नमस्ते' }, preventDefault() { prevented = true; } };
  await field('transcript').events.paste(paste);
  assert.equal(prevented, true);
  assert.equal(field('transcript').value, 'Namaste');
  failNormalize = true;
  await field('transcript').events.paste(paste);
  assert.equal(field('transcript').value, 'Namaste');
  assert.match(field('status').textContent, /unchanged/);
  assert.equal(field('rewrite').disabled, false);
  failProcess = false;
  await field('record').onclick();
  assert.equal(field('record').disabled, false);
  assert.equal(field('rewrite').disabled, true);
  assert.equal(field('model').disabled, true);
  field('record').onclick();
  await currentRecorder.finished;
  assert.equal(copied.length, 2);
  assert.match(requestsMade.find(request => request.path.startsWith('/api/process?')).path, /model=gpt-oss/);
  assert.equal(field('record').disabled, false);
  assert.equal(stoppedTracks, 1);
  await field('record').onclick();
  context.document.hidden = true;
  documentEvents.visibilitychange();
  await currentRecorder.finished;
  assert.equal(copied.length, 2);
  assert.match(field('status').textContent, /foreground/);
  assert.equal(field('record').disabled, false);
  context.document.hidden = false;
  let shortcutPrevented = false;
  const shortcut = { code: 'KeyR', altKey: true, shiftKey: true, preventDefault() { shortcutPrevented = true; } };
  for (const ignored of [{ repeat: true }, { isComposing: true }, { altKey: false }]) {
    await documentEvents.keydown({ ...shortcut, ...ignored });
    assert.equal(currentRecorder.state, 'inactive');
  }
  field('record').disabled = true;
  await documentEvents.keydown(shortcut);
  assert.equal(currentRecorder.state, 'inactive');
  field('record').disabled = false;
  await documentEvents.keydown(shortcut);
  assert.equal(shortcutPrevented, true);
  assert.equal(currentRecorder.state, 'recording');
  await documentEvents.keydown({ ...shortcut, repeat: true });
  assert.equal(currentRecorder.state, 'recording');
  await documentEvents.keydown(shortcut);
  await currentRecorder.finished;
  assert.equal(currentRecorder.state, 'inactive');
  field('change-shortcut').onclick();
  await documentEvents.keydown({ code: 'KeyQ', preventDefault() {} });
  assert.equal(stored.has('steno-shortcut'), false);
  await documentEvents.keydown({ code: 'Escape', preventDefault() {} });
  assert.equal(field('shortcut-label').textContent, 'Alt + Shift + R');
  field('change-shortcut').onclick();
  const custom = { code: 'KeyG', altKey: true, shiftKey: true, preventDefault() {} };
  await documentEvents.keydown(custom);
  assert.equal(JSON.parse(stored.get('steno-shortcut')).code, 'KeyG');
  assert.equal(field('record')['aria-keyshortcuts'], 'Alt+Shift+G');
  await documentEvents.keydown(shortcut);
  assert.equal(currentRecorder.state, 'inactive');
  await documentEvents.keydown(custom);
  assert.equal(currentRecorder.state, 'recording');
  await documentEvents.keydown(custom);
  await currentRecorder.finished;
  vm.runInNewContext(source, { ...context });
  assert.equal(field('shortcut-label').textContent, 'Alt + Shift + G');
  field('change-shortcut').onclick();
  await documentEvents.keydown({ code: 'KeyC', ctrlKey: true, preventDefault() {} });
  assert.match(field('status').textContent, /overlaps/);
  await documentEvents.keydown({ code: 'ArrowUp', ctrlKey: true, preventDefault() {} });
  assert.match(field('status').textContent, /Choose a letter/);
  await documentEvents.keydown({ code: 'ControlLeft', ctrlKey: true, preventDefault() {} });
  assert.match(field('status').textContent, /Modifier detected/);
  const spaceShortcut = { code: 'Space', ctrlKey: true, preventDefault() {} };
  await documentEvents.keydown(spaceShortcut);
  assert.equal(field('shortcut-label').textContent, 'Ctrl + Space');
  vm.runInNewContext(source, { ...context });
  assert.equal(field('shortcut-label').textContent, 'Ctrl + Space');
  await documentEvents.keydown(spaceShortcut);
  assert.equal(currentRecorder.state, 'recording');
  await documentEvents.keydown(spaceShortcut);
  await currentRecorder.finished;
  field('change-shortcut').onclick();
  const altC = { code: 'KeyC', altKey: true, preventDefault() {} };
  await documentEvents.keydown(altC);
  assert.equal(field('shortcut-label').textContent, 'Alt + C');
  assert.equal(JSON.parse(stored.get('steno-shortcut')).altKey, true);
  vm.runInNewContext(source, { ...context });
  assert.equal(field('record')['aria-keyshortcuts'], 'Alt+C');
  await documentEvents.keydown(altC);
  assert.equal(currentRecorder.state, 'recording');
  await documentEvents.keydown(altC);
  await currentRecorder.finished;
  assert.equal(currentRecorder.state, 'inactive');
  field('reset-shortcut').onclick();
  assert.equal(field('shortcut-label').textContent, 'Alt + Shift + R');
  context.localStorage.getItem = () => { throw new Error('Blocked'); };
  context.localStorage.setItem = () => { throw new Error('Blocked'); };
  vm.runInNewContext(source, { ...context });
  field('change-shortcut').onclick();
  await documentEvents.keydown(custom);
  assert.match(field('status').textContent, /cannot be remembered/);
  assert.equal(field('open-mini').hidden, true);
  let requests = 0;
  const miniFields = new Map(['mini-record', 'mini-label', 'mini-teach', 'mini-status', 'mini-back', 'mini-recorder', 'mini-teaching', 'mini-form-mount'].map((id) => [id, {
    classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; }, focus() {}, select() { this.selected = true; },
  }]));
  const miniEvents = {}, miniDocumentEvents = {};
  const floating = {
    closed: false, navigator: context.navigator, focus() { this.focused = true; },
    resizeTo(width, height) { this.size = [width, height]; },
    document: { head: { append() {} }, body: { classList: { add() {}, remove() {} } }, createElement: () => ({}), getElementById: (id) => miniFields.get(id),
      hasFocus: () => true, addEventListener(name, callback) { miniDocumentEvents[name] = callback; } },
    addEventListener(name, callback) { miniEvents[name] = callback; },
    close() { this.closed = true; miniEvents.pagehide?.(); },
  };
  context.window.documentPictureInPicture = { async requestWindow(options) { requests++; assert.equal(options.width, 320); assert.equal(options.height, 110); return floating; } };
  vm.runInNewContext(source, { ...context });
  assert.equal(field('open-mini').hidden, false);
  await field('open-mini').onclick();
  assert.match(floating.document.body.innerHTML, /<svg.*aria-hidden="true"/);
  assert.match(floating.document.body.innerHTML, /id="mini-label">Say it loud/);
  assert.equal(miniFields.get('mini-label').textContent, 'Say it loud');
  await field('open-mini').onclick();
  assert.equal(requests, 1);
  assert.equal(floating.focused, true);
  miniFields.get('mini-teach').onclick();
  assert.equal(miniFields.get('mini-recorder').hidden, true);
  assert.equal(miniFields.get('mini-teaching').hidden, false);
  assert.deepEqual(floating.size, [360, 480]);
  await miniDocumentEvents.keydown(shortcut);
  assert.equal(currentRecorder.state, 'inactive');
  await miniDocumentEvents.keydown({ code: 'Escape', preventDefault() {} });
  assert.equal(miniFields.get('mini-recorder').hidden, false);
  assert.equal(miniFields.get('mini-teaching').hidden, true);
  await miniFields.get('mini-record').onclick();
  context.document.hidden = true;
  documentEvents.visibilitychange();
  assert.equal(currentRecorder.state, 'recording');
  assert.equal(miniFields.get('mini-label').textContent, 'Stop recording');
  await miniDocumentEvents.keydown(shortcut);
  await currentRecorder.finished;
  assert.equal(field('result').value, 'Finished words');
  assert.match(miniFields.get('mini-record').title, /Copied/);
  await miniFields.get('mini-record').onclick();
  floating.close();
  await currentRecorder.finished;
  assert.equal(currentRecorder.state, 'inactive');
  assert.equal(field('open-mini').textContent, '↗ Open mini recorder');
  const retained = field('result').value;
  context.window.documentPictureInPicture.requestWindow = async () => { throw new Error('Denied'); };
  await field('open-mini').onclick();
  assert.equal(field('open-mini').disabled, false);
  assert.equal(field('result').value, retained);
  assert.match(field('status').textContent, /Could not open/);
});
