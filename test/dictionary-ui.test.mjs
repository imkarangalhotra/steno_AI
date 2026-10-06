import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Small DOM stand-in exercises the actual shared form without a browser dependency.
class Element {
  constructor() {
    this.value = ''; this.children = []; this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name), toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  click() { return this.onclick?.(); }
}
class FormRoot extends Element {
  set innerHTML(value) {
    this.markup = value;
    this.fields = new Map(['form', '[name=word]', '[name=misspelling]', '[type=submit]', '.dictionary-cancel', '.dictionary-form-status', '.misspelling-field', '.word-label', '.dictionary-help'].map(key => [key, new Element()]));
    this.tabs = ['word', 'correction'].map(mode => Object.assign(new Element(), { dataset: { mode } }));
    const form = this.fields.get('form'); form.reportValidity = () => true;
    form.reset = () => { this.fields.get('[name=word]').value = ''; this.fields.get('[name=misspelling]').value = ''; };
  }
  querySelector(key) { return this.fields.get(key); }
  querySelectorAll(key) { return key === '[data-mode]' ? this.tabs : [...this.tabs, this.fields.get('[type=submit]'), this.fields.get('.dictionary-cancel'), this.fields.get('[name=word]'), this.fields.get('[name=misspelling]')]; }
}

test('main and floating dictionary forms retain failed edits and confirm only server saves', async () => {
  const fields = new Map(['dictionary-status', 'dictionary-sync', 'dictionary-search', 'dictionary-list', 'dictionary-count', 'dictionary-refresh'].map(id => [id, new Element()]));
  const main = new FormRoot(); fields.set('dictionary-form-mount', main);
  const doc = { getElementById: id => fields.get(id), createElement: () => new Element() };
  let entries = [], failure = false, sent, resolveSave;
  const context = { AbortSignal, doc, window: { addEventListener() {}, confirm: () => true },
    fetch: async (path, options) => {
      if (options.method === 'POST') {
        sent = JSON.parse(options.body);
        if (failure) return Response.json({ error: 'Could not save. Try again.' }, { status: 503 });
        if (resolveSave === 'wait') await new Promise(resolve => { resolveSave = resolve; });
        entries = [{ id: 'test', version: 1, ...sent }];
      }
      return Response.json({ entries });
    },
  };
  const source = (await readFile(new URL('../public/dictionary-ui.js', import.meta.url), 'utf8')).replace('export function', 'function');
  vm.runInNewContext(source + '\nthis.dictionary = createDictionary(doc);', context);
  await context.dictionary.refresh();
  assert.equal(fields.get('dictionary-sync').textContent, 'Synced');
  main.querySelector('[name=word]').value = 'Steno';
  await main.querySelector('form').onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, { word: 'Steno', misspelling: '' });
  assert.equal(main.querySelector('[name=word]').value, '');
  assert.equal(fields.get('dictionary-list').children[0].children[0].children[0].textContent, 'Steno');
  const mini = new FormRoot(); let saved = '', cancelled = 0;
  const form = context.dictionary.mountForm(mini, word => { saved = word; }, () => { cancelled++; }, true);
  assert.equal(mini.querySelector('.misspelling-field').hidden, false);
  mini.querySelector('[name=misspelling]').value = 'Karen'; mini.querySelector('[name=word]').value = 'Karan';
  failure = true;
  await mini.querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(saved, '');
  assert.equal(mini.querySelector('[name=word]').value, 'Karan');
  assert.equal(mini.querySelector('[name=misspelling]').value, 'Karen');
  assert.equal(mini.querySelector('[type=submit]').textContent, 'Retry save');
  failure = false; resolveSave = 'wait';
  const saving = mini.querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(form.saving, true); form.cancel(); assert.equal(cancelled, 0);
  assert.equal(saved, ''); resolveSave(); await saving;
  assert.equal(saved, 'Karen → Karan');
  assert.equal(mini.querySelector('[name=word]').value, '');
  assert.equal(mini.querySelector('.dictionary-form-status').classList.contains('error'), false);
  form.cancel(); assert.equal(cancelled, 1);
});
