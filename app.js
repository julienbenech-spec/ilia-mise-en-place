(function () {
'use strict';

/* ---------- configuration ---------- */
var SUPABASE_URL = 'https://sytohivmwyrqevbspxtn.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5dG9oaXZtd3lycWV2YnNweHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NzY4NjAsImV4cCI6MjEwNzQ1Mjg2MH0.kB5HxtWL92YdpfWaeruPyf0Xp6g_bZ1eKKAPhuKJKhM';
var CATS = [
  ['bases', 'bases'], ['protéines', 'protéines'], ['dips', 'dips'], ['toppings', 'toppings'],
  ['sauces', 'sauces'], ['accompagnements', 'pita'], ['desserts', 'desserts']
];

/* ---------- outils ---------- */
var app = document.getElementById('app');
var printRoot = document.getElementById('print-root');
var toastEl = document.getElementById('toast');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function low(s) { return String(s || '').toLocaleLowerCase('fr-FR'); }
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
}
function todayParis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}
function addDays(iso, n) {
  var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function frDate(iso) {
  var d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function quarter(x) { return Math.ceil(Math.round(x * 1000) / 1000 * 4) / 4; }
function fq(x) { // 2.25 -> "2 ¼"
  if (x == null || isNaN(x)) return '–';
  var neg = x < 0; x = Math.abs(Math.round(x * 4) / 4);
  var ent = Math.floor(x), fr = Math.round((x - ent) * 4);
  var s = ['', '¼', '½', '¾'][fr];
  var out = ent === 0 ? (s || '0') : (s ? ent + ' ' + s : String(ent));
  return (neg ? '−' : '') + out;
}
function kg(x) { return x == null ? '–' : (Math.round(x * 10) / 10).toLocaleString('fr-FR') + ' kg'; }
function plural(n, one, many) { return n + ' ' + (Math.abs(n) >= 2 ? many : one); }

function api(fn, body) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    body: JSON.stringify(body || {})
  }).then(function (r) {
    return r.text().then(function (t) {
      var data = t ? JSON.parse(t) : null;
      if (!r.ok) {
        var e = new Error((data && data.message) || 'erreur'); e.status = r.status; e.denied = /acces refuse/.test(t); throw e;
      }
      return data;
    });
  });
}

var ICON_CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var ICON_DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
var ICON_PRINT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>';
var ICON_INFO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>';

/* ---------- routage ---------- */
var path = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
var slug = low(path[0] || '');
var S = { slug: slug, pin: null, day: todayParis(), tab: 'bases', data: null, open: null, view: 'fiche', inv: null, invTab: 'bases', touched: {} };

function storeKey() { return 'ilia-mep-pin-' + S.slug; }
function getStored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setStored(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

function start() {
  if (!slug) { renderHome(); return; }
  if (slug === 'direction') { startDirection(); return; }
  S.view = location.hash === '#inventaire' ? 'inventaire' : 'fiche';
  var pin = getStored(storeKey());
  if (pin) { S.pin = pin; loadView().catch(function () { setStored(storeKey(), null); renderLogin(); }); }
  else renderLogin();
}
window.addEventListener('hashchange', function () {
  if (!S.pin || S.slug === 'direction') return;
  S.view = location.hash === '#inventaire' ? 'inventaire' : 'fiche';
  loadView();
});

function renderHome() {
  document.body.className = 'dark';
  app.innerHTML = '<div class="login"><div class="logo">ILIA<span>.</span></div><main><h1>outil de mise en <span class="it">place.</span></h1>' +
    '<p class="muted" style="font-size:16px;line-height:1.5;max-width:520px">utilise l’adresse de ton restaurant, par exemple <strong>/washington</strong>.</p></main><div></div></div>';
}

/* ---------- connexion ---------- */
function renderLogin(err) {
  document.body.className = 'dark';
  api('app_restaurant_name', { p_slug: S.slug }).then(function (name) {
    if (!name) { app.innerHTML = '<div class="login"><div class="logo">ILIA<span>.</span></div><main><h1>adresse <span class="it">inconnue.</span></h1><p class="muted">vérifie l’adresse de ton restaurant.</p></main><div></div></div>'; return; }
    S.name = name;
    app.innerHTML =
      '<div class="login"><div><div class="kicker" style="color:#B9C7BF">outil équipe · mise en place</div><div class="logo" style="margin-top:8px">ILIA<span>.</span></div></div>' +
      '<form id="lf" style="display:flex;flex-direction:column;gap:36px">' +
      '<h1>bonjour. on prépare <span class="it">quoi</span> aujourd’hui ?</h1>' +
      '<div><div class="kicker" style="color:#B9C7BF">restaurant</div><div class="resto">' + esc(low(name)) + '</div></div>' +
      '<div><label for="pin">code du restaurant</label><input id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="····" required>' +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') + '</div>' +
      '<div><button class="btn fill" type="submit">entrer →</button></div></form>' +
      '<div class="muted" style="font-size:14px">du bon. à ton rythme.</div></div>';
    var f = document.getElementById('lf');
    document.getElementById('pin').focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      S.pin = document.getElementById('pin').value.trim();
      loadView().then(function () { setStored(storeKey(), S.pin); })
        .catch(function (er) { S.pin = null; renderLogin(er.denied ? 'code incorrect.' : 'connexion impossible, réessaie.'); });
    });
  }).catch(function () { app.innerHTML = '<div class="login"><h1>connexion impossible.</h1><p>vérifie le réseau puis recharge la page.</p></div>'; });
}

