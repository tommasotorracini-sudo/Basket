/* Campetti — prototipo PWA per la tesi.
   Dati reali: i campi da basket di OpenStreetMap (via Overpass).
   Dati simulati: presenze, partite (raid) e chat, generati nel telefono. */
(function () {
  'use strict';
  const C = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const MIN = 60 * 1000;

  /* ---------- memoria locale (può mancare: tutto funziona anche senza) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('campetti:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('campetti:' + k, JSON.stringify(v)); } catch (e) { /* niente */ } },
    clear() { try { Object.keys(localStorage).filter(k => k.startsWith('campetti:')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* niente */ } }
  };

  const state = {
    courts: [],
    byId: {},
    filters: new Set(),
    profile: store.get('profile', { nickname: '', position: '' }),
    presence: store.get('presence', null),   // {courtId, type:'here'|'arriving', until}
    raids: store.get('raids', []),
    chats: store.get('chats', {}),
    history: store.get('history', []),
    sessions: store.get('sessions', []),
    current: null,                            // campo aperto nella scheda
    tab: 'now',
    me: null
  };
  const myName = () => state.profile.nickname.trim() || 'Tu';

  /* ---------- utilità ---------- */
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hhmm(ts) { return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800); }
  function distance(a, b) {
    const R = 6371e3, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }

  /* ---------- traduzione dei dati OpenStreetMap ---------- */
  const SURFACE = {
    asphalt: 'asfalto', concrete: 'cemento', 'concrete:plates': 'lastre di cemento', paved: 'pavimentato',
    paving_stones: 'autobloccanti', acrylic: 'resina acrilica', tartan: 'tartan', rubber: 'gomma',
    artificial_turf: 'erba sintetica', wood: 'parquet', grass: 'erba', ground: 'terra', dirt: 'terra',
    compacted: 'terra battuta', unpaved: 'non pavimentato', sand: 'sabbia', gravel: 'ghiaia'
  };
  const ACCESS = { yes: 'libero', public: 'libero', permissive: 'consentito', customers: 'solo clienti', private: 'privato', no: 'non accessibile', destination: 'consentito' };
  const HARD = ['asphalt', 'concrete', 'concrete:plates', 'paved', 'acrylic'];

  function toCourt(el) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) return null;
    const id = el.type + '/' + el.id;
    return {
      id, osmType: el.type, osmId: el.id, lat, lon, tags: t,
      name: t.name || 'Campo da basket',
      street: t['addr:street'] || '',
      surface: t.surface ? (SURFACE[t.surface] || t.surface) : null,
      lit: t.lit === 'yes' ? true : t.lit === 'no' ? false : null,
      hoops: t.hoops || null,
      access: t.access ? (ACCESS[t.access] || t.access) : null,
      covered: t.covered === 'yes' || t.indoor === 'yes',
      isHard: HARD.includes(t.surface),
      isPublic: !['private', 'no', 'customers'].includes(t.access)
    };
  }

  /* ---------- simulazione: presenze ---------- */
  function activityFactor(d = new Date()) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < 8 || h >= 23) return 0;
    if (h < 14) return 0.25;
    if (h < 17) return 0.55;
    if (h < 21) return 1;
    return 0.5;
  }
  function presenceFor(court) {
    const h = hash(court.id + new Date().toDateString());
    const f = activityFactor();
    let here = Math.round(((h % 9)) * f * ((h >> 5) % 3 === 0 ? 0 : 1));
    let arriving = f > 0.3 ? (h >> 9) % 3 : 0;
    const p = activePresence();
    if (p && p.courtId === court.id) { if (p.type === 'here') here++; else arriving++; }
    return { here, arriving };
  }
  function activePresence() {
    if (state.presence && state.presence.until > Date.now()) return state.presence;
    if (state.presence) { state.presence = null; store.set('presence', null); }
    return null;
  }

  /* ---------- simulazione: partite (raid) ---------- */
  const FORMATS = { '1c1': 2, '2c2': 4, '3c3': 6, '5c5': 10 };
  const NICKS = ['Ale', 'Teo', 'Giuly', 'Marco B.', 'Fede', 'Sami', 'Luca', 'Nico', 'Ste', 'Ibra', 'Matti', 'Dani', 'Sofi', 'Omar', 'Pietro', 'Chiara'];

  function seedRaids(courts) {
    const now = Date.now();
    const seeded = new Set(state.raids.map(r => r.courtId));
    courts.forEach(c => {
      if (seeded.has(c.id)) return;
      const h = hash(c.id + 'raid' + new Date().toDateString());
      if (h % 4 !== 0 || activityFactor() === 0) return;
      const fmt = Object.keys(FORMATS)[(h >> 3) % 4];
      const need = FORMATS[fmt];
      const start = Math.ceil((now + (30 + (h >> 6) % 120) * MIN) / (15 * MIN)) * 15 * MIN;
      const n = 1 + ((h >> 11) % (need - 1));
      const players = Array.from({ length: n }, (_, i) => NICKS[(h + i * 7) % NICKS.length]);
      state.raids.push({ id: 'sim-' + c.id + '-' + start, courtId: c.id, courtName: c.name, format: fmt, need, start, deadline: start - 30 * MIN, players: [...new Set(players)], simulated: true });
    });
    pruneRaids();
  }
  function pruneRaids() {
    const now = Date.now();
    state.raids = state.raids.filter(r => r.start + 90 * MIN > now);
    store.set('raids', state.raids);
  }
  function raidStatus(r) {
    const now = Date.now();
    if (r.players.length >= r.need) return now >= r.start ? { key: 'live', label: 'In corso' } : { key: 'ok', label: 'Confermata' };
    if (now > r.deadline) return { key: 'off', label: 'Annullata: soglia non raggiunta' };
    return { key: 'open', label: 'Mancano ' + (r.need - r.players.length) };
  }
  function joinRaid(id) {
    const r = state.raids.find(x => x.id === id); if (!r) return;
    const me = myName();
    if (r.players.includes(me)) {
      r.players = r.players.filter(p => p !== me);
      state.history = state.history.filter(hh => hh.raidId !== r.id);
      toast('Ti sei tolto dalla partita');
    } else {
      if (raidStatus(r).key === 'off' || r.players.length >= r.need) return;
      r.players.push(me);
      state.history.unshift({ raidId: r.id, format: r.format, courtName: r.courtName, start: r.start });
      toast(r.players.length >= r.need ? 'Partita confermata! Avviso inviato agli iscritti' : 'Iscritto. Ti avvisiamo quando si raggiunge il numero');
    }
    store.set('raids', state.raids); store.set('history', state.history);
    refresh();
  }

  /* ---------- simulazione: chat del campo ---------- */
  function chatFor(court) {
    if (!state.chats[court.id]) {
      const h = hash(court.id + 'chat');
      const lines = [
        ['qualcuno stasera?', 'io dalle 18', 'ci sono anche io, porto il pallone'],
        ['il canestro di destra ha la retina rotta', 'segnalato al comune, vediamo'],
        ['domenica mattina 3c3?', 'ci sto', 'serve uno, chi c\'è?'],
        ['luci accese fino alle 22?', 'sì, d\'estate sì']
      ][h % 4];
      state.chats[court.id] = lines.map((t, i) => ({ who: NICKS[(h + i * 5) % NICKS.length], text: t, ts: Date.now() - (lines.length - i) * 37 * MIN }));
    }
    return state.chats[court.id];
  }

  /* ---------- mappa ---------- */
  let map, layer, meMarker;
  function initMap() {
    if (!window.L) { $('#mapStatus').textContent = 'Mappa non disponibile: serve la connessione'; return; }
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView(C.center, C.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributori di OpenStreetMap</a>'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    loadCourts();
  }

  async function loadCourts() {
    if (!map) return;
    if (map.getZoom() < 12) { $('#mapStatus').textContent = 'Avvicinati per cercare i campi'; return; }
    const b = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(n => n.toFixed(4)).join(',');
    const q = `[out:json][timeout:25];nwr["leisure"="pitch"]["sport"~"basketball"](${bbox});out center tags;`;
    $('#mapStatus').textContent = 'Cerco i campi…';
    try {
      const res = await fetch(C.overpassUrl, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const found = data.elements.map(toCourt).filter(Boolean);
      found.forEach(c => { if (!state.byId[c.id]) { state.byId[c.id] = c; state.courts.push(c); } });
      seedRaids(found);
      $('#mapStatus').textContent = found.length ? '' : 'Nessun campo in quest\'area';
      if (found.length) { $('#mapStatus').textContent = found.length + (found.length === 1 ? ' campo' : ' campi') + ' trovati'; setTimeout(() => { $('#mapStatus').textContent = ''; }, 2000); }
      refresh();
    } catch (e) {
      $('#mapStatus').textContent = 'Non riesco a caricare i campi, riprova tra poco';
    }
  }

  function visibleCourts() {
    return state.courts.filter(c => {
      if (state.filters.has('lit') && c.lit !== true) return false;
      if (state.filters.has('hard') && !c.isHard) return false;
      if (state.filters.has('public') && !c.isPublic) return false;
      if (state.filters.has('busy') && presenceFor(c).here === 0) return false;
      return true;
    });
  }

  function drawMarkers() {
    if (!layer) return;
    layer.clearLayers();
    visibleCourts().forEach(c => {
      const p = presenceFor(c);
      const icon = L.divIcon({ className: '', html: `<div class="court-pin${p.here ? ' is-live' : ''}">${p.here || ''}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([c.lat, c.lon], { icon, title: c.name, keyboard: true }).on('click', () => openCourt(c.id)).addTo(layer);
    });
  }

  function locate() {
    if (!navigator.geolocation) { toast('Posizione non disponibile su questo dispositivo'); return; }
    $('#mapStatus').textContent = 'Cerco la tua posizione…';
    navigator.geolocation.getCurrentPosition(pos => {
      state.me = [pos.coords.latitude, pos.coords.longitude];
      $('#mapStatus').textContent = '';
      if (!map) return;
      if (meMarker) meMarker.remove();
      meMarker = L.circleMarker(state.me, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      map.setView(state.me, 15);
      loadCourts();
    }, () => { $('#mapStatus').textContent = ''; toast('Posizione non concessa: puoi muovere la mappa a mano'); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  /* ---------- scheda del campo ---------- */
  function openCourt(id, tab = 'now') {
    state.current = state.byId[id]; if (!state.current) return;
    state.tab = tab;
    const c = state.current;
    $('#sheetTitle').textContent = c.name;
    const bits = [];
    if (state.me) bits.push(fmtDist(distance(state.me, [c.lat, c.lon])));
    if (c.street) bits.push(c.street);
    if (c.surface) bits.push(c.surface);
    $('#sheetSub').textContent = bits.join(' · ');
    $('#sheet').hidden = false;
    renderSheet();
  }
  function closeSheet() { $('#sheet').hidden = true; state.current = null; }

  function renderSheet() {
    const c = state.current; if (!c) return;
    $$('.tab').forEach(t => { const on = t.dataset.tab === state.tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
    const body = $('#sheetBody');
    if (state.tab === 'now') body.innerHTML = tplNow(c);
    if (state.tab === 'games') body.innerHTML = tplGames(c);
    if (state.tab === 'chat') { body.innerHTML = tplChat(c); body.scrollTop = body.scrollHeight; }
    if (state.tab === 'info') body.innerHTML = tplInfo(c);
  }

  function tplNow(c) {
    const p = presenceFor(c);
    const mine = activePresence();
    const isMine = mine && mine.courtId === c.id;
    const elsewhere = mine && mine.courtId !== c.id;
    return `
      <div class="now">
        <div class="stat"><div class="stat__n">${p.here}</div><div class="stat__l">giocano ora</div></div>
        <div class="stat"><div class="stat__n">${p.arriving}</div><div class="stat__l">stanno arrivando</div></div>
      </div>
      ${isMine ? `<div class="mine">${mine.type === 'here' ? 'Hai segnalato che sei qui' : 'Hai segnalato che stai arrivando'}. La segnalazione scade alle ${hhmm(mine.until)}.</div>` : ''}
      ${elsewhere ? `<div class="mine">Hai una segnalazione attiva su un altro campo: se ne fai una qui, l'altra si annulla.</div>` : ''}
      <div class="btn-row">
        <button type="button" class="btn ${isMine && mine.type === 'here' ? 'btn--primary' : ''}" data-act="here">Sono qui</button>
        <button type="button" class="btn ${isMine && mine.type === 'arriving' ? 'btn--primary' : ''}" data-act="arriving">Sto arrivando</button>
      </div>
      ${isMine ? '<button type="button" class="btn btn--block" data-act="cancel">Annulla segnalazione</button>' : ''}
      <p class="muted small">Gli altri vedono solo il numero, non chi sei. "Sono qui" scade dopo ${C.checkinMinutes / 60} ore, "Sto arrivando" dopo ${C.arrivingMinutes} minuti.</p>
      <button type="button" class="btn btn--primary btn--block" data-act="tab-games">Vedi o crea una partita</button>`;
  }

  function raidCard(r, withCourt) {
    const st = raidStatus(r);
    const me = myName();
    const joined = r.players.includes(me);
    const full = r.players.length >= r.need;
    const cls = st.key === 'ok' ? 'badge--ok' : st.key === 'live' ? 'badge--live' : '';
    const canJoin = joined || (!full && st.key === 'open');
    return `
      <article class="game">
        <div class="game__top"><span class="game__format">${r.format.replace('c', ' contro ')}</span><span class="badge ${cls}">${st.label}</span></div>
        ${withCourt ? `<div class="game__court">${esc(r.courtName)}</div>` : ''}
        <div>Inizio ${hhmm(r.start)} · conferma entro le ${hhmm(r.deadline)}</div>
        <div class="meter" aria-label="${r.players.length} su ${r.need}"><span style="width:${Math.min(100, r.players.length / r.need * 100)}%"></span></div>
        <div class="muted small">${r.players.length}/${r.need} · ${r.players.map(esc).join(', ')}</div>
        <div class="btn-row">
          ${withCourt ? `<button type="button" class="btn" data-open="${esc(r.courtId)}">Apri campo</button>` : ''}
          <button type="button" class="btn ${joined ? '' : 'btn--primary'}" data-join="${esc(r.id)}" ${canJoin ? '' : 'disabled'}>${joined ? 'Esci' : 'Partecipa'}</button>
        </div>
      </article>`;
  }

  function tplGames(c) {
    const list = state.raids.filter(r => r.courtId === c.id).sort((a, b) => a.start - b.start);
    return `
      ${list.length ? list.map(r => raidCard(r, false)).join('') : '<p class="empty">Nessuna partita in programma su questo campo.</p>'}
      <form class="card" id="raidForm">
        <h2>Crea una partita</h2>
        <div class="seg" role="group" aria-label="Formato">
          ${Object.keys(FORMATS).map((f, i) => `<button type="button" data-fmt="${f}" aria-pressed="${i === 2}">${f.replace('c', 'c')}</button>`).join('')}
        </div>
        <label class="field">Quando
          <select name="when">
            <option value="30">Tra 30 minuti</option>
            <option value="60" selected>Tra 1 ora</option>
            <option value="120">Tra 2 ore</option>
            <option value="180">Tra 3 ore</option>
          </select>
        </label>
        <p class="muted small">La partita si conferma quando si raggiunge il numero di giocatori. Se 30 minuti prima dell'inizio mancano persone, si annulla e gli iscritti vengono avvisati.</p>
        <button type="submit" class="btn btn--primary btn--block">Crea e partecipa</button>
      </form>`;
  }

  function tplChat(c) {
    const msgs = chatFor(c);
    const me = myName();
    return `
      <div class="chat">${msgs.map(m => `<div class="msg ${m.who === me ? 'msg--me' : ''}"><div class="msg__who">${esc(m.who)} · ${hhmm(m.ts)}</div>${esc(m.text)}</div>`).join('')}</div>
      <form class="chat-form" id="chatForm">
        <input type="text" name="text" maxlength="200" placeholder="Scrivi a chi gioca qui" autocomplete="off" aria-label="Messaggio">
        <button type="submit" class="btn btn--primary">Invia</button>
      </form>
      <p class="muted small">Chat simulata: i messaggi restano solo su questo telefono.</p>`;
  }

  function tplInfo(c) {
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v == null || v === '' ? '<span class="muted">non indicato</span>' : esc(v)}</dd></div>`;
    return `
      <dl class="info">
        ${row('Pavimentazione', c.surface)}
        ${row('Illuminazione', c.lit == null ? null : c.lit ? 'sì' : 'no')}
        ${row('Canestri', c.hoops)}
        ${row('Accesso', c.access)}
        ${row('Coperto', c.covered ? 'sì' : null)}
      </dl>
      <p class="muted small">Dati di OpenStreetMap, inseriti da volontari. Se qualcosa manca o è cambiato, puoi correggerlo.</p>
      <div class="btn-row">
        <a class="btn" href="https://www.openstreetmap.org/${c.osmType}/${c.osmId}" target="_blank" rel="noopener">Vedi su OSM</a>
        <a class="btn" href="https://www.openstreetmap.org/edit?${c.osmType}=${c.osmId}" target="_blank" rel="noopener">Segnala una modifica</a>
      </div>
      <a class="btn btn--block" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener">Indicazioni stradali</a>`;
  }

  /* ---------- viste ---------- */
  function renderGamesView() {
    const list = state.raids.filter(r => raidStatus(r).key !== 'off').sort((a, b) => a.start - b.start);
    $('#gamesList').innerHTML = list.length
      ? list.map(r => raidCard(r, true)).join('')
      : '<p class="empty">Nessuna partita nei campi caricati. Apri un campo sulla mappa per crearne una.</p>';
  }
  function renderHistory() {
    $('#history').innerHTML = state.history.length
      ? state.history.slice(0, 20).map(h => `<div class="game"><div class="game__top"><strong>${h.format.replace('c', ' contro ')}</strong><span class="muted small">${new Date(h.start).toLocaleDateString('it-IT')} ${hhmm(h.start)}</span></div><div class="game__court">${esc(h.courtName)}</div></div>`).join('')
      : '<p class="muted">Ancora nessuna partita. Lo storico aiuta chi gioca spesso nello stesso campo a riconoscersi.</p>';
  }
  function renderTraining() {
    const s = state.sessions.slice(-10);
    $('#ftBars').innerHTML = s.length
      ? s.map(x => `<div class="bar" style="height:${x.made * 10}%" title="${new Date(x.ts).toLocaleDateString('it-IT')}"><span>${x.made}</span></div>`).join('')
      : '<p class="muted small">Nessuna sessione salvata.</p>';
  }
  function refresh() {
    drawMarkers();
    renderGamesView();
    renderHistory();
    if (state.current) renderSheet();
  }
  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tabbar__item').forEach(b => { const on = b.dataset.view === name; b.classList.toggle('is-active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 0);
    if (name === 'games') { pruneRaids(); renderGamesView(); }
  }

  /* ---------- eventi ---------- */
  function bind() {
    $$('.tabbar__item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    const fitBanner = () => { const b = $('#demoBanner'); document.documentElement.style.setProperty('--banner-h', b.hidden ? '0px' : b.offsetHeight + 'px'); };
    $('#closeBanner').addEventListener('click', () => { $('#demoBanner').hidden = true; store.set('bannerClosed', true); fitBanner(); });
    if (store.get('bannerClosed', false)) $('#demoBanner').hidden = true;
    fitBanner(); window.addEventListener('resize', fitBanner);

    $$('.chip').forEach(ch => ch.addEventListener('click', () => {
      const f = ch.dataset.filter;
      state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
      ch.setAttribute('aria-pressed', state.filters.has(f));
      drawMarkers();
    }));
    $('#searchArea').addEventListener('click', loadCourts);
    $('#locate').addEventListener('click', locate);

    $('#sheet').addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { closeSheet(); return; }
      const tab = e.target.closest('.tab'); if (tab) { state.tab = tab.dataset.tab; renderSheet(); return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act, c = state.current;
        if (a === 'here' || a === 'arriving') {
          const mins = a === 'here' ? C.checkinMinutes : C.arrivingMinutes;
          state.presence = { courtId: c.id, type: a, until: Date.now() + mins * MIN };
          store.set('presence', state.presence);
          toast(a === 'here' ? 'Segnalato: sei al campo' : 'Segnalato: stai arrivando');
        }
        if (a === 'cancel') { state.presence = null; store.set('presence', null); toast('Segnalazione annullata'); }
        if (a === 'tab-games') state.tab = 'games';
        refresh(); return;
      }
      const fmt = e.target.closest('[data-fmt]');
      if (fmt) { $$('[data-fmt]').forEach(b => b.setAttribute('aria-pressed', b === fmt)); return; }
    });
    $('#sheet').addEventListener('submit', e => {
      e.preventDefault();
      const c = state.current;
      if (e.target.id === 'raidForm') {
        const fmt = ($('[data-fmt][aria-pressed="true"]') || {}).dataset.fmt || '3c3';
        const start = Math.ceil((Date.now() + Number(e.target.when.value) * MIN) / (5 * MIN)) * 5 * MIN;
        const r = { id: 'me-' + Date.now(), courtId: c.id, courtName: c.name, format: fmt, need: FORMATS[fmt], start, deadline: start - 30 * MIN, players: [myName()] };
        state.raids.push(r);
        state.history.unshift({ raidId: r.id, format: r.format, courtName: r.courtName, start: r.start });
        store.set('raids', state.raids); store.set('history', state.history);
        toast('Partita creata: la vedono tutti i giocatori vicini');
        refresh();
      }
      if (e.target.id === 'chatForm') {
        const text = e.target.text.value.trim(); if (!text) return;
        chatFor(c).push({ who: myName(), text, ts: Date.now() });
        store.set('chats', state.chats);
        renderSheet();
        const inp = $('#chatForm input'); if (inp) inp.focus();
      }
    });
    document.addEventListener('click', e => {
      const j = e.target.closest('[data-join]'); if (j) { joinRaid(j.dataset.join); return; }
      const o = e.target.closest('[data-open]'); if (o) { openCourt(o.dataset.open, 'games'); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

    // profilo
    $('#nickname').value = state.profile.nickname;
    $('#position').value = state.profile.position;
    $('#profileForm').addEventListener('submit', e => {
      e.preventDefault();
      const old = myName();
      state.profile = { nickname: $('#nickname').value.trim(), position: $('#position').value };
      store.set('profile', state.profile);
      const now = myName();
      if (old !== now) state.raids.forEach(r => { r.players = r.players.map(p => (p === old ? now : p)); });
      store.set('raids', state.raids);
      toast('Profilo salvato'); refresh();
    });
    $('#resetDemo').addEventListener('click', () => { store.clear(); location.reload(); });

    // allenamento
    let ft = 5;
    const showFt = () => { $('#ftValue').textContent = ft; };
    $('#ftMinus').addEventListener('click', () => { ft = Math.max(0, ft - 1); showFt(); });
    $('#ftPlus').addEventListener('click', () => { ft = Math.min(10, ft + 1); showFt(); });
    $('#ftSave').addEventListener('click', () => { state.sessions.push({ made: ft, ts: Date.now() }); store.set('sessions', state.sessions); renderTraining(); toast('Sessione salvata'); });
  }

  /* ---------- avvio ---------- */
  document.title = C.appName;
  bind();
  renderTraining();
  refresh();
  initMap();
  setInterval(() => { pruneRaids(); refresh(); }, MIN);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
