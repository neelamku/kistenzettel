import QRCode from 'qrcode';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { auth, db, googleProvider, OWNER_EMAIL } from './firebase.js';

const ROOM_TAGS = ['Küche', 'Schlafzimmer', 'Wohnzimmer', 'Badezimmer', 'Garage', 'Büro', 'Kinderzimmer', 'Sonstiges'];
const TAG_HUES = [205, 150, 28, 265, 92, 235, 340, 45];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const view = document.getElementById('view');
const authSlot = document.getElementById('auth-slot');
const printRoot = document.getElementById('print-root');
const toastEl = document.getElementById('toast');

let currentUser = null;
let isOwner = false;
let authReady = false;

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tagHue(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_HUES[h % TAG_HUES.length];
}

function genCode() {
  let out = '';
  for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

function baseUrl() {
  return location.origin + location.pathname;
}

function boxLink(code) {
  return baseUrl() + '#box=' + code;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function localCheckKey(code) {
  return `kistenzettel.local-check.${code}`;
}

function loadLocalChecks(code) {
  try {
    const raw = localStorage.getItem(localCheckKey(code));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalChecks(code, map) {
  try {
    localStorage.setItem(localCheckKey(code), JSON.stringify(map));
  } catch {
    /* Speicher nicht verfügbar (z. B. privater Modus) -- einfach ignorieren. */
  }
}

async function qrImgSrc(text) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#1a1208', light: '#ffffffff' },
  });
}

function labelTicketHtml(box, imgId) {
  const hue = tagHue(box.tag);
  return `
    <div class="label-ticket">
      <div class="label-top">
        <span class="tag-pill" style="--tagH:${hue}">${escapeHtml(box.tag)}</span>
        ${box.fragile ? '<span class="fragile-stamp">Zerbrechlich</span>' : ''}
      </div>
      <div class="label-qr"><img id="${imgId}" alt="QR-Code für Kiste ${escapeHtml(box.code)}" /></div>
      <div class="label-code mono">${escapeHtml(box.code)}</div>
    </div>
  `;
}

async function printBoxes(boxes) {
  const html = `<div class="label-grid">${boxes.map((b, i) => labelTicketHtml(b, 'print-qr-' + i)).join('')}</div>`;
  printRoot.innerHTML = html;
  await Promise.all(boxes.map(async (b, i) => {
    $('print-qr-' + i).src = await qrImgSrc(boxLink(b.code));
  }));
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

// ---------------- Kopfzeile / Anmeldung ----------------

function renderAuthSlot() {
  if (!authReady) {
    authSlot.innerHTML = '';
    return;
  }
  if (currentUser) {
    authSlot.innerHTML = `
      <span class="auth-user">
        ${isOwner ? '<span class="owner-badge">Besitzerin</span>' : ''}
        ${escapeHtml(currentUser.email || '')}
      </span>
      <button class="btn btn-ghost btn-small" id="signout-btn">Abmelden</button>
    `;
    $('signout-btn').addEventListener('click', () => signOut(auth));
  } else {
    authSlot.innerHTML = '<button class="btn btn-secondary btn-small" id="signin-btn">Anmelden</button>';
    $('signin-btn').addEventListener('click', handleSignIn);
  }
}

async function handleSignIn() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    showToast('Anmeldung fehlgeschlagen: ' + (err.message || err.code));
  }
}

// ---------------- Startseite ----------------

let selectedTag = ROOM_TAGS[0];
let lastBatch = [];

function homeHtml() {
  return `
    <section class="card generator">
      <h2>Neue Etiketten erstellen</h2>
      <form id="batch-form">
        <div class="field">
          <label>Kategorie</label>
          <div class="chip-row" id="tag-chips"></div>
          <input type="text" id="tag-custom" placeholder="Eigene Kategorie…" hidden />
        </div>
        <div class="field-row">
          <label class="switch"><input type="checkbox" id="fragile-toggle" /> Alle als zerbrechlich markieren</label>
          <label class="stepper">Etiketten <input type="number" id="qty" min="1" max="24" value="6" /></label>
        </div>
        <div class="generator-actions">
          <button type="submit" class="btn btn-primary" id="create-btn">Etiketten erstellen</button>
        </div>
      </form>
      <p class="hint" style="margin-top:14px;">Jeder mit einem gescannten Code kann die Liste dieser Kiste ansehen. Nur du kannst Listen erstellen oder bearbeiten.</p>
    </section>
    <section class="card batch-preview" id="batch-preview" hidden>
      <div class="batch-preview-head">
        <h2>Bereit zum Drucken</h2>
        <button class="btn btn-secondary" id="print-batch-btn">Diese Etiketten drucken</button>
      </div>
      <div class="label-grid" id="batch-grid"></div>
    </section>
    <section class="recent">
      <div class="recent-head">
        <h2>Kisten</h2>
        <span class="recent-stats" id="recent-stats"></span>
      </div>
      <div id="box-grid-wrap"><p class="loading">Kisten werden geladen&hellip;</p></div>
    </section>
  `;
}

