export function createDictionary(doc) {
  let entries = [], loaded = false;
  const $ = (id) => doc.getElementById(id);
  const status = (text, error = false) => {
    $('dictionary-status').textContent = text;
    $('dictionary-status').classList.toggle('error', error);
    $('dictionary-sync').textContent = error ? 'Not synced' : loaded ? 'Synced' : 'Loading…';
  };
  async function api(path = '/api/dictionary', data) {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json', 'X-Steno': '1' } : {},
      body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save. Try again.');
    entries = result.entries; loaded = true; render();
  }
  async function refresh() {
    try { await api(); status('Dictionary is up to date.'); }
    catch { status('Could not sync. Check your connection and refresh the dictionary.', true); }
  }
  function render() {
    const query = $('dictionary-search').value.trim().toLocaleLowerCase();
    const list = $('dictionary-list'); list.replaceChildren();
    $('dictionary-count').textContent = `${entries.length} / 100`;
    const matches = entries.filter((entry) => (entry.word + ' ' + entry.misspelling).toLocaleLowerCase().includes(query));
    if (!matches.length) {
      const empty = doc.createElement('p'); empty.className = 'dictionary-empty';
      empty.textContent = !loaded ? 'Loading your dictionary…' : query ? 'No matching words.' : 'Add names, phrases and words you use every day.';
      list.append(empty);
    }
    for (const entry of matches) {
      const row = doc.createElement('li'); row.className = 'dictionary-entry';
      const text = doc.createElement('div');
      const name = doc.createElement('span'); name.textContent = entry.misspelling ? `${entry.misspelling} → ${entry.word}` : entry.word;
      const kind = doc.createElement('small'); kind.textContent = entry.misspelling ? 'Spelling rule' : 'Vocabulary';
      text.append(name, kind);
      const edit = doc.createElement('button'); edit.type = 'button'; edit.className = 'entry-action'; edit.textContent = '✎'; edit.setAttribute('aria-label', `Edit ${entry.word}`);
      edit.onclick = () => mainForm.edit(entry);
      const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'entry-action'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${entry.word}`);
      remove.onclick = async () => {
        remove.disabled = true;
        if (!window.confirm(`Delete “${entry.word}” from your dictionary?`)) { remove.disabled = false; return; }
        try { await api('/api/dictionary/delete', { id: entry.id, version: entry.version }); status('Entry deleted.'); }
        catch (error) { status(error.message || 'Could not delete. Try again.', true); remove.disabled = false; }
      };
      row.append(text, edit, remove); list.append(row);
    }
  }
  function mountForm(root, onSaved = () => {}, onCancel = () => {}, compact = false) {
    // Static markup only. Terms are always assigned via value/textContent.
    root.innerHTML = '<div class="dictionary-tabs" role="group" aria-label="Entry type"><button type="button" data-mode="word" aria-pressed="true">Add word</button><button type="button" data-mode="correction" aria-pressed="false">Correct spelling</button></div><form class="dictionary-form"><label class="misspelling-field" hidden>Misspelling<input name="misspelling" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false"></label><label><span class="word-label">Word or phrase</span><input name="word" maxlength="80" required autocomplete="off" spellcheck="false"></label><p class="dictionary-help">Keep preferred names and words in your vocabulary.</p><div class="dictionary-form-actions"><button type="submit" class="primary">Add to dictionary</button><button type="button" class="dictionary-cancel" hidden>Cancel</button></div><p class="dictionary-form-status" role="status" aria-live="polite"></p></form>';
    const find = (selector) => root.querySelector(selector);
    const form = find('form'), word = find('[name=word]'), misspelling = find('[name=misspelling]');
    const save = find('[type=submit]'), cancel = find('.dictionary-cancel'), note = find('.dictionary-form-status');
    const tabs = [...root.querySelectorAll('[data-mode]')];
    let mode = compact ? 'correction' : 'word', editing = null, saving = false;
    function setMode(next) {
      mode = next;
      find('.misspelling-field').hidden = mode !== 'correction';
      misspelling.required = mode === 'correction';
      find('.word-label').textContent = mode === 'correction' ? 'Correct spelling' : 'Word or phrase';
      find('.dictionary-help').textContent = mode === 'correction' ? 'Use this correction when the context matches.' : 'Keep preferred names and words in your vocabulary.';
      for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.mode === mode));
      save.textContent = editing ? 'Save changes' : mode === 'correction' ? 'Save correction' : 'Add to dictionary';
      cancel.hidden = !compact && !editing;
    }
    const reset = () => { editing = null; form.reset(); note.textContent = ''; note.classList.remove('error'); setMode(mode); };
    tabs.forEach((tab) => { tab.onclick = () => { if (!saving) { setMode(tab.dataset.mode); note.textContent = ''; } }; });
    cancel.onclick = () => { if (!saving) { reset(); onCancel(); } };
    form.onsubmit = async (event) => {
      event.preventDefault(); if (saving || !form.reportValidity()) return;
      const data = { word: word.value.trim(), misspelling: mode === 'correction' ? misspelling.value.trim() : '', ...(editing ? { id: editing.id, version: editing.version } : {}) };
      saving = true; root.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
      save.textContent = 'Saving…'; note.textContent = 'Saving to your account…'; note.classList.remove('error');
      try {
        await api('/api/dictionary', data);
        reset(); status('All changes saved to your account.'); note.textContent = 'Saved to your dictionary.';
        onSaved(data.misspelling ? `${data.misspelling} → ${data.word}` : data.word);
      } catch (error) {
        note.textContent = error.message || 'Could not save. Try again.'; note.classList.add('error');
        status('A change has not been saved. Retry or refresh the dictionary.', true);
      } finally {
        saving = false; root.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
        setMode(mode); if (note.classList.contains('error')) save.textContent = 'Retry save';
      }
    };
    setMode(mode);
    return {
      edit(entry) { if (saving) return; editing = entry; word.value = entry.word; misspelling.value = entry.misspelling; note.textContent = ''; setMode(entry.misspelling ? 'correction' : 'word'); word.focus(); },
      focus() { (mode === 'correction' ? misspelling : word).focus(); },
      cancel() { cancel.click(); },
      get saving() { return saving; },
    };
  }
  const mainForm = mountForm($('dictionary-form-mount'));
  $('dictionary-search').oninput = render;
  $('dictionary-refresh').onclick = refresh;
  window.addEventListener('focus', refresh);
  render(); refresh();
  return { mountForm, refresh };
}
