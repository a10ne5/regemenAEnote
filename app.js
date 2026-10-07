/* Reference browsing only. No patient fields, grading, or dose calculation. */
(() => {
  'use strict';
  const data = globalThis.POCKET_GUIDE;
  const SESSION_KEY = 'regimen-pocket-guide-navigation-v1';
  const VIEWS = ['ae', 'next', 'before'];
  const state = { regimen: 'gb', view: 'ae', query: '' };
  const AE_GROUPS = [['danger', '重篤'], ['info', '特徴的'], ['warn', '頻度が高い'], ['other', 'その他']];
  const LABEL_NOTE = '構成薬 / 製剤の公式資料に基づく確認項目。レジメン全体での発現頻度を示すものではない。';
  const displayNote = item => (item.note || '').replace(LABEL_NOTE, '').trim();
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s＋+‐‑–—−・/／]/g, '');
  const current = () => data.regimens.find(r => r.id === state.regimen);
  const matches = row => !state.query || normalize(JSON.stringify(row)).includes(normalize(state.query));
  const empty = text => `<p class="empty-state">${escape(text)}</p>`;

  function validRoute(route) {
    return { regimen: data.regimens.some(r => r.id === route.regimen) ? route.regimen : 'gb', view: VIEWS.includes(route.view) ? route.view : 'ae' };
  }
  function readRoute() {
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') || {}; } catch (_) {}
    const hash = new URLSearchParams(location.hash.slice(1));
    return validRoute({ regimen: hash.get('regimen') || saved.regimen, view: hash.get('view') || saved.view });
  }
  function saveRoute() {
    const route = { regimen: state.regimen, view: state.view };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(route)); } catch (_) {}
    try { history.replaceState(null, '', `#${new URLSearchParams(route)}`); } catch (_) {}
  }
  function sources(row) {
    const ids = [...new Set(row.sourceIds || [])].filter(id => data.sources[id]);
    if (!ids.length) return '';
    return `<details class="sources"><summary>根拠${row.locator ? ` · ${escape(row.locator)}` : ''}</summary><ul>${ids.map(id => {
      const source = data.sources[id];
      return `<li><a href="${escape(encodeURI(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a> <span>資料確認 ${escape(source.checked)}</span></li>`;
    }).join('')}</ul></details>`;
  }
  function timingMarkup(row) {
    return `<article class="timing-row adverse-item"><p class="timing-window"><span class="timing-kind">${escape(row.kind)}</span>${escape(row.window)}</p><div class="timing-copy"><h4>${escape(row.ae)}</h4><p>${escape(row.detail)}</p>${sources(row)}</div></article>`;
  }
  function doseMarkup(row) {
    return `<article class="dose-row summary-card"><div class="dose-top"><h4>${escape(row.title)}</h4><span class="row-kind">${escape(row.kind)}</span></div><p class="drug-name">${escape(row.drug)}</p><dl class="dose-grid"><div><dt>該当する条件</dt><dd>${escape(row.trigger)}</dd></div><div><dt>休薬・変更</dt><dd>${escape(row.action)}</dd></div><div><dt>回復基準・再開／次回量</dt><dd>${escape(row.restart)}</dd></div></dl>${row.note ? `<p class="rule-note">${escape(row.note)}</p>` : ''}${sources(row)}</article>`;
  }
  function beforeMarkup(row) {
    return `<article class="before-row summary-card"><p class="before-kind">${escape(row.kind)}</p><h4>${escape(row.title)}</h4><p>${escape(row.text)}</p>${sources(row)}</article>`;
  }
  function filtered(regimen = current()) {
    return {
      timings: regimen.timings.filter(matches),
      aeSections: regimen.aeSections.map(s => ({ ...s, items: s.items.filter(matches) })).filter(s => s.items.length),
      checks: regimen.checks.filter(matches),
      nextDose: regimen.nextDose.filter(matches), before: regimen.before.filter(matches),
    };
  }
  function displaySections(sections) {
    const items = sections.flatMap(section => section.items);
    return AE_GROUPS.map(([tone, title]) => ({ tone, title, items: items.filter(item => item.displayTone === tone) }));
  }
  function aeRow(item) {
    const note = displayNote(item);
    const marker = item.marker ? `<span class="marker marker-${escape(item.displayTone)}">${escape(item.marker)}</span>` : '';
    return `<div class="ae-row adverse-item"><div class="adverse-item-title"><strong>${escape(item.title)}</strong>${marker}</div><details class="adverse-evidence" ${state.query ? 'open' : ''}><summary>確認ポイント・根拠</summary><div class="ae-detail">${note ? `<p>${escape(note)}</p>` : ''}${(item.checks || []).map(check => `<p>${escape(check)}</p>`).join('')}${sources(item)}</div></details></div>`;
  }
  function renderAEs(sections) {
    $('#ae-list').innerHTML = displaySections(sections).map(section => {
      const rows = section.items.map(aeRow).join('') || empty(state.query ? '該当する項目はありません。' : '収載項目はありません。');
      const content = `<div class="ae-rows adverse-list">${rows}</div>`;
      if (section.tone === 'other') return `<details id="additional-aes" class="ae-section adverse-card" data-tone="other" ${state.query && section.items.length ? 'open' : ''}><summary><h3 class="ae-category">その他</h3><span class="panel-note">${section.items.length}項目</span></summary><p class="context-note">構成薬の注意事項など。重篤な副作用も含みます。</p>${content}</details>`;
      return `<section class="ae-section adverse-card" data-tone="${section.tone}"><header><h3 class="ae-category">${section.title}</h3></header>${content}</section>`;
    }).join('');
  }
  function renderContent() {
    const regimen = current();
    const f = filtered(regimen);
    $('#timing-list').innerHTML = f.timings.map(timingMarkup).join('') || empty('この検索に一致する時期情報はありません。');
    renderAEs(f.aeSections);
    $('#recognition-list').innerHTML = f.checks.map(row => `<div class="recognition-item"><h4>${escape(row.name)}</h4><p>${escape(row.checklist)}</p>${sources(row)}</div>`).join('') || empty('該当する確認所見がありません。');
    $('#recognition-details').open = Boolean(state.query && f.checks.length);
    $('#monitoring-list').textContent = regimen.monitoring.map(row => `${row.name}${row.unit ? `（${row.unit}）` : ''}`).join(' ／ ');
    $('#dose-list').innerHTML = f.nextDose.map(doseMarkup).join('') || empty('この検索に一致する投与条件はありません。');
    $('#before-list').innerHTML = f.before.map(beforeMarkup).join('') || empty('この検索に一致する開始前の確認項目はありません。');
    const counts = { ae: f.timings.length + f.aeSections.reduce((sum, s) => sum + s.items.length, 0) + f.checks.length, next: f.nextDose.length, before: f.before.length };
    $('#search-status').textContent = state.query ? `「${state.query}」の検索結果：副作用・時期 ${counts.ae}件 ／ 次回投与 ${counts.next}件 ／ 開始前 ${counts.before}件` : '';
    $('#unresolved-list').innerHTML = regimen.unresolved.map(text => `<li>${escape(text)}</li>`).join('');
  }
  function renderRegimen() {
    const regimen = current();
    $('#regimen-select').value = regimen.id;
    $('#regimen-name').textContent = regimen.name;
    $('#regimen-group').textContent = regimen.group;
    $('#regimen-scope').textContent = regimen.scope;
    $('#regimen-components').textContent = regimen.components;
    $('#ae-review-date').textContent = regimen.aeReviewedAt ? `AE資料確認：${regimen.aeReviewedAt}` : `AE一覧は${data.aeReviewedAt}の点検内容を引き継いでいます。`;
    document.title = `${regimen.shortName} | レジメンあんちょこ`;
    $('#copy-status').textContent = '';
    renderContent(); saveRoute();
  }
  function selectRegimen(id) {
    state.regimen = validRoute({ regimen: id, view: state.view }).regimen;
    state.query = '';
    $('#guide-search').value = '';
    renderRegimen();
  }
  function setView(view) {
    state.view = VIEWS.includes(view) ? view : 'ae';
    $(`#panel-${state.view}`).scrollIntoView?.({ block: 'start' });
    saveRoute();
  }
  function guideText(regimen = current()) {
    const lines = [`${regimen.name} — レジメンあんちょこ`, regimen.scope, '', '【出現時期・観察時期】'];
    const addSource = row => lines.push(`根拠：${row.locator || ''} ${(row.sourceIds || []).map(id => data.sources[id]?.url || '').join(' / ')}`);
    regimen.timings.forEach(row => { lines.push(`${row.ae}｜${row.kind}：${row.window}`, row.detail); addSource(row); });
    lines.push('', '【副作用】', '構成薬の公式資料に由来する注意事項も含みます。これらはレジメン全体での発現頻度を示すものではありません。');
    displaySections(regimen.aeSections).forEach(section => { lines.push('', `【${section.title}】`); section.items.forEach(item => { lines.push(`・${item.title}：${displayNote(item)}`, ...(item.checks || [])); if (item.sourceIds?.length) addSource(item); }); });
    lines.push('', '【症状から確認する】');
    regimen.checks.forEach(row => { lines.push(`${row.name}：${row.checklist}`); if (row.sourceIds?.length) addSource(row); });
    lines.push('', '【観察する検査項目】', regimen.monitoring.map(row => `${row.name}${row.unit ? `（${row.unit}）` : ''}`).join(' ／ '));
    lines.push('', '【次回投与・休薬・減量】');
    regimen.nextDose.forEach(row => { lines.push(`${row.title}｜${row.drug}`, `条件：${row.trigger}`, `対応：${row.action}`, `再開：${row.restart}`, row.note); addSource(row); });
    lines.push('', '【開始前の確認】');
    regimen.before.forEach(row => { lines.push(`${row.kind}｜${row.title}：${row.text}`); addSource(row); });
    lines.push('', '【収載範囲】', ...regimen.unresolved, '主要条件の抜粋。全AE・全休薬減量条件の一覧ではありません。資料の版・採用プロトコルと照合してください。');
    return lines.filter(line => line !== undefined).join('\n');
  }
  async function copyGuide() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(guideText());
      $('#copy-status').textContent = 'このレジメンの全項目をコピーしました。';
    } catch (_) { $('#copy-status').textContent = 'コピーを利用できません。「印刷」からPDF保存できます。'; }
  }
  let printState;
  function preparePrint() {
    if (printState) return;
    printState = { query: state.query, open: all('main details').map(d => d.open) };
    state.query = ''; renderContent();
    all('main details').forEach(details => { details.open = true; });
  }
  function restorePrint() {
    if (!printState) return;
    state.query = printState.query;
    const open = printState.open; printState = undefined; renderContent();
    all('main details').forEach((details, i) => { details.open = Boolean(open[i]); });
  }
  async function setupOffline() {
    const status = $('#offline-status');
    if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(location.protocol)) {
      status.textContent = 'ローカル参照'; return;
    }
    try {
      await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      await navigator.serviceWorker.ready;
      status.textContent = navigator.onLine ? 'オフライン参照に対応' : 'オフラインで表示中';
    } catch (_) { status.textContent = 'オフライン準備は未完了'; }
  }
  function init() {
    const linkedView = new URLSearchParams(location.hash.slice(1)).get('view');
    Object.assign(state, readRoute());
    $('#regimen-select').innerHTML = data.regimens.map(r => `<option value="${r.id}">${escape(r.name)}</option>`).join('');
    $('#regimen-select').addEventListener('change', event => selectRegimen(event.target.value));
    $('#guide-search').addEventListener('input', event => { state.query = event.target.value; renderContent(); });
    $('#copy-guide').addEventListener('click', copyGuide);
    $('#print-guide').addEventListener('click', () => { preparePrint(); window.print(); });
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', restorePrint);
    window.addEventListener('hashchange', () => { Object.assign(state, readRoute()); state.query = ''; $('#guide-search').value = ''; renderRegimen(); setView(state.view); });
    window.addEventListener('online', () => { $('#offline-status').textContent = 'オンライン'; });
    window.addEventListener('offline', () => { $('#offline-status').textContent = 'オフライン'; });
    renderRegimen(); setupOffline();
    if (['next', 'before'].includes(linkedView)) setView(state.view);
  }
  if (globalThis.POCKET_TEST_MODE) globalThis.POCKET_TEST = { state, validRoute, readRoute, matches, filtered, guideText, renderContent, renderRegimen, selectRegimen, setView, init, preparePrint, restorePrint, sources, escape };
  else init();
})();