function loadView() { return S.view === 'inventaire' ? loadInventory() : loadSheet(); }

/* ---------- fiche du jour ---------- */
function loadSheet() {
  return api('app_sheet', { p_slug: S.slug, p_pin: S.pin, p_day: S.day }).then(function (d) {
    S.data = d; S.name = d.restaurant.name; renderSheet();
  });
}
function fmtRatio(code) {
  var f = (S.data.formats || []).filter(function (x) { return x.code === code; })[0];
  return f ? Number(f.ratio) : 1;
}
function rowsOf(cat) { return S.data.rows.filter(function (r) { return r.category === cat; }); }
function memberName(id) {
  var m = (S.data.team || []).filter(function (x) { return x.id === id; })[0];
  return m ? m.first_name : null;
}

// Quantité affichée d'une ligne (texte), selon le format choisi
function lineQty(r) {
  var useActual = r.actual != null;
  if (r.unit_kind === 'piece') {
    var n = useActual ? Number(r.actual) : r.to_prep;
    if (n == null) return { n: null };
    return { n: fq(n), u: n >= 2 ? 'pièces' : 'pièce', plain: fq(n) + ' ' + (n >= 2 ? 'pièces' : 'pièce'),
             planned: useActual && r.to_prep != null ? fq(r.to_prep) : null };
  }
  if (r.gn11_kg) {
    var g = useActual ? Number(r.actual) : Number(r.to_prep);
    var ratio = fmtRatio(r.format);
    var q = quarter(g / ratio);
    return { n: fq(q), fmt: r.format, w: r.show_weight ? kg(g * r.gn11_kg) : null, plain: fq(q) + ' ' + r.format,
             planned: useActual ? fq(quarter(Number(r.to_prep) / ratio)) : null };
  }
  if (r.need_kg != null && r.portion_qty) {
    return { n: (Math.round(r.need_kg * 10) / 10).toLocaleString('fr-FR'), u: 'kg', kgOnly: true, plain: kg(r.need_kg) };
  }
  if (r.need_portions != null) {
    return { n: String(r.need_portions), u: 'portions', noGram: true, plain: r.need_portions + ' portions' };
  }
  return { n: null };
}