function renderTagChips() {
  const row = $('tag-chips');
  row.innerHTML = ROOM_TAGS.map((t) => `<button type="button" class="chip" data-tag="${escapeHtml(t)}" aria-pressed="${t === selectedTag ? 'true' : 'false'}">${escapeHtml(t)}</button>`).join('')
    + '<button type="button" class="chip" id="chip-custom" aria-pressed="false">Eigene…</button>';

  row.querySelectorAll('.chip[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTag = btn.dataset.tag;
      $('tag-custom').hidden = true;
      row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
    });
  });
  $('chip-custom').addEventListener('click', () => {
    row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    $('chip-custom').setAttribute('aria-pressed', 'true');
    const custom = $('tag-custom');
    custom.hidden = false;
    custom.focus();
    selectedTag = custom.value.trim() || 'Sonstiges';
  });
  $('tag-custom').addEventListener('input', (e) => {
    selectedTag = e.target.value.trim() || 'Sonstiges';
  });
}

function boxCardHtml(box) {
  const hue = tagHue(box.tag);
  const packed = box.items && box.items.length > 0;
  return `
    <a class="box-card" href="#box=${encodeURIComponent(box.code)}">
      <div class="box-card-top">
        <span class="tag-pill" style="--tagH:${hue}">${escapeHtml(box.tag)}</span>
        ${box.fragile ? '<span class="fragile-dot" title="Zerbrechlich"></span>' : ''}
      </div>
      <div class="box-card-code mono">${escapeHtml(box.code)}</div>
      <div class="box-card-status ${packed ? 'is-packed' : 'is-empty'}">
        ${packed ? box.items.length + (box.items.length === 1 ? ' Artikel' : ' Artikel') : 'Leer — scannen zum Befüllen'}
      </div>
    </a>
  `;
}

