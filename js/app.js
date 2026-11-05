/* Check Camp — prototipo PWA per la tesi.
   Dati reali: i campi da basket di OpenStreetMap (via Overpass).
   Dati simulati: partite, altri giocatori, amici, chat, segnalazioni e avvisi, generati nel telefono.
   Salvati solo sul telefono: profilo, preferiti, amici, chat, allenamento. */
(function () {
  'use strict';
  const C = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

  /* ---------- memoria locale (può mancare: tutto funziona anche senza) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('checkcamp:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('checkcamp:' + k, JSON.stringify(v)); } catch (e) { /* niente */ } },
    clear() { try { Object.keys(localStorage).filter(k => k.startsWith('checkcamp:')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* niente */ } }
  };
  const AVATAR_COLORS = ['#f07c1b', '#e2402f', '#3d8fd6', '#2e7d32', '#8e44ad', '#f2b705'];
  const state = {
    courts: [], byId: {},
    profile: store.get('profile', null) || { nickname: '', color: 0, userId: 'USER' + (100 + Math.floor(Math.random() * 900)) },
    games: store.get('games', []),
    favs: store.get('favs', {}),
    reports: store.get('reports', {}),
    friends: store.get('friends', []),                 // nickname degli amici (amicizia reciproca)
    requests: store.get('requests', null),            // richieste ricevute
    sent: store.get('sent', []),                       // richieste inviate
    chats: store.get('chats', {}),                     // chat permanenti con gli amici
    history: store.get('history', []),
    train: store.get('train', { liberi: [], triple: [] }),
    prefs: store.get('prefs', { notifyFavs: true }),
    notified: store.get('notified', []),
    favSeeded: store.get('favSeeded', []),
    me: null,
    sheet: null                                         // cosa mostra il pannello: {type, id}
  };
  store.set('profile', state.profile);
  const myName = () => state.profile.nickname.trim() || state.profile.userId;

  /* utenti simulati della demo (si trovano con il nickname) */
  const NICKS = ['Ale', 'Teo', 'Giuly', 'Marco B.', 'Fede', 'Sami', 'Luca', 'Nico', 'Ste', 'Ibra', 'Matti', 'Dani', 'Sofi', 'Omar', 'Pietro', 'Chiara'];
  if (!state.requests) { state.requests = ['Fede', 'Sami', 'Ibra']; store.set('requests', state.requests); }

  /* ---------- utilità ---------- */
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hhmm(ts) { return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800); }
  function distance(a, b) { const R = 6371e3, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }
  const fmtLabel = f => f.replace('c', 'v');               // 2c2 -> 2v2
  const save = (...keys) => keys.forEach(k => store.set(k, state[k]));

  /* ---------- dati OpenStreetMap ---------- */
  const SURFACE = { asphalt: 'asfalto', concrete: 'cemento', 'concrete:plates': 'lastre di cemento', paved: 'pavimentato', paving_stones: 'autobloccanti', acrylic: 'resina acrilica', tartan: 'tartan', rubber: 'gomma', artificial_turf: 'erba sintetica', wood: 'parquet', grass: 'erba', ground: 'terra', dirt: 'terra', compacted: 'terra battuta', unpaved: 'non pavimentato', sand: 'sabbia', gravel: 'ghiaia' };
  const ACCESS = { yes: 'libero', public: 'libero', permissive: 'consentito', customers: 'solo clienti', private: 'privato', no: 'non accessibile', destination: 'consentito' };
  function toCourt(el) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) return null;
    const id = el.type + '/' + el.id;
    return { id, osmType: el.type, osmId: el.id, lat, lon,
      name: t.name || 'Campo da basket', street: t['addr:street'] || '', city: t['addr:city'] || '',
      surface: t.surface ? (SURFACE[t.surface] || t.surface) : null,
      lit: t.lit === 'yes' ? true : t.lit === 'no' ? false : null, hoops: t.hoops || null,
      access: t.access ? (ACCESS[t.access] || t.access) : null };
  }
  /* frequentazione abituale simulata: 0 = poco, 1 = media, 2 = molto (segnaposto più grande) */
  const popularity = c => hash(c.id + 'pop') % 3;

  /* ---------- partite ---------- */
  const FORMATS = { '1c1': 2, '2c2': 4, '3c3': 6, '5c5': 10 };
  function gameStatus(g, now = Date.now()) {
    const full = g.players.length >= g.need;
    if (now < g.start) {
      if (full) return { key: 'ok', label: 'Confermata' };
      if (now >= g.deadline) return { key: 'off', label: 'Non confermata' };
      return { key: 'open', label: 'Mancano ' + (g.need - g.players.length) };
    }
    if (full && now < g.start + 60 * MIN) return { key: 'live', label: 'In corso' };
    return { key: 'gone', label: 'Finita' };
  }
  const visible = g => ['open', 'ok', 'live'].includes(gameStatus(g).key);
  const gamesAt = id => state.games.filter(g => g.courtId === id && visible(g)).sort((a, b) => a.start - b.start);
  function activityOk() { const h = new Date().getHours(); return h >= 8 && h < 22; }

  function seedGames(courts) {
    const now = Date.now(), today = new Date().toDateString();
    const seeded = new Set(state.games.filter(g => g.simulated).map(g => g.courtId));
    const anyVisible = courts.some(c => state.games.some(g => g.courtId === c.id && visible(g)));
    const pick = !anyVisible && courts.length ? courts.slice().sort((a, b) => popularity(b) - popularity(a))[0].id : null;
    courts.forEach(c => {
      if (seeded.has(c.id) || !activityOk()) return;
      const h = hash(c.id + today) >>> 0;                         // sempre positivo
      if (h % 3 !== 0 && c.id !== pick) return;                    // circa un campo su tre (almeno uno nella zona)
      const fmt = ['1c1', '2c2', '3c3', '5c5'][(h >>> 3) % 4], need = FORMATS[fmt];
      const start = Math.ceil((now + (15 + (h >>> 6) % 50) * MIN) / (5 * MIN)) * 5 * MIN;
      const n = 1 + ((h >>> 11) % (need - 1));
      const players = [...new Set(Array.from({ length: n + 3 }, (_, i) => NICKS[(h + i * 7) % NICKS.length]))].slice(0, n);
      state.games.push({ id: 'sim-' + c.id + '-' + start, courtId: c.id, courtName: c.name, format: fmt, need, creator: players[0],
        created: now, start, deadline: Math.min(start, now + (10 + (h >>> 4) % 30) * MIN), players, simulated: true,
        chat: [{ who: players[0], text: 'Sono al campo', ts: now - 2 * MIN }] });
    });
    pruneGames();
  }
  function pruneGames() {
    const now = Date.now();
    state.games = state.games.filter(g => g.start + 90 * MIN > now && !(gameStatus(g, now).key === 'off' && now - g.deadline > 30 * MIN));
    save('games');
  }
  function joinGame(id) {
    const g = state.games.find(x => x.id === id); if (!g) return;
    const me = myName(), st = gameStatus(g).key;
    if (g.players.includes(me)) {
      if (g.creator === me) { toast('Hai creato tu la partita: puoi solo annullarla'); return; }
      g.players = g.players.filter(p => p !== me);
      state.history = state.history.filter(h => h.gameId !== g.id);
      toast('Non sei più iscritto');
    } else {
      if (st !== 'open') return;
      g.players.push(me);
      g.chat.push({ who: me, text: 'Ci sono!', ts: Date.now() });
      state.history.unshift({ gameId: g.id, format: g.format, courtName: g.courtName, start: g.start });
      toast(g.players.length >= g.need ? 'Partita confermata: siete al completo' : 'Ci sei! La barra si riempie con chi risponde');
      simulateJoins(g);
    }
    save('games', 'history'); refresh();
  }
  function cancelGame(id) {
    state.games = state.games.filter(g => g.id !== id);
    state.history = state.history.filter(h => h.gameId !== id);
    save('games', 'history'); closeSheet(); refresh(); toast('Partita annullata');
  }
  /* per la demo: altri giocatori rispondono «Ci sono» dopo qualche secondo */
  function simulateJoins(g) {
    const tries = Math.min(2, g.need - g.players.length);
    for (let i = 0; i < tries; i++) {
      setTimeout(() => {
        const cur = state.games.find(x => x.id === g.id);
        if (!cur || gameStatus(cur).key !== 'open') return;
        const who = NICKS.find(n => !cur.players.includes(n) && hash(n + cur.id + i) % 2 === 0) || NICKS.find(n => !cur.players.includes(n));
        cur.players.push(who);
        cur.chat.push({ who, text: ['Ci sono', 'Arrivo alle ' + hhmm(cur.start - 5 * MIN), 'Porto il pallone'][i % 3], ts: Date.now() });
        save('games'); refresh();
      }, 7000 + i * 6000);
    }
  }

  /* ---------- preferiti e avvisi (simulati) ---------- */
  const isFav = id => !!state.favs[id];
  function toggleFav(c) {
    if (isFav(c.id)) { delete state.favs[c.id]; toast('Tolto dai preferiti'); }
    else {
      state.favs[c.id] = Object.assign({}, c);
      toast(state.prefs.notifyFavs ? 'Aggiunto ai preferiti: ti avvisiamo quando parte una partita' : 'Aggiunto ai preferiti');
      if (state.prefs.notifyFavs) setTimeout(favWatch, 6000);
    }
    save('favs'); refresh();
  }
  function ensureCourt(id) {
    if (!state.byId[id] && state.favs[id]) { const c = Object.assign({}, state.favs[id]); state.byId[id] = c; state.courts.push(c); }
    return state.byId[id];
  }
  function favWatch() {
    if (!state.prefs.notifyFavs || !activityOk()) return;
    const me = myName(), today = new Date().toDateString(), now = Date.now();
    Object.keys(state.favs).forEach(id => {
      const c = ensureCourt(id); if (!c) return;
      let g = state.games.find(x => x.courtId === id && gameStatus(x).key === 'open' && !x.players.includes(me));
      if (!g) {
        const key = id + '|' + today;
        if (state.favSeeded.includes(key)) return;
        state.favSeeded.push(key); store.set('favSeeded', state.favSeeded.slice(-60));
        const h = hash(key), fmt = ['2c2', '3c3', '5c5'][h % 3], need = FORMATS[fmt];
        const start = Math.ceil((now + (30 + h % 30) * MIN) / (5 * MIN)) * 5 * MIN;
        const n = Math.max(1, need - 1 - ((h >> 4) % 2));
        const players = [...new Set(Array.from({ length: n + 3 }, (_, i) => NICKS[(h + i * 5) % NICKS.length]))].slice(0, n);
        if (state.friends.length) players[Math.min(1, players.length - 1)] = state.friends[h % state.friends.length];
        g = { id: 'sim-fav-' + id + '-' + start, courtId: id, courtName: c.name, format: fmt, need, creator: players[0], created: now,
          start, deadline: Math.min(start, now + 25 * MIN), players: [...new Set(players)], simulated: true,
          chat: [{ who: players[0], text: 'Sono al campo', ts: now }] };
        state.games.push(g); save('games');
      }
      if (state.notified.includes(g.id)) return;
      state.notified.push(g.id); store.set('notified', state.notified.slice(-100));
      notifyGame(g);
    });
    refresh();
  }
  function notifyGame(g) {
    const fr = g.players.filter(p => state.friends.includes(p));
    const title = 'Si gioca in un tuo campo preferito';
    const body = `${fmtLabel(g.format)} a ${g.courtName} alle ${hhmm(g.start)}: mancano ${g.need - g.players.length}, rispondi entro le ${hhmm(g.deadline)}` + (fr.length ? `. C'è ${fr.join(', ')}` : '');
    $('#noticeTitle').textContent = title; $('#noticeBody').textContent = body;
    $('#notice').dataset.game = g.id; $('#notice').hidden = false;
    clearTimeout(notifyGame._t); notifyGame._t = setTimeout(() => { $('#notice').hidden = true; }, 10000);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: 'icons/icon-192.png' })).catch(() => {});
        else new Notification(title, { body, icon: 'icons/icon-192.png' });
      }
    } catch (e) { /* basta l'avviso nell'app */ }
  }

  /* ---------- segnalazioni sullo stato del campo (simulate) ---------- */
  const REPORT_TYPES = ['Canestro senza retina', 'Canestro rotto o mancante', 'Pavimentazione rovinata', 'Luci spente o guaste', 'Campo chiuso', 'Campo sporco', 'Fontanella non funzionante', 'Linee rifatte', 'Retine nuove'];
  function reportsFor(c) {
    if (!state.reports[c.id]) {
      const h = hash(c.id + 'rep'), seen = new Set();
      state.reports[c.id] = Array.from({ length: h % 3 }, (_, i) => {
        const hh = hash(c.id + 'rep' + i), text = REPORT_TYPES[hh % REPORT_TYPES.length];
        if (seen.has(text)) return null; seen.add(text);
        const age = 1 + hh % 20;
        return { id: 'sim' + i, text, ts: Date.now() - age * DAY, last: Date.now() - (hh >> 5) % age * DAY, yes: 1 + (hh >> 3) % 5, no: (hh >> 7) % 4 === 0 ? 2 : 0, my: null };
      }).filter(Boolean);
    }
    return state.reports[c.id];
  }
  const ago = ts => { const d = Math.floor((Date.now() - ts) / DAY); return d <= 0 ? 'oggi' : d === 1 ? 'ieri' : d + ' giorni fa'; };
  function voteReport(c, id, v) {
    const r = reportsFor(c).find(x => x.id === id); if (!r) return;
    if (r.my === v) { r[v]--; r.my = null; } else { if (r.my) r[r.my]--; r[v]++; r.my = v; if (v === 'yes') r.last = Date.now(); }
    save('reports'); renderSheet();
  }

  /* ---------- amici (si trovano con il nickname) ---------- */
  function friendStatus(n) {
    const g = state.games.find(x => visible(x) && x.players.includes(n));
    if (!g) return '';
    return g.creator === n ? 'al campo · ' + g.courtName : 'iscritto a una partita · ' + g.courtName;
  }
  function makeFriend(n) {
    if (!state.friends.includes(n)) state.friends.push(n);
    state.requests = state.requests.filter(x => x !== n); state.sent = state.sent.filter(x => x !== n);
    if (!state.chats[n]) state.chats[n] = [{ who: n, text: 'Ciao! Ora siamo amici su ' + C.appName, ts: Date.now() }];
    save('friends', 'requests', 'sent', 'chats');
  }
  function addFriendByNick(raw) {
    const q = raw.trim(); if (!q) return;
    const n = NICKS.find(x => x.toLowerCase() === q.toLowerCase());
    if (!n || n === myName()) { toast('Nessun giocatore con il nickname «' + q + '»'); return; }
    if (state.friends.includes(n)) { toast(n + ' è già tra i tuoi amici'); return; }
    if (state.requests.includes(n)) { makeFriend(n); toast('Ora tu e ' + n + ' siete amici'); refresh(); return; }
    if (!state.sent.includes(n)) state.sent.push(n);
    save('sent'); toast('Richiesta inviata a ' + n); refresh();
    setTimeout(() => { if (state.sent.includes(n)) { makeFriend(n); toast(n + ' ha accettato: ora potete scrivervi'); refresh(); } }, 5000);
  }
  function sendChat(n, msg) {
    (state.chats[n] = state.chats[n] || []).push(Object.assign({ who: myName(), ts: Date.now() }, msg));
    save('chats');
    if (msg.gameId) setTimeout(() => { state.chats[n].push({ who: n, text: 'Ok, ci vediamo lì', ts: Date.now() }); save('chats'); refresh(); }, 4000);
  }

  /* ---------- allenamento: solo personale ---------- */
  const DRILLS = { liberi: 'Tiri liberi', triple: 'Triple' };
  function avg(list) { const m = list.reduce((a, s) => a + s.made, 0), t = list.reduce((a, s) => a + s.att, 0); return t ? Math.round(m / t * 100) + '%' : '—'; }

  /* ---------- condivisione (immagine per storie e chat) ---------- */
  let shareItem = null;
  function openShare(item) { shareItem = item; $('#shareCourt').checked = false; $('#shareCourtRow').hidden = item.kind !== 'game'; drawShare(); $('#shareModal').hidden = false; }
  function drawShare() {
    const it = shareItem; if (!it) return;
    const cv = $('#shareCanvas'), g = cv.getContext('2d'), W = 1080, H = 1920;
    const F = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    g.fillStyle = '#f07c1b'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(22,22,22,.18)'; g.lineWidth = 8;
    g.beginPath(); g.arc(W / 2, H + 140, 620, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W / 2, H + 140, 260, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#161616'; g.font = F('900', 64); g.fillText(C.appName.toUpperCase(), 90, 220);
    if (it.kind === 'game') {
      g.font = F('600', 54); g.fillText('Partita al campetto', 90, 520);
      g.font = F('900', 260); g.fillText(fmtLabel(it.format), 80, 800);
      const d = new Date(it.start);
      g.font = F('700', 70); g.fillText(d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }), 90, 980);
      g.font = F('500', 62); g.fillText('ore ' + hhmm(it.start) + ' · ' + it.need + ' giocatori', 90, 1070);
      if ($('#shareCourt').checked) { g.font = F('800', 60); g.fillText(it.courtName.slice(0, 28), 90, 1200); }
    } else {
      const list = state.train[it.drill];
      g.font = F('600', 54); g.fillText('Allenamento · ' + DRILLS[it.drill], 90, 520);
      g.font = F('900', 260); g.fillText(avg(list), 80, 800);
      g.font = F('500', 60); g.fillText('media su ' + list.length + (list.length === 1 ? ' sessione' : ' sessioni'), 90, 900);
      const last = list.slice(-6), max = Math.max(10, ...last.map(s => s.att)), bw = 120;
      last.forEach((s, i) => {
        const x = 90 + i * (bw + 30), hA = 500 * s.att / max, hM = 500 * s.made / max, y0 = 1550;
        g.fillStyle = '#e2402f'; g.fillRect(x, y0 - hA, bw, hA);
        g.fillStyle = '#3d8fd6'; g.fillRect(x, y0 - hM, bw, hM);
      });
    }
    g.fillStyle = '#161616'; g.font = F('500', 40); g.fillText('Trova un campo, guarda chi c\'è, entra in partita.', 90, 1820);
  }
  function shareBlob(cb) { $('#shareCanvas').toBlob(b => cb(b), 'image/png'); }
  function saveShare() { shareBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'checkcamp.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }); }
  function doShare() {
    shareBlob(b => {
      const file = new File([b], 'checkcamp.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: C.appName }).catch(() => {});
      else { saveShare(); toast('Condivisione diretta non disponibile: immagine scaricata'); }
    });
  }

  /* ---------- mappa ---------- */
  let map, layer, meMarker;
  const COURT_SVG = '<svg viewBox="0 0 30 20" aria-hidden="true"><rect x="1" y="1" width="28" height="18" fill="none" stroke="#fff" stroke-width="1.6"/><line x1="15" y1="1" x2="15" y2="19" stroke="#fff" stroke-width="1.4"/><circle cx="15" cy="10" r="3.2" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M1 6h4v8H1M29 6h-4v8h4" fill="none" stroke="#fff" stroke-width="1.4"/></svg>';
  function initMap() {
    if (!window.L) { $('#mapStatus').textContent = 'Mappa non disponibile: serve la connessione'; return; }
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView(C.center, C.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributori di OpenStreetMap</a>' }).addTo(map);
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
      seedGames(found);
      $('#mapStatus').textContent = found.length ? found.length + (found.length === 1 ? ' campo trovato' : ' campi trovati') : 'Nessun campo in quest\'area';
      setTimeout(() => { $('#mapStatus').textContent = ''; }, 2000);
      refresh();
    } catch (e) { $('#mapStatus').textContent = 'Non riesco a caricare i campi, riprova tra poco'; }
  }
  function drawMarkers() {
    if (!layer) return;
    layer.clearLayers();
    state.courts.forEach(c => {
      const size = [22, 28, 36][popularity(c)];
      const gs = gamesAt(c.id), g = gs[0];
      const tag = g ? `<span class="pin__game${gameStatus(g).key !== 'open' ? ' pin__game--ok' : ''}">${fmtLabel(g.format)} · ${gameStatus(g).key === 'live' ? 'in corso' : g.players.length + '/' + g.need}</span>` : '';
      const html = `<div class="pin">${tag}<div class="pin__court" style="width:${size}px;height:${Math.round(size * .68)}px">${COURT_SVG}</div>${isFav(c.id) ? '<span class="pin__star">★</span>' : ''}</div>`;
      const icon = L.divIcon({ className: '', html, iconSize: [size, Math.round(size * .68)], iconAnchor: [size / 2, Math.round(size * .34)] });
      L.marker([c.lat, c.lon], { icon, title: c.name, keyboard: true }).on('click', () => openCourt(c.id)).addTo(layer);
    });
  }
  function locate() {
    if (!navigator.geolocation) { toast('Posizione non disponibile su questo dispositivo'); return; }
    $('#mapStatus').textContent = 'Cerco la tua posizione…';
    navigator.geolocation.getCurrentPosition(pos => {
      state.me = [pos.coords.latitude, pos.coords.longitude]; $('#mapStatus').textContent = '';
      if (!map) return;
      if (meMarker) meMarker.remove();
      meMarker = L.circleMarker(state.me, { radius: 8, color: '#fff', weight: 3, fillColor: '#3d8fd6', fillOpacity: 1 }).addTo(map);
      map.setView(state.me, 15); loadCourts();
    }, () => { $('#mapStatus').textContent = ''; toast('Posizione non concessa: puoi muovere la mappa a mano'); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  function search(q) {
    const box = $('#searchResults'); q = q.trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    const res = state.courts.filter(c => (c.name + ' ' + c.street + ' ' + c.city).toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = res.length ? res.map(c => `<button type="button" data-court="${esc(c.id)}"><strong>${esc(c.name)}</strong>${c.street ? ' · ' + esc(c.street) : ''}</button>`).join('')
      : '<p class="small muted" style="padding:12px 14px;margin:0">Nessun campo trovato tra quelli caricati. Sposta la mappa e tocca «Cerca campi in quest\'area».</p>';
    box.hidden = false;
  }

  /* ---------- pannello: campo, partita, crea partita, chat, allenamento ---------- */
  function openSheet(type, id, extra) { state.sheet = Object.assign({ type, id }, extra || {}); $('#sheet').hidden = false; renderSheet(); }
  function closeSheet() { $('#sheet').hidden = true; state.sheet = null; }
  function openCourt(id) { if (!ensureCourt(id)) return; openSheet('court', id); if (map) { const c = state.byId[id]; map.setView([c.lat, c.lon], Math.max(map.getZoom(), 15)); } $('#searchResults').hidden = true; }

  function renderSheet() {
    const s = state.sheet; if (!s) return;
    const panel = $('#sheetPanel'), fb = $('#favBtn');
    panel.className = 'sheet__panel' + (s.type === 'court' || s.type === 'create' ? ' is-court' : s.type === 'game' ? ' is-game' : '');
    fb.hidden = s.type !== 'court';
    let title = '', sub = '', body = '';
    if (s.type === 'court' || s.type === 'create') {
      const c = state.byId[s.id]; if (!c) { closeSheet(); return; }
      title = c.name;
      sub = [state.me ? fmtDist(distance(state.me, [c.lat, c.lon])) : '', c.street, c.city].filter(Boolean).join(' · ');
      fb.setAttribute('aria-pressed', isFav(c.id)); fb.textContent = isFav(c.id) ? '★' : '☆';
      fb.setAttribute('aria-label', isFav(c.id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti');
      body = s.type === 'court' ? tplCourt(c) : tplCreate(c);
    } else if (s.type === 'game') {
      const g = state.games.find(x => x.id === s.id); if (!g) { closeSheet(); toast('La partita non è più disponibile'); return; }
      title = fmtLabel(g.format) + ' · ' + gameStatus(g).label; sub = g.courtName; body = tplGame(g);
    } else if (s.type === 'chat') {
      title = s.id; sub = friendStatus(s.id) || 'amico'; body = tplChat(s.id);
    } else if (s.type === 'pickFriend') {
      title = s.gameId ? 'Manda la partita a un amico' : 'Nuova chat'; body = tplPickFriend(s.gameId);
    } else if (s.type === 'pickGame') {
      title = 'Manda una partita'; sub = 'a ' + s.id; body = tplPickGame(s.id);
    } else if (s.type === 'train') {
      title = 'Tiro'; sub = 'Visibile solo a te'; body = tplTrain(s.adding);
    }
    $('#sheetTitle').textContent = title; $('#sheetSub').textContent = sub;
    const b = $('#sheetBody'); b.innerHTML = body;
    if (s.type === 'chat') b.scrollTop = b.scrollHeight;
  }

  function gameCard(g, compact) {
    const st = gameStatus(g), me = myName(), joined = g.players.includes(me);
    const pct = Math.min(100, g.players.length / g.need * 100);
    const info = st.key === 'open' ? `Mancano ${g.need - g.players.length} · rispondi entro le ${hhmm(g.deadline)}` : st.key === 'ok' ? 'Confermata: siete al completo' : st.key === 'live' ? 'In corso' : st.label;
    return `<article class="game ${st.key === 'off' ? 'game--off' : ''}" ${compact ? `data-opengame="${esc(g.id)}" role="button" tabindex="0"` : ''}>
      <div class="game__top"><div class="game__court">${esc(g.courtName)}</div><div class="game__format">${fmtLabel(g.format)}</div><div class="game__time">inizio<br>${hhmm(g.start)}</div></div>
      <div class="meter" aria-label="${g.players.length} su ${g.need}"><span style="width:${pct}%"></span><b>${g.players.length} / ${g.need}</b></div>
      <div class="game__state">${info}</div>
      ${compact ? '' : `<div class="small">${g.players.map(p => state.friends.includes(p) ? `<span class="friend">${esc(p)} ★</span>` : esc(p)).join(', ')}</div>`}
      ${compact ? '' : (g.creator === me
        ? `<div class="btn-row"><button type="button" class="btn" data-cancel="${esc(g.id)}">Annulla partita</button></div>`
        : `<button type="button" class="btn ${joined ? '' : 'btn--primary'} btn--block" data-join="${esc(g.id)}" ${joined || st.key === 'open' ? '' : 'disabled'}>${joined ? 'Non ci sono più' : 'Ci sono'}</button>`)}
    </article>`;
  }

  function tplCourt(c) {
    const games = gamesAt(c.id);
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v == null || v === '' ? '<span class="muted">non indicato</span>' : esc(v)}</dd></div>`;
    const reps = reportsFor(c).slice().sort((a, b) => b.last - a.last);
    return `
      <p class="sec-title">PARTITE</p>
      ${games.length ? games.map(g => gameCard(g, true)).join('') : '<p class="muted small" style="margin:0">Nessuna partita in questo momento. Se sei al campo, creane una: è così che gli altri sanno che qui si gioca.</p>'}
      <button type="button" class="btn btn--orange btn--block" data-act="create">⊕ Crea partita</button>
      <p class="sec-title">INFO</p>
      <dl class="info">${row('Pavimentazione', c.surface)}${row('Illuminazione', c.lit == null ? null : c.lit ? 'sì' : 'no')}${row('Canestri', c.hoops)}${row('Accesso', c.access)}</dl>
      <p class="sec-title">FOTO</p>
      <div class="photos"><div>Foto 1<br>(degli utenti)</div><div>Foto 2</div><div>Foto 3</div></div>
      <p class="sec-title">SEGNALAZIONI</p>
      ${reps.length ? `<div class="reports">${reps.map(r => `
        <div class="report ${r.no >= r.yes ? 'is-doubt' : ''}">
          <div class="report__text">${esc(r.text)}</div>
          <div class="muted small">Segnalato ${ago(r.ts)} · confermato da ${r.yes} ${r.yes === 1 ? 'persona' : 'persone'}, l'ultima ${ago(r.last)}${r.no ? ` · per ${r.no} non è più così` : ''}</div>
          <div class="btn-row"><button type="button" class="btn" data-rep="${esc(r.id)}" data-v="yes" aria-pressed="${r.my === 'yes'}">Confermo</button><button type="button" class="btn" data-rep="${esc(r.id)}" data-v="no" aria-pressed="${r.my === 'no'}">Non è più così</button></div>
        </div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Nessuna segnalazione.</p>'}
      <form class="report-form" id="reportForm">
        <select name="type" aria-label="Cosa vuoi segnalare">${REPORT_TYPES.map(t => `<option>${t}</option>`).join('')}<option>Altro</option></select>
        <input type="text" name="note" maxlength="80" placeholder="Dettagli (facoltativo)" aria-label="Dettagli">
        <button type="submit" class="btn btn--primary">Segnala un cambiamento</button>
      </form>
      <p class="muted small">Info dei campi: OpenStreetMap. Foto e segnalazioni nel prototipo sono simulate.</p>
      <div class="btn-row"><a class="btn" href="https://www.openstreetmap.org/edit?${c.osmType}=${c.osmId}" target="_blank" rel="noopener">Correggi su OSM</a><a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener">Indicazioni</a></div>`;
  }

  function tplCreate(c) {
    const t = new Date(Date.now() + 15 * MIN);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    const val = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    return `
      <form class="card" id="createForm">
        <h2>Crea partita</h2>
        <label class="check"><input type="checkbox" name="here" required> Sono al campo adesso</label>
        <p class="muted small" style="margin:-6px 0 0">Una partita si crea solo dal campo: così chi la vede sa che lì c'è qualcuno.</p>
        <div class="field">Formato<div class="seg" role="group" aria-label="Formato">${Object.keys(FORMATS).map((f, i) => `<button type="button" data-fmt="${f}" aria-pressed="${i === 1}">${fmtLabel(f)}</button>`).join('')}</div></div>
        <label class="field">Orario d'inizio (da adesso in poi) <input type="time" name="start" value="${val}" required></label>
        <label class="field">Tempo per rispondere «Ci sono»
          <select name="wait"><option value="10">10 minuti</option><option value="20" selected>20 minuti</option><option value="30">30 minuti</option><option value="60">1 ora</option></select>
        </label>
        <p class="muted small">Se allo scadere non si arriva al numero, la partita non si conferma e sparisce dalla mappa.</p>
        <button type="submit" class="btn btn--primary btn--block">Crea</button>
        <button type="button" class="btn btn--block" data-act="back">Indietro</button>
      </form>`;
  }

  function tplGame(g) {
    const me = myName(), joined = g.players.includes(me), st = gameStatus(g).key;
    return `${gameCard(g, false)}
      <p class="sec-title">CHAT DELLA PARTITA</p>
      ${joined ? `<div class="chatbox"><div class="chat">${g.chat.map(m => `<div class="msg ${m.who === me ? 'msg--me' : ''}"><div class="msg__who">${esc(m.who)} · ${hhmm(m.ts)}</div>${esc(m.text)}</div>`).join('')}</div>
        <form class="chat-form" id="gameChatForm"><input type="text" name="text" maxlength="200" placeholder="Scrivi…" autocomplete="off" aria-label="Messaggio"><button type="submit" class="btn btn--primary">Invia</button></form></div>
        <p class="muted small" style="margin:0">La chat la vedono solo gli iscritti e sparisce quando la partita è finita.</p>`
      : '<p class="muted small" style="margin:0">Premi «Ci sono» per vedere la chat della partita.</p>'}
      <div class="btn-row">
        <button type="button" class="btn" data-sendgame="${esc(g.id)}" ${state.friends.length ? '' : 'disabled'}>Manda a un amico</button>
        ${joined && (st === 'ok' || st === 'live') ? `<button type="button" class="btn" data-sharegame="${esc(g.id)}">Condividi</button>` : ''}
      </div>
      <button type="button" class="btn btn--block" data-opencourt="${esc(g.courtId)}">Vai al campo</button>`;
  }

  function tplChat(n) {
    const me = myName(), msgs = state.chats[n] || [];
    return `<div class="chat">${msgs.map(m => {
      if (m.gameId) { const g = state.games.find(x => x.id === m.gameId); return `<div class="msg msg--game">${g ? gameCard(g, true) : '<div class="msg">Partita non più disponibile</div>'}</div>`; }
      return `<div class="msg ${m.who === me ? 'msg--me' : ''}"><div class="msg__who">${esc(m.who)} · ${hhmm(m.ts)}</div>${esc(m.text)}</div>`;
    }).join('')}</div>
      <form class="chat-form" id="chatForm"><input type="text" name="text" maxlength="200" placeholder="Scrivi…" autocomplete="off" aria-label="Messaggio"><button type="submit" class="btn btn--primary">Invia</button></form>
      <button type="button" class="btn btn--block" data-pickgame="${esc(n)}">Manda una partita</button>`;
  }
  function tplPickFriend(gameId) {
    return state.friends.length ? `<div class="list">${state.friends.map(f => `<button type="button" class="chat-row" data-chatto="${esc(f)}" ${gameId ? `data-withgame="${esc(gameId)}"` : ''}><span class="avatar">${esc(f[0])}</span><span class="chat-row__txt"><strong>${esc(f)}</strong></span></button>`).join('')}</div>`
      : '<p class="muted">Non hai ancora amici. Aggiungili dal profilo con il loro nickname.</p>';
  }
  function tplPickGame(n) {
    const list = state.games.filter(visible).sort((a, b) => a.start - b.start);
    return list.length ? list.map(g => `<div data-sendto="${esc(n)}" data-gid="${esc(g.id)}">${gameCard(g, false).replace(/<button[\s\S]*?<\/button>/g, '').replace(/<div class="btn-row">\s*<\/div>/g, '')}</div>`).join('') : '<p class="muted">Nessuna partita in corso nei campi caricati.</p>';
  }

  function chartHtml(list) {
    const last = list.slice(-6); if (!last.length) return '<p class="muted small" style="margin:0">Nessuna sessione: tocca «Aggiungi».</p>';
    const max = Math.max(10, ...last.map(s => s.att));
    return `<div class="chart">${last.map(s => `<div class="col"><div class="att" style="height:${s.att / max * 100}%"><span class="lbl-top">${s.att}</span><div class="made" style="height:${s.att ? s.made / s.att * 100 : 0}%"><div class="lbl-in">${s.made}</div></div></div></div>`).join('')}</div>
      <div class="chart-x">${last.map(s => `<span>${new Date(s.ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span>`).join('')}</div>`;
  }
  function tplTrain(adding) {
    if (adding) {
      return `<div class="adder" id="adder" data-drill="${adding}">
        <h2>${DRILLS[adding]}</h2>
        <div class="adder__nums"><input type="number" id="addMade" min="0" max="200" value="5" aria-label="Canestri fatti"> / <input type="number" id="addAtt" min="1" max="200" value="10" aria-label="Tiri tentati"></div>
        <div class="adder__ctrl"><div><button type="button" class="btn" data-step="made" data-d="-1" aria-label="Uno fatto in meno">−</button><button type="button" class="btn" data-step="made" data-d="1" aria-label="Uno fatto in più">+</button></div>
        <div><button type="button" class="btn" data-step="att" data-d="-1" aria-label="Un tentativo in meno">−</button><button type="button" class="btn" data-step="att" data-d="1" aria-label="Un tentativo in più">+</button></div></div>
        <p class="small" style="margin:0">canestri fatti / tiri tentati</p>
        <button type="button" class="btn btn--primary btn--block" data-act="saveDrill">Aggiungi</button>
        <button type="button" class="btn btn--block" data-act="backTrain">Annulla</button>
      </div>`;
    }
    return Object.keys(DRILLS).map(d => `<div class="drill">
      <div class="drill__head"><h3>${DRILLS[d]}</h3><span class="avg">Media ${avg(state.train[d])}</span><button type="button" class="btn" data-adddrill="${d}">Aggiungi</button></div>
      ${chartHtml(state.train[d])}
      <p class="small muted" style="margin:0"><span style="color:var(--blue)">■</span> canestri fatti &nbsp;<span style="color:var(--red)">■</span> tiri tentati</p>
      ${state.train[d].length ? `<div class="btn-row"><button type="button" class="btn" data-sharetrain="${d}">Condividi</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${DRILLS[d]}: media ${avg(state.train[d])} su ${state.train[d].length} sessioni (${C.appName})`)}">WhatsApp</a></div>` : ''}
    </div>`).join('');
  }

  /* ---------- viste ---------- */
  function renderCommunity() {
    const names = Object.keys(state.chats).filter(n => state.friends.includes(n));
    $('#chatList').innerHTML = names.length ? names.map(n => { const l = state.chats[n][state.chats[n].length - 1] || {}; const st = friendStatus(n);
      return `<button type="button" class="chat-row" data-chatto="${esc(n)}"><span class="avatar">${esc(n[0])}</span><span class="chat-row__txt"><strong>${esc(n)}</strong>${st ? ` <span class="small">· ${esc(st)}</span>` : ''}<div class="chat-row__last">${l.gameId ? 'Partita condivisa' : esc(l.text || '')}</div></span></button>`; }).join('')
      : '<p class="empty">Le chat nascono quando un\'amicizia è reciproca. Aggiungi gli amici dal profilo con il loro nickname.</p>';
  }
  function renderTrainView() {
    $('#trainBody').innerHTML = `
      <button type="button" class="cat" data-act="openTiro">Tiro<small>Tiri liberi e triple · media ${avg(state.train.liberi.concat(state.train.triple))}</small></button>
      ${['Palleggio', 'Dribbling', 'Stoppatore'].map(n => `<button type="button" class="cat" disabled>${n}<small>Esercizi da definire</small></button>`).join('')}
      <p class="muted small">Le categorie oltre al tiro sono provvisorie: gli esercizi e il modo di misurarli vanno definiti con un allenatore.</p>`;
  }
  function renderProfile() {
    const p = state.profile;
    $('#avatarBtn').style.background = AVATAR_COLORS[p.color % AVATAR_COLORS.length];
    $('#avatarTxt').textContent = (p.nickname.trim() || '?')[0].toUpperCase();
    $('#userId').textContent = p.nickname.trim() || p.userId;
    $('#requests').innerHTML = (state.requests.length ? `<p class="small" style="margin:0"><span class="req-badge">${state.requests.length}</span> ${state.requests.length === 1 ? 'nuova richiesta' : 'nuove richieste'}</p>` +
      state.requests.map(n => `<div class="row-item"><strong>${esc(n)}</strong><span class="btn-row" style="flex:0"><button type="button" class="btn btn--primary" data-accept="${esc(n)}">Accetta</button><button type="button" class="btn" data-decline="${esc(n)}">Rifiuta</button></span></div>`).join('')
      : '<p class="muted small" style="margin:0">Nessuna richiesta.</p>') + (state.sent.length ? `<p class="muted small" style="margin:0">In attesa: ${state.sent.map(esc).join(', ')}</p>` : '');
    $('#friendsList').innerHTML = state.friends.length ? state.friends.map(f => { const st = friendStatus(f);
      return `<div class="row-item"><span><strong>${esc(f)}</strong>${st ? `<br><span class="small">${esc(st)}</span>` : ''}</span><span class="btn-row" style="flex:0"><button type="button" class="btn" data-chatto="${esc(f)}">Chat</button><button type="button" class="btn" data-unfriend="${esc(f)}">Rimuovi</button></span></div>`; }).join('')
      : '<p class="muted small" style="margin:0">Nessun amico ancora.</p>';
    const favs = Object.values(state.favs);
    $('#favList').innerHTML = favs.length ? favs.map(f => `<div class="row-item"><span>★ ${esc(f.name)}</span><button type="button" class="btn" data-court="${esc(f.id)}">Apri</button></div>`).join('') : '<p class="muted small" style="margin:0">Nessun campo preferito: apri un campo sulla mappa e tocca la stella.</p>';
    $('#notifyFavs').checked = !!state.prefs.notifyFavs;
    $('#history').innerHTML = state.history.length ? state.history.slice(0, 20).map(h => { const g = state.games.find(x => x.id === h.gameId);
      return `<div class="row-item"><span><strong>${fmtLabel(h.format)}</strong> · ${esc(h.courtName)}<br><span class="small muted">${new Date(h.start).toLocaleDateString('it-IT')} ${hhmm(h.start)}${g ? ' · ' + gameStatus(g).label : ''}</span></span>${g && ['ok', 'live'].includes(gameStatus(g).key) ? `<button type="button" class="btn" data-sharegame="${esc(g.id)}">Condividi</button>` : ''}</div>`; }).join('')
      : '<p class="muted small" style="margin:0">Ancora nessuna partita.</p>';
  }
  function refresh() {
    drawMarkers(); renderCommunity(); renderTrainView(); renderProfile();
    if (state.sheet && !$('#sheet').hidden && !['create', 'train'].includes(state.sheet.type)) {
      const a = document.activeElement; const typing = a && (a.tagName === 'INPUT' || a.tagName === 'SELECT') && $('#sheetBody').contains(a);
      if (!typing) renderSheet();
    }
  }
  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tabbar__item').forEach(b => { const on = b.dataset.view === name; b.classList.toggle('is-active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (name === 'home' && map) setTimeout(() => map.invalidateSize(), 0);
  }

  /* ---------- eventi ---------- */
  function bind() {
    $$('.tabbar__item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    const fitBanner = () => { const b = $('#demoBanner'); document.documentElement.style.setProperty('--banner-h', b.hidden ? '0px' : b.offsetHeight + 'px'); };
    $('#closeBanner').addEventListener('click', () => { $('#demoBanner').hidden = true; store.set('bannerClosed', true); fitBanner(); });
    if (store.get('bannerClosed', false)) $('#demoBanner').hidden = true;
    fitBanner(); window.addEventListener('resize', fitBanner);

    $('#searchArea').addEventListener('click', loadCourts);
    $('#locate').addEventListener('click', locate);
    $('#searchForm').addEventListener('submit', e => { e.preventDefault(); search($('#searchInput').value); });
    $('#searchInput').addEventListener('input', e => search(e.target.value));
    $('#favBtn').addEventListener('click', () => { const c = state.sheet && state.byId[state.sheet.id]; if (c) toggleFav(c); });

    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-close]')) { closeSheet(); return; }
      if (t.closest('[data-close-share]')) { $('#shareModal').hidden = true; return; }
      const q = sel => t.closest(sel);
      let el;
      if ((el = q('[data-sendto]'))) { sendChat(el.dataset.sendto, { gameId: el.dataset.gid }); openSheet('chat', el.dataset.sendto); refresh(); toast('Partita inviata'); return; }
      if ((el = q('[data-court]'))) { showView('home'); openCourt(el.dataset.court); return; }
      if ((el = q('[data-opencourt]'))) { openCourt(el.dataset.opencourt); return; }
      if ((el = q('[data-join]'))) { joinGame(el.dataset.join); return; }
      if ((el = q('[data-cancel]'))) { cancelGame(el.dataset.cancel); return; }
      if ((el = q('[data-opengame]'))) { openSheet('game', el.dataset.opengame); return; }
      if ((el = q('[data-rep]'))) { voteReport(state.byId[state.sheet.id], el.dataset.rep, el.dataset.v); return; }
      if ((el = q('[data-fmt]'))) { $$('[data-fmt]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
      if ((el = q('[data-chatto]'))) {
        const n = el.dataset.chatto;
        if (el.dataset.withgame) { sendChat(n, { gameId: el.dataset.withgame }); toast('Partita inviata a ' + n); }
        openSheet('chat', n); refresh(); return;
      }
      if ((el = q('[data-sendgame]'))) { openSheet('pickFriend', null, { gameId: el.dataset.sendgame }); return; }
      if ((el = q('[data-pickgame]'))) { openSheet('pickGame', el.dataset.pickgame); return; }
      if ((el = q('[data-sharegame]'))) { const g = state.games.find(x => x.id === el.dataset.sharegame); if (g) openShare(Object.assign({ kind: 'game' }, g)); return; }
      if ((el = q('[data-sharetrain]'))) { openShare({ kind: 'train', drill: el.dataset.sharetrain }); return; }
      if ((el = q('[data-adddrill]'))) { openSheet('train', null, { adding: el.dataset.adddrill }); return; }
      if ((el = q('[data-step]'))) { const inp = el.dataset.step === 'made' ? $('#addMade') : $('#addAtt'); inp.value = Math.max(el.dataset.step === 'made' ? 0 : 1, Math.min(200, Number(inp.value || 0) + Number(el.dataset.d))); return; }
      if ((el = q('[data-accept]'))) { makeFriend(el.dataset.accept); toast('Ora tu e ' + el.dataset.accept + ' siete amici: la chat è pronta'); refresh(); return; }
      if ((el = q('[data-decline]'))) { state.requests = state.requests.filter(x => x !== el.dataset.decline); save('requests'); refresh(); return; }
      if ((el = q('[data-unfriend]'))) { const n = el.dataset.unfriend; state.friends = state.friends.filter(x => x !== n); delete state.chats[n]; save('friends', 'chats'); toast(n + ' rimosso dagli amici'); refresh(); return; }
      if ((el = q('[data-act]'))) {
        const a = el.dataset.act, s = state.sheet;
        if (a === 'create') openSheet('create', s.id);
        if (a === 'back') openSheet('court', s.id);
        if (a === 'openTiro' || a === 'backTrain') openSheet('train', null);
        if (a === 'saveDrill') {
          const d = $('#adder').dataset.drill, made = Number($('#addMade').value), att = Number($('#addAtt').value);
          if (!(att >= 1) || !(made >= 0) || made > att) { toast('I canestri fatti non possono superare i tiri tentati'); return; }
          state.train[d].push({ made, att, ts: Date.now() }); save('train'); toast('Sessione salvata'); openSheet('train', null); refresh();
        }
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#shareModal').hidden) { $('#shareModal').hidden = true; return; } if (!$('#sheet').hidden) closeSheet(); }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-opengame]')) { e.preventDefault(); openSheet('game', e.target.dataset.opengame); }
    });
    $('#sheet').addEventListener('submit', e => {
      e.preventDefault();
      const s = state.sheet, f = e.target;
      if (f.id === 'createForm') {
        const c = state.byId[s.id];
        const [hh, mm] = f.start.value.split(':').map(Number);
        const d = new Date(); d.setHours(hh, mm, 0, 0);
        const start = d.getTime(), now = Date.now();
        if (start < now - MIN) { toast('L\'orario d\'inizio non può essere prima di adesso (' + hhmm(now) + ')'); return; }
        const fmt = ($('[data-fmt][aria-pressed="true"]') || {}).dataset.fmt || '2c2', me = myName();
        const st = Math.max(start, now);
        const g = { id: 'me-' + now, courtId: c.id, courtName: c.name, format: fmt, need: FORMATS[fmt], creator: me, created: now,
          start: st, deadline: Math.min(st, now + Number(f.wait.value) * MIN), players: [me], chat: [{ who: me, text: 'Sono al campo', ts: now }] };
        state.games.push(g); state.history.unshift({ gameId: g.id, format: g.format, courtName: g.courtName, start: g.start });
        save('games', 'history'); simulateJoins(g);
        openSheet('game', g.id); refresh(); toast('Partita creata: ora la vedono tutti sulla mappa');
      }
      if (f.id === 'gameChatForm') {
        const text = f.text.value.trim(); if (!text) return;
        const g = state.games.find(x => x.id === s.id); g.chat.push({ who: myName(), text, ts: Date.now() }); save('games'); renderSheet();
        const inp = $('#gameChatForm input'); if (inp) inp.focus();
      }
      if (f.id === 'chatForm') {
        const text = f.text.value.trim(); if (!text) return;
        sendChat(s.id, { text }); renderSheet(); refresh();
        const inp = $('#chatForm input'); if (inp) inp.focus();
      }
      if (f.id === 'reportForm') {
        const note = f.note.value.trim(), c = state.byId[s.id];
        reportsFor(c).push({ id: 'me' + Date.now(), text: f.type.value + (note ? ': ' + note : ''), ts: Date.now(), last: Date.now(), yes: 1, no: 0, my: 'yes' });
        save('reports'); toast('Segnalazione aggiunta: altri potranno confermarla'); renderSheet();
      }
    });

    $('#newChat').addEventListener('click', () => openSheet('pickFriend', null));
    $('#profileForm').addEventListener('submit', e => {
      e.preventDefault();
      const old = myName(); state.profile.nickname = $('#nickname').value.trim(); save('profile');
      const now = myName();
      if (old !== now) state.games.forEach(g => { g.players = g.players.map(p => p === old ? now : p); if (g.creator === old) g.creator = now; g.chat.forEach(m => { if (m.who === old) m.who = now; }); });
      save('games'); toast('Profilo salvato'); refresh();
    });
    $('#nickname').value = state.profile.nickname;
    $('#avatarBtn').addEventListener('click', () => { state.profile.color = (state.profile.color + 1) % AVATAR_COLORS.length; save('profile'); renderProfile(); });
    $('#addFriendForm').addEventListener('submit', e => { e.preventDefault(); addFriendByNick($('#friendNick').value); $('#friendNick').value = ''; });
    $('#notifyFavs').addEventListener('change', e => {
      state.prefs.notifyFavs = e.target.checked; save('prefs');
      if (e.target.checked) { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (err) { /* niente */ } toast('Avvisi attivi per i campi preferiti'); setTimeout(favWatch, 3000); }
      else toast('Avvisi disattivati');
    });
    $('#resetDemo').addEventListener('click', () => { store.clear(); location.reload(); });
    $('#noticeClose').addEventListener('click', () => { $('#notice').hidden = true; });
    $('#noticeOpen').addEventListener('click', () => { const id = $('#notice').dataset.game; $('#notice').hidden = true; showView('home'); openSheet('game', id); });
    $('#shareCourt').addEventListener('change', drawShare);
    $('#shareGo').addEventListener('click', doShare);
    $('#shareSave').addEventListener('click', saveShare);
  }

  /* ---------- avvio ---------- */
  document.title = C.appName;
  bind(); refresh(); initMap();
  setInterval(() => { pruneGames(); favWatch(); refresh(); }, MIN);
  setTimeout(favWatch, 4000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