function renderSheet() {
  document.body.className = '';
  var d = S.data, today = todayParis();
  var tabs = CATS.filter(function (c) { return rowsOf(c[0]).length; });
  if (!rowsOf(S.tab).length && tabs.length) S.tab = tabs[0][0];
  var rows = rowsOf(S.tab);
  var doneCount = d.rows.filter(function (r) { return r.done; }).length;
  var missingBac = rows.some(function (r) { return r.unit_kind === 'g' && r.portion_qty && !r.gn11_kg; });
  var missingGram = rows.some(function (r) { return r.unit_kind === 'g' && !r.portion_qty; });

  var h = '<div class="wrap"><header class="top"><div class="row"><div>' +
    '<div class="kicker">' + esc(low(d.restaurant.name)) + ' · ' + esc(frDate(d.day)) + '</div>' +
    '<h1>mise en place du <span class="it">jour.</span></h1><div class="trait"></div>' +
    '<div class="daysw"><button class="chip' + (S.day === today ? ' on' : '') + '" data-day="' + today + '">aujourd’hui</button>' +
    '<button class="chip' + (S.day === addDays(today, 1) ? ' on' : '') + '" data-day="' + addDays(today, 1) + '">demain</button></div>' +
    '</div><div style="text-align:right"><div class="kicker">bowls attendus</div><div class="big">' + (d.bowls != null ? '≈ ' + d.bowls : '–') + '</div>' +
    '<div class="kicker">moyenne des derniers ' + esc(frDate(d.day).split(' ')[0]) + 's</div></div></div></header>' +
    '<nav class="tabs" aria-label="postes">' + tabs.map(function (c) {
      return '<button class="chip' + (c[0] === S.tab ? ' on' : '') + '" data-tab="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</nav><main><div class="list">';

  rows.forEach(function (r) {
    var q = lineQty(r), open = S.open === r.id;
    var qhtml;
    if (q.n == null) qhtml = '<span class="na">grammage à renseigner</span>';
    else if (q.fmt) {
      qhtml = '<span class="n">' + q.n + ' <select class="fmt" data-fmt="' + r.id + '" aria-label="format de bac pour ' + esc(r.name) + '">' +
        d.formats.map(function (f) { return '<option' + (f.code === r.format ? ' selected' : '') + '>' + f.code + '</option>'; }).join('') +
        '</select></span>' + (q.w || q.planned ? '<span class="w">' + [q.w ? '≈ ' + q.w : '', q.planned ? 'prévu ' + q.planned : ''].filter(Boolean).join(' · ') + '</span>' : '');
    } else {
      qhtml = '<span class="n">' + q.n + ' <span class="u">' + q.u + '</span></span>' +
        (q.kgOnly ? '<span class="w">poids du bac à renseigner</span>' : q.noGram ? '<span class="w">grammage à renseigner</span>' : (q.planned ? '<span class="w">prévu ' + q.planned + '</span>' : ''));
    }
    var who = '<select class="' + (r.assignee_id ? 'set' : '') + '" data-who="' + r.id + '" aria-label="assigner ' + esc(r.name) + '">' +
      '<option value="">assigner</option>' + d.team.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === r.assignee_id ? ' selected' : '') + '>' + esc(m.first_name) + '</option>';
      }).join('') + '<option value="add">+ ajouter un prénom…</option></select>';
    h += '<div class="line' + (r.done ? ' done' : '') + '"><div class="main">' +
      '<div class="nm">' + esc(low(r.name)) + '</div><div class="qty">' + qhtml + '</div><div class="who">' + who + '</div>' +
      '<div class="acts"><button class="ck' + (r.done ? ' on' : '') + '" data-done="' + r.id + '" aria-pressed="' + r.done + '" aria-label="' + esc(r.name) + ' fait comme indiqué">' + ICON_CHECK + '</button>' +
      '<button class="ar' + (open ? ' open' : '') + '" data-open="' + r.id + '" aria-expanded="' + open + '" aria-label="détails et quantité réelle pour ' + esc(r.name) + '">' + ICON_DOWN + '</button></div></div>';
    if (open) h += detailHtml(r);
    h += '</div>';
  });
  h += '</div>';
  if (missingBac) h += '<div class="notice">' + ICON_INFO + '<div>certaines quantités sont en kilos : le poids d’un bac plein n’est pas encore renseigné pour ces préparations. les bacs apparaîtront dès qu’il le sera, et les restes d’hier seront alors déduits.</div></div>';
  if (missingGram) h += '<div class="notice">' + ICON_INFO + '<div>« grammage à renseigner » : la quantité par portion manque dans la fiche des grammages, la fiche affiche donc le nombre de portions prévues.</div></div>';
  h += '</main></div><div class="bar"><div class="wrap"><button class="btn fill" id="print">' + ICON_PRINT + 'imprimer</button>' +
    '<span class="kicker">' + doneCount + ' sur ' + d.rows.length + ' fait</span>' +
    '<a class="btn" href="#inventaire">inventaire de fin de service →</a></div></div>';
  app.innerHTML = h;
}