async function loadRecentBoxes() {
  const wrap = $('box-grid-wrap');
  if (!wrap) return;
  try {
    const q = query(collection(db, 'boxes'), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    const boxes = snap.docs.map((d) => d.data());
    const stats = $('recent-stats');
    if (boxes.length === 0) {
      if (stats) stats.textContent = '';
      wrap.innerHTML = '<div class="empty-panel">Noch keine Kisten. Erstelle oben einen Satz Etiketten, drucke sie aus und klebe sie auf deine Kisten.</div>';
      return;
    }
    const packed = boxes.filter((b) => b.items && b.items.length).length;
    if (stats) stats.textContent = `${boxes.length} Kisten · ${packed} gepackt · ${boxes.length - packed} leer`;
    wrap.innerHTML = `<div class="box-grid">${boxes.map(boxCardHtml).join('')}</div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="banner">Kisten konnten nicht geladen werden (${escapeHtml(err.message || err.code || 'unbekannter Fehler')}).</div>`;
  }
}

function renderPublicLanding() {
  view.innerHTML = `
    <div class="public-landing">
      <svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M20 4 L35 11.5 L35 28.5 L20 36 L5 28.5 L5 11.5 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M5 11.5 L20 19 L35 11.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M20 19 L20 36" stroke="currentColor" stroke-width="2"/>
      </svg>
      <h2>Kistenzettel</h2>
      <p>Diese Seite verwaltet QR-Etiketten für Umzugskisten. Um eine bestimmte Kiste zu sehen, scanne den QR-Code auf ihrem Etikett. Neue Etiketten erstellen kann nur die Besitzerin.</p>
      <button class="btn btn-primary" id="landing-signin-btn">Als Besitzerin anmelden</button>
    </div>
  `;
  $('landing-signin-btn').addEventListener('click', handleSignIn);
}

function renderHome() {
  if (!isOwner) {
    renderPublicLanding();
    return;
  }
  view.innerHTML = homeHtml();
  renderTagChips();

  $('batch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = Math.max(1, Math.min(24, parseInt($('qty').value, 10) || 1));
    const fragile = $('fragile-toggle').checked;
    const tag = selectedTag || 'Sonstiges';
    const btn = $('create-btn');
    btn.disabled = true;
    btn.textContent = 'Wird erstellt…';

    try {
      const boxes = await createBatch(tag, fragile, qty);
      lastBatch = boxes;
      const preview = $('batch-preview');
      preview.hidden = false;
      $('batch-grid').innerHTML = boxes.map((b, i) => labelTicketHtml(b, 'batch-qr-' + i)).join('');
      await Promise.all(boxes.map(async (b, i) => {
        $('batch-qr-' + i).src = await qrImgSrc(boxLink(b.code));
      }));
      preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      loadRecentBoxes();
      showToast(`${qty} Etikett${qty === 1 ? '' : 'en'} erstellt`);
    } catch (err) {
      showToast('Etiketten konnten nicht erstellt werden: ' + (err.message || err.code || 'bitte erneut versuchen'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Etiketten erstellen';
    }
  });

  $('print-batch-btn').addEventListener('click', () => {
    if (lastBatch.length) printBoxes(lastBatch);
  });

  loadRecentBoxes();
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode();
    const snap = await getDoc(doc(db, 'boxes', code));
    if (!snap.exists()) return code;
  }
  throw new Error('Konnte keinen eindeutigen Code erzeugen');
}

async function createBatch(tag, fragile, qty) {
  const created = [];
  for (let i = 0; i < qty; i++) {
    const code = await uniqueCode();
    const now = new Date().toISOString();
    const data = { code, tag, fragile: !!fragile, items: [], notes: '', createdAt: now, updatedAt: now };
    await setDoc(doc(db, 'boxes', code), data);
    created.push(data);
  }
  return created;
}

// ---------------- Kistenansicht ----------------

function manifestHeadHtml(box) {
  const hue = tagHue(box.tag);
  const packed = box.items && box.items.length > 0;
  return `
    <div class="manifest-qr"><img id="detail-qr" alt="QR-Code für Kiste ${escapeHtml(box.code)}" /></div>
    <div class="manifest-id">
      <div class="manifest-badges">
        <span class="tag-pill" style="--tagH:${hue}">${escapeHtml(box.tag)}</span>
        ${box.fragile ? '<span class="fragile-stamp">Zerbrechlich</span>' : ''}
      </div>
      <div class="manifest-code">${escapeHtml(box.code)}</div>
      <div class="manifest-meta">Erstellt am ${formatDate(box.createdAt)}${packed ? ' · ' + box.items.length + ' Artikel' : ' · leer'}</div>
    </div>
  `;
}

function itemsFormHtml(box) {
  const itemsText = (box.items || []).map((it) => it.text).join('\n');
  return `
    <form class="items-form" id="items-form">
      <div>
        <label>Artikel — eine Zeile pro Eintrag</label>
        <textarea id="items-input" placeholder="Wintermäntel&#10;Brettspiele&#10;Bilderrahmen">${escapeHtml(itemsText)}</textarea>
      </div>
      <div>
        <label>Notizen (optional)</label>
        <input type="text" id="notes-input" value="${escapeHtml(box.notes || '')}" placeholder="z. B. nicht stapeln" />
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Liste speichern</button>
        ${(box.items && box.items.length) ? '<button type="button" class="btn btn-ghost" id="cancel-edit-btn">Abbrechen</button>' : ''}
      </div>
    </form>
  `;
}

function checklistHtml(box, editable) {
  return `
    <ul class="check-list ${editable ? '' : 'readonly'}" id="check-list">
      ${box.items.map((it, i) => `
        <li>
          <label>
            <input type="checkbox" data-idx="${i}" ${it.checked ? 'checked' : ''} ${editable ? '' : 'data-readonly="1"'} />
            <span class="${it.checked ? 'checked-text' : ''}">${escapeHtml(it.text)}</span>
          </label>
        </li>
      `).join('')}
    </ul>
    ${box.notes ? `<div class="manifest-notes">${escapeHtml(box.notes)}</div>` : ''}
    ${!editable ? '<p class="readonly-note">Häkchen hier sind nur auf diesem Gerät gespeichert, nicht für alle sichtbar.</p>' : ''}
  `;
}

async function renderBox(code) {
  view.innerHTML = `<p class="loading">Kiste ${escapeHtml(code)} wird geöffnet&hellip;</p>`;
  try {
    const snap = await getDoc(doc(db, 'boxes', code));
    if (!snap.exists()) {
      view.innerHTML = `
        <a href="#" class="back-link">← Alle Kisten</a>
        <div class="banner">Keine Kiste mit dem Code <strong class="mono">${escapeHtml(code)}</strong> gefunden. Sie wurde vielleicht gelöscht, oder das Etikett stammt nicht von dieser Seite.</div>
      `;
      return;
    }
    const box = snap.data();
    if (!isOwner) {
      const local = loadLocalChecks(code);
      box.items = (box.items || []).map((it) => ({ ...it, checked: local[it.text] ?? it.checked }));
    }
    renderBoxView(box, false);
  } catch (err) {
    view.innerHTML = `<div class="banner">Kiste konnte nicht geöffnet werden (${escapeHtml(err.message || err.code || 'unbekannter Fehler')}).</div>`;
  }
}

function renderBoxView(box, editing) {
  const packed = box.items && box.items.length > 0;
  const showForm = isOwner && (editing || !packed);

  view.innerHTML = `
    <a href="#" class="back-link">← Alle Kisten</a>
    <section class="manifest-card">
      <div class="manifest-head">${manifestHeadHtml(box)}</div>
      ${showForm ? itemsFormHtml(box) : (packed ? checklistHtml(box, isOwner) : '<p class="readonly-note">Diese Kiste ist noch leer — die Besitzerin hat noch keine Liste gespeichert.</p>')}
      <div class="manifest-actions">
        <button class="btn btn-secondary" id="print-one-btn">Dieses Etikett drucken</button>
        ${isOwner && !showForm && packed ? '<button class="btn btn-ghost" id="edit-btn">Liste bearbeiten</button>' : ''}
        ${isOwner ? '<button class="btn btn-danger" id="delete-btn">Kiste löschen</button>' : ''}
      </div>
    </section>
  `;

  qrImgSrc(boxLink(box.code)).then((src) => { $('detail-qr').src = src; });

  $('print-one-btn').addEventListener('click', () => printBoxes([box]));

  const deleteBtn = $('delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Kiste ${box.code} löschen? Das kann nicht rückgängig gemacht werden.`)) return;
      try {
        await deleteDoc(doc(db, 'boxes', box.code));
        showToast('Kiste gelöscht');
        location.hash = '';
      } catch (err) {
        showToast('Löschen fehlgeschlagen: ' + (err.message || err.code));
      }
    });
  }

  if (showForm) {
    const form = $('items-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = $('items-input').value;
      const notes = $('notes-input').value.trim();
      const prevMap = {};
      (box.items || []).forEach((it) => { prevMap[it.text] = it.checked; });
      const items = raw.split('\n').map((s) => s.trim()).filter(Boolean)
        .map((text) => ({ text, checked: prevMap[text] || false }));

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gespeichert…';
      try {
        await updateDoc(doc(db, 'boxes', box.code), { items, notes, updatedAt: new Date().toISOString() });
        box.items = items;
        box.notes = notes;
        showToast('Liste gespeichert');
        renderBoxView(box, false);
      } catch (err) {
        showToast('Speichern fehlgeschlagen: ' + (err.message || err.code));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Liste speichern';
      }
    });
    const cancelBtn = $('cancel-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderBoxView(box, false));
  } else if (packed) {
    const editBtn = $('edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => renderBoxView(box, true));

    let busy = false;
    $('check-list').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const idx = parseInt(cb.dataset.idx, 10);
        if (!isOwner) {
          const local = loadLocalChecks(box.code);
          local[box.items[idx].text] = cb.checked;
          saveLocalChecks(box.code, local);
          cb.nextElementSibling.className = cb.checked ? 'checked-text' : '';
          return;
        }
        if (busy) { cb.checked = !cb.checked; return; }
        const items = box.items.map((it, i) => (i === idx ? { text: it.text, checked: cb.checked } : it));
        busy = true;
        $('check-list').querySelectorAll('input[type="checkbox"]').forEach((c) => { c.disabled = true; });
        try {
          await updateDoc(doc(db, 'boxes', box.code), { items, updatedAt: new Date().toISOString() });
          box.items = items;
          cb.nextElementSibling.className = cb.checked ? 'checked-text' : '';
        } catch (err) {
          cb.checked = !cb.checked;
          showToast('Speichern fehlgeschlagen: ' + (err.message || err.code));
        } finally {
          busy = false;
          $('check-list').querySelectorAll('input[type="checkbox"]').forEach((c) => { c.disabled = false; });
        }
      });
    });
  }
}

// ---------------- Routing ----------------

function currentBoxCode() {
  const m = /(?:^|[#&])box=([^&]+)/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

function route() {
  const code = currentBoxCode();
  if (code) renderBox(code);
  else renderHome();
}

window.addEventListener('hashchange', route);

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  isOwner = !!(user && user.email === OWNER_EMAIL);
  authReady = true;
  renderAuthSlot();
  route();
});