function detailHtml(r) {
  var facts = [];
  if (r.unit_kind === 'piece') {
    if (r.need_units != null) facts.push('besoin ' + plural(Math.ceil(r.need_units), 'pièce', 'pièces'));
    facts.push('reste d’hier ' + (r.leftover ? plural(Number(r.leftover), 'pièce', 'pièces') : '—'));
  } else if (r.gn11_kg) {
    facts.push('besoin ' + fq(quarter(r.need_units / fmtRatio(r.format))) + ' ' + r.format + (r.need_kg != null ? ' (≈ ' + kg(r.need_kg) + ')' : ''));
    facts.push('reste d’hier ' + leftoverText(r));
  } else if (r.need_kg != null) {
    facts.push('besoin ≈ ' + kg(r.need_kg));
    facts.push('reste d’hier ' + leftoverText(r) + ' (non déduit)');
  }
  var real = '';
  if (r.unit_kind === 'piece' || r.gn11_kg) {
    var cur = r.actual != null ? Number(r.actual) : (r.to_prep != null ? Number(r.to_prep) : 0);
    var val = r.unit_kind === 'piece' ? cur : quarter(cur / fmtRatio(r.format));
    S.edit = { id: r.id, val: val };
    real = '<div class="real"><span class="lbl">réellement préparé</span><span class="stepper"><span class="f">' + (r.unit_kind === 'piece' ? 'pièces' : esc(r.format)) + '</span>' +
      '<button data-step="-1" aria-label="moins">−</button><span class="v" id="edv">' + fq(val) + '</span><button data-step="1" aria-label="plus">+</button></span>' +
      '<button class="btn fill" data-save="' + r.id + '" style="padding:10px 20px;min-height:44px;font-size:14px">valider</button>' +
      (r.actual != null ? '<button class="btn" data-reset="' + r.id + '" style="padding:10px 16px;min-height:44px;font-size:14px">annuler</button>' : '') + '</div>';
  } else {
    real = '<div class="kicker">saisie du réel disponible dès que le poids du bac sera renseigné.</div>';
  }
  return '<div class="detail"><div class="facts">' + facts.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div>' + real + '</div>';
}
function leftoverText(r) {
  if (!r.leftover_detail || !r.leftover_detail.length) return '—';
  return r.leftover_detail.map(function (x) { return x.format === 'piece' ? plural(Number(x.qty), 'pièce', 'pièces') : fq(Number(x.qty)) + ' ' + x.format; }).join(' + ');
}
function findRow(id) { return S.data.rows.filter(function (r) { return r.id === id; })[0]; }
function setPlan(id, patch) {
  return api('app_set_plan', { p_slug: S.slug, p_pin: S.pin, p_day: S.day, p_prep: id, p_patch: patch })
    .catch(function () { toast('enregistrement impossible, réessaie'); return loadSheet(); });
}

app.addEventListener('click', function (e) {
  var t = e.target.closest('button,a'); if (!t) return;
  if (S.slug === 'direction') return;
  if (t.dataset.day) { S.day = t.dataset.day; S.open = null; loadSheet(); return; }
  if (t.dataset.tab) { S.tab = t.dataset.tab; S.open = null; renderSheet(); window.scrollTo(0, 0); return; }
  if (t.dataset.done) {
    var r = findRow(Number(t.dataset.done)); r.done = !r.done; renderSheet(); setPlan(r.id, { done: r.done }); return;
  }
  if (t.dataset.open) { var id = Number(t.dataset.open); S.open = S.open === id ? null : id; renderSheet(); return; }
  if (t.dataset.step) {
    var rr = findRow(S.edit.id), step = rr.unit_kind === 'piece' ? 1 : 0.25;
    S.edit.val = Math.max(0, Math.round((S.edit.val + step * Number(t.dataset.step)) * 4) / 4);
    document.getElementById('edv').textContent = fq(S.edit.val); return;
  }
  if (t.dataset.save) {
    var rs = findRow(Number(t.dataset.save));
    var actual = rs.unit_kind === 'piece' ? S.edit.val : Math.round(S.edit.val * fmtRatio(rs.format) * 10000) / 10000;
    rs.actual = actual; rs.done = true; S.open = null; renderSheet();
    setPlan(rs.id, { actual: actual, done: true }).then(function () { toast('quantité réelle enregistrée'); }); return;
  }
  if (t.dataset.reset) {
    var rz = findRow(Number(t.dataset.reset)); rz.actual = null; S.open = null; renderSheet(); setPlan(rz.id, { actual: null }); return;
  }
  if (t.id === 'print') { openPrint(); return; }
  if (t.dataset.invtab) { S.invTab = t.dataset.invtab; renderInventory(); window.scrollTo(0, 0); return; }
  if (t.dataset.inv) { invStep(t); return; }
  if (t.dataset.addfmt) { invAddFormat(Number(t.dataset.addfmt)); return; }
  if (t.id === 'saveinv') { saveInventory(); return; }
});

app.addEventListener('change', function (e) {
  var t = e.target;
  if (t.dataset.fmt) { var r = findRow(Number(t.dataset.fmt)); r.format = t.value; renderSheet(); setPlan(r.id, { format: t.value }); return; }
  if (t.dataset.who) {
    var rw = findRow(Number(t.dataset.who));
    if (t.value === 'add') {
      var name = (window.prompt('prénom à ajouter à l’équipe') || '').trim();
      if (!name) { renderSheet(); return; }
      api('app_add_member', { p_slug: S.slug, p_pin: S.pin, p_name: name }).then(function (id) {
        S.data.team.push({ id: id, first_name: name });
        S.data.team.sort(function (a, b) { return a.first_name.localeCompare(b.first_name, 'fr'); });
        rw.assignee_id = id; renderSheet(); return setPlan(rw.id, { assignee_id: id });
      }).catch(function () { toast('ajout impossible'); renderSheet(); });
      return;
    }
    rw.assignee_id = t.value ? Number(t.value) : null; renderSheet(); setPlan(rw.id, { assignee_id: rw.assignee_id }); return;
  }
  if (t.dataset.invfmt) { invChangeFormat(t); return; }
});

/* ---------- impression ---------- */
function openPrint() {
  var tabLabel = (CATS.filter(function (c) { return c[0] === S.tab; })[0] || [0, S.tab])[1];
  var m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = '<div class="sheet" role="dialog" aria-labelledby="pt"><div style="display:flex;justify-content:space-between;align-items:center"><h2 id="pt">imprimer la fiche.</h2>' +
    '<button class="ck" id="pclose" aria-label="fermer">✕</button></div>' +
    '<fieldset><legend>quoi</legend><label class="opt"><input type="radio" name="pq" value="all" checked> toute la mise en place<span class="h">tous les postes</span></label>' +
    '<label class="opt"><input type="radio" name="pq" value="tab"> seulement : ' + esc(tabLabel) + '<span class="h">l’onglet affiché</span></label></fieldset>' +
    '<fieldset><legend>comment</legend><label class="opt"><input type="radio" name="pc" value="global" checked> fiche globale<span class="h">regroupée par personne</span></label>' +
    '<label class="opt"><input type="radio" name="pc" value="person"> une page par personne<span class="h">+ une page « à assigner »</span></label></fieldset>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn fill" id="pgo">créer le pdf</button></div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', function (e) {
    if (e.target === m || e.target.id === 'pclose') m.remove();
    if (e.target.id === 'pgo') {
      var quoi = m.querySelector('input[name=pq]:checked').value, comment = m.querySelector('input[name=pc]:checked').value;
      m.remove(); buildPrint(quoi, comment); setTimeout(function () { window.print(); }, 50);
    }
  });
}
function buildPrint(quoi, comment) {
  var d = S.data;
  var rows = d.rows.filter(function (r) { return (quoi === 'all' || r.category === S.tab); })
    .filter(function (r) { return lineQty(r).n != null; });
  var groups = {};
  rows.forEach(function (r) {
    var k = r.assignee_id ? (memberName(r.assignee_id) || 'à assigner') : 'à assigner';
    (groups[k] = groups[k] || []).push(r);
  });
  var names = Object.keys(groups).filter(function (k) { return k !== 'à assigner'; }).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  if (groups['à assigner']) names.push('à assigner');
  var catLabel = {}; CATS.forEach(function (c) { catLabel[c[0]] = c[1]; });
  function table(list) {
    return '<table>' + list.map(function (r) {
      var q = lineQty(r);
      return '<tr><td style="width:24px"><span class="box"></span></td><td style="font-weight:700">' + esc(low(r.name)) + '</td><td class="k">' + esc(catLabel[r.category] || '') + '</td>' +
        '<td class="q">' + esc(q.plain) + (q.w ? '<br><small>≈ ' + esc(q.w) + '</small>' : '') + '</td><td class="h"></td></tr>';
    }).join('') + '</table>';
  }
  function head(title) {
    return '<header><div><div class="k">' + esc(low(d.restaurant.name)) + ' · ' + esc(frDate(d.day)) + (d.bowls ? ' · ≈ ' + d.bowls + ' bowls attendus' : '') + '</div>' +
      '<h1>' + esc(title) + '</h1></div><div class="lg">ILIA<span>.</span></div></header>';
  }
  var foot = '<footer><span>marge de sécurité incluse · cocher quand c’est prêt et noter l’heure</span><span>imprimé le ' +
    new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) + '</span></footer>';
  var html = '';
  if (comment === 'global') {
    html = '<div class="pp">' + head('mise en place du jour') + names.map(function (n) {
      return '<h2><span>' + esc(n) + '</span><small>' + plural(groups[n].length, 'préparation', 'préparations') + '</small></h2>' + table(groups[n]);
    }).join('') + foot + '</div>';
  } else {
    html = names.map(function (n) { return '<div class="pp">' + head('mise en place · ' + n) + table(groups[n]) + foot + '</div>'; }).join('');
  }
  printRoot.innerHTML = html || '<div class="pp">' + head('mise en place du jour') + '<p>rien à préparer.</p></div>';
}

/* ---------- inventaire ---------- */
function loadInventory() {
  return api('app_inventory', { p_slug: S.slug, p_pin: S.pin, p_day: todayParis() }).then(function (d) {
    S.inv = d; S.name = d.restaurant.name; S.touched = {};
    S.counts = {};
    d.rows.forEach(function (r) {
      var c = (r.counts || []).map(function (x) { return { format: x.format, qty: Number(x.qty) }; });
      if (c.length) S.touched[r.id] = true;
      if (!c.length) c = [{ format: r.unit_kind === 'piece' ? 'piece' : r.default_format, qty: 0 }];
      S.counts[r.id] = c;
    });
    renderInventory();
  });
}
function renderInventory() {
  document.body.className = 'dark';
  var d = S.inv;
  var tabs = CATS.filter(function (c) { return d.rows.some(function (r) { return r.category === c[0]; }); });
  if (!tabs.some(function (c) { return c[0] === S.invTab; })) S.invTab = tabs[0][0];
  var rows = d.rows.filter(function (r) { return r.category === S.invTab; });
  var nTouched = Object.keys(S.touched).length;
  var h = '<div class="wrap"><header class="top"><a href="#" class="kicker" style="text-decoration:none">← fiche du matin</a>' +
    '<div class="kicker" style="margin-top:8px">' + esc(low(d.restaurant.name)) + ' · ' + esc(frDate(d.day)) + ' · fin de service</div>' +
    '<h1>inventaire fin de <span class="it">service.</span></h1><div class="trait"></div>' +
    '<p style="margin:12px 0 0;font-size:16px;line-height:1.5">compte au quart de bac près. le format se change en touchant « GN 1/1 ».' +
    (d.saved_at ? ' <span class="muted">déjà enregistré aujourd’hui, tu peux corriger.</span>' : '') + '</p></header>' +
    '<nav class="tabs" aria-label="postes">' + tabs.map(function (c) {
      return '<button class="chip' + (c[0] === S.invTab ? ' on' : '') + '" data-invtab="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</nav><main class="inv"><div class="list">';
  rows.forEach(function (r) {
    var cs = S.counts[r.id];
    h += '<div class="line' + (S.touched[r.id] ? ' touched' : '') + '"><div class="main"><div class="nm">' + esc(low(r.name)) + '</div><div class="counts">';
    cs.forEach(function (c, i) {
      if (c.format === 'piece') {
        h += '<span class="pill"><span class="pc">pièces</span>';
      } else {
        h += '<span class="pill"><select data-invfmt="' + r.id + ':' + i + '" aria-label="format de bac">' + d.formats.map(function (f) {
          return '<option' + (f.code === c.format ? ' selected' : '') + '>' + f.code + '</option>'; }).join('') + '</select>';
      }
      h += '<button data-inv="' + r.id + ':' + i + ':-1" aria-label="moins">−</button><span class="v">' + fq(c.qty) + '</span>' +
        '<button data-inv="' + r.id + ':' + i + ':1" aria-label="plus">+</button></span>';
    });
    if (r.unit_kind !== 'piece' && cs.length < 3) h += '<button class="addfmt" data-addfmt="' + r.id + '" aria-label="ajouter un autre format de bac">+</button>';
    h += '</div></div></div>';
  });
  h += '</div></main></div><div class="bar"><div class="wrap"><span class="kicker">' + nTouched + ' sur ' + d.rows.length + ' comptées</span>' +
    '<button class="btn fill" id="saveinv">valider l’inventaire</button></div></div>';
  app.innerHTML = h;
}
function invStep(t) {
  var p = t.dataset.inv.split(':'), id = Number(p[0]), i = Number(p[1]), dir = Number(p[2]);
  var c = S.counts[id][i], step = c.format === 'piece' ? 1 : 0.25;
  c.qty = Math.max(0, Math.round((c.qty + dir * step) * 4) / 4);
  S.touched[id] = true; renderInventory();
}
function invAddFormat(id) {
  var used = S.counts[id].map(function (c) { return c.format; });
  var next = S.inv.formats.filter(function (f) { return used.indexOf(f.code) < 0; })[0];
  if (!next) return;
  S.counts[id].push({ format: next.code, qty: 0 }); S.touched[id] = true; renderInventory();
}
function invChangeFormat(t) {
  var p = t.dataset.invfmt.split(':'), id = Number(p[0]), i = Number(p[1]);
  S.counts[id][i].format = t.value; S.touched[id] = true; renderInventory();
}
function saveInventory() {
  var missing = S.inv.rows.length - Object.keys(S.touched).length;
  if (missing > 0 && !window.confirm(plural(missing, 'préparation n’a', 'préparations n’ont') + ' pas été comptée(s) et sera(ont) enregistrée(s) à 0. continuer ?')) return;
  var payload = [];
  S.inv.rows.forEach(function (r) {
    var merged = {};
    S.counts[r.id].forEach(function (c) { merged[c.format] = (merged[c.format] || 0) + c.qty; });
    Object.keys(merged).forEach(function (f) { payload.push({ preparation_id: r.id, format: f, qty: merged[f] }); });
  });
  var b = document.getElementById('saveinv'); b.disabled = true; b.textContent = 'enregistrement…';
  api('app_save_inventory', { p_slug: S.slug, p_pin: S.pin, p_day: todayParis(), p_counts: payload })
    .then(function () { toast('inventaire enregistré, merci'); return loadInventory(); })
    .catch(function () { toast('enregistrement impossible, réessaie'); b.disabled = false; b.textContent = 'valider l’inventaire'; });
}

/* ---------- direction ---------- */
var D = { pin: null, restos: null, rid: null, period: 7, data: null };
function startDirection() {
  var pin = getStored('ilia-mep-dir');
  if (pin) { D.pin = pin; loadDirRestos().catch(function () { setStored('ilia-mep-dir', null); renderDirLogin(); }); }
  else renderDirLogin();
}
function renderDirLogin(err) {
  document.body.className = 'dark';
  app.innerHTML = '<div class="login"><div class="logo">ILIA<span>.</span></div><form id="df" style="display:flex;flex-direction:column;gap:32px">' +
    '<h1>la mise en place, <span class="it">au juste.</span></h1><div><label for="dpin">code direction</label>' +
    '<input id="dpin" type="password" inputmode="numeric" autocomplete="off" maxlength="10" required>' + (err ? '<div class="err">' + esc(err) + '</div>' : '') + '</div>' +
    '<div><button class="btn fill" type="submit">entrer →</button></div></form><div></div></div>';
  document.getElementById('dpin').focus();
  document.getElementById('df').addEventListener('submit', function (e) {
    e.preventDefault(); D.pin = document.getElementById('dpin').value.trim();
    loadDirRestos().then(function () { setStored('ilia-mep-dir', D.pin); })
      .catch(function (er) { D.pin = null; renderDirLogin(er.denied ? 'code incorrect.' : 'connexion impossible.'); });
  });
}
function loadDirRestos() {
  return api('dir_restaurants', { p_pin: D.pin }).then(function (r) {
    D.restos = r || []; var w = D.restos.filter(function (x) { return x.slug === 'washington'; })[0];
    D.rid = D.rid || (w ? w.id : D.restos[0].id); return loadDir();
  });
}
function loadDir() {
  var to = todayParis(), from = addDays(to, -(D.period - 1));
  return api('dir_analysis', { p_pin: D.pin, p_restaurant: D.rid, p_from: from, p_to: to }).then(function (d) { D.data = d || []; renderDir(); });
}
function renderDir() {
  document.body.className = '';
  var by = {}, days = {}, invDays = {};
  D.data.forEach(function (x) {
    days[x.day] = true; if (x.inventory_done) invDays[x.day] = true;
    var a = by[x.preparation_id] = by[x.preparation_id] || { name: x.name, cat: x.category, unit: x.unit_kind, gn11: x.gn11_kg, portion: x.portion_qty, n: 0, sold: 0, rec: 0, recN: 0, prep: 0, prepN: 0, left: 0, avail: 0, zero: 0, invN: 0, cons: 0, consSold: 0, follow: 0, followN: 0 };
    a.n++; a.sold += x.sold || 0;
    if (x.recommended != null) { a.rec += Number(x.recommended); a.recN++; }
    if (x.prepared != null) { a.prep += Number(x.prepared); a.prepN++; }
    if (x.recommended != null && x.prepared_confirmed) { a.followN++; if (Math.abs(Number(x.prepared) - Number(x.recommended)) <= 0.1 * Math.max(Number(x.recommended), 0.25)) a.follow++; }
    if (x.inventory_done) {
      a.invN++;
      var left = Number(x.leftover || 0), avail = Number(x.stock_start || 0) + Number(x.prepared || 0);
      a.left += left; a.avail += avail; if (left === 0 && x.sold > 0) a.zero++;
      if (x.prepared != null && x.sold > 0) { a.cons += avail - left; a.consSold += x.sold; }
    }
  });
  var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (a) { return a.sold > 0 || a.invN > 0; });
  var nDays = Object.keys(days).length, nInv = Object.keys(invDays).length;
  var tl = list.reduce(function (s, a) { return s + a.left; }, 0), ta = list.reduce(function (s, a) { return s + a.avail; }, 0);
  var fN = list.reduce(function (s, a) { return s + a.followN; }, 0), fOk = list.reduce(function (s, a) { return s + a.follow; }, 0);
  var zeros = list.reduce(function (s, a) { return s + a.zero; }, 0);
  var unit = function (a, v) { return a.unit === 'piece' ? fq(v) + ' pc' : (a.gn11 ? fq(v) + ' GN 1/1' : '–'); };

  var h = '<div class="wrap" style="max-width:1200px"><header class="top"><div class="row"><div><div class="kicker">direction</div>' +
    '<h1>la mise en place, <span class="it">au juste.</span></h1><div class="trait"></div></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><label class="kicker" style="display:flex;flex-direction:column;gap:4px">restaurant' +
    '<select id="drest" style="font-size:15px;font-weight:600;padding:10px 12px;min-height:44px;border:1px solid var(--line);border-radius:2px;background:var(--surface);color:var(--ink)">' +
    D.restos.map(function (r) { return '<option value="' + r.id + '"' + (r.id === D.rid ? ' selected' : '') + '>' + esc(low(r.name)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="kicker" style="display:flex;flex-direction:column;gap:4px">période<select id="dper" style="font-size:15px;font-weight:600;padding:10px 12px;min-height:44px;border:1px solid var(--line);border-radius:2px;background:var(--surface);color:var(--ink)">' +
    [[7, '7 derniers jours'], [28, '4 dernières semaines']].map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === D.period ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') +
    '</select></label></div></div></header>';
  h += '<section class="kpis"><div class="kpi"><span class="kicker">inventaires saisis</span><span class="v">' + nInv + ' / ' + nDays + '</span><span class="kicker">services de la période</span></div>' +
    '<div class="kpi"><span class="kicker">fiche suivie</span><span class="v">' + (fN ? Math.round(100 * fOk / fN) + ' %' : '–') + '</span><span class="kicker">préparé à ±10 % de la recommandation</span></div>' +
    '<div class="kpi"><span class="kicker">restes</span><span class="v">' + (ta ? Math.round(100 * tl / ta) + ' %' : '–') + '</span><span class="kicker">du disponible, en fin de service</span></div>' +
    '<div class="kpi"><span class="kicker">fins de service à zéro</span><span class="v">' + (nInv ? zeros : '–') + '</span><span class="kicker">rupture probable</span></div></section>';
  if (!nInv) h += '<div class="notice">' + ICON_INFO + '<div>pas encore d’inventaire de fin de service sur la période : les colonnes restes, verdict et grammage réel se rempliront au fil des saisies. les ventes zelty sont déjà là.</div></div>';
  h += '<section style="margin-top:24px"><div class="tbl"><table class="t"><thead><tr><th>préparation</th><th>poste</th><th class="r">vendu / jour</th>' +
    '<th class="r">recommandé / jour</th><th class="r">préparé / jour</th><th class="r">restes</th><th class="r">à zéro</th><th class="r">portion réelle</th><th>verdict</th></tr></thead><tbody>';
  CATS.forEach(function (c) {
    list.filter(function (a) { return a.cat === c[0]; }).forEach(function (a) {
      var leftPct = a.avail ? a.left / a.avail : null;
      var verdict = !a.invN ? '<span class="verdict v-nd">pas encore de données</span>' :
        (a.zero >= 2 ? '<span class="verdict v-pas">pas assez</span>' : (leftPct > 0.15 ? '<span class="verdict v-trop">↓ trop</span>' : '<span class="verdict v-juste">✓ juste</span>'));
      var real = (a.gn11 && a.consSold && a.unit === 'g') ? Math.round(a.cons * a.gn11 * 1000 / a.consSold) + ' g <span class="muted">/ ' + a.portion + '</span>' :
        (a.unit === 'piece' && a.consSold ? (Math.round(a.cons / a.consSold * 100) / 100).toLocaleString('fr-FR') + ' <span class="muted">/ ' + a.portion + '</span>' : '–');
      h += '<tr><td style="font-weight:700">' + esc(low(a.name)) + '</td><td class="muted">' + esc(c[1]) + '</td><td class="r">' + Math.round(a.sold / Math.max(a.n, 1)) + '</td>' +
        '<td class="r">' + (a.recN ? unit(a, a.rec / a.recN) : '–') + '</td><td class="r">' + (a.prepN ? unit(a, a.prep / a.prepN) : '–') + '</td>' +
        '<td class="r">' + (leftPct != null ? Math.round(leftPct * 100) + ' %' : '–') + '</td><td class="r">' + (a.invN ? a.zero : '–') + '</td><td class="r">' + real + '</td><td>' + verdict + '</td></tr>';
    });
  });
  h += '</tbody></table></div><p class="kicker" style="margin-top:12px;line-height:1.5;max-width:760px">trop : restes au-dessus de 15 % du disponible. pas assez : au moins deux fins de service à zéro. portion réelle : quantité consommée (stock de départ + préparé − restes) divisée par les portions vendues dans zelty.</p></section></div>';
  app.innerHTML = h;
  document.getElementById('drest').addEventListener('change', function (e) { D.rid = Number(e.target.value); loadDir(); });
  document.getElementById('dper').addEventListener('change', function (e) { D.period = Number(e.target.value); loadDir(); });
}

start();
})();
