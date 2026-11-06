# Check Camp: prototipo PWA della tesi

Web app che si apre dal telefono e si può aggiungere alla schermata Home (Progressive Web App).
Il nome dell'app («Check Camp») si cambia in `js/config.js` e in `manifest.webmanifest`.

## Cosa è vero e cosa è simulato

| Funzione | Stato |
|---|---|
| Mappa | vera (OpenStreetMap) |
| Campi da basket e loro caratteristiche (pavimentazione, luci, canestri, accesso) | **veri**, letti da OpenStreetMap tramite Overpass |
| Campi inseriti a mano (via Balestrieri, Rhino skatepark, Campo Pista), visitati dall'autore | in `js/config.js` → `extraCourts`; la posizione si ricava dall'indirizzo |
| Info mancanti in OpenStreetMap (pavimentazione, luci, canestri, accesso) | **valori di esempio** uguali per tutti (`exampleInfo` in `js/config.js`), per mostrare la funzione |
| Ricerca del campo per nome | vera, sui campi già caricati sulla mappa |
| La tua posizione | vera, solo se la autorizzi; non viene inviata a nessuno |
| Dimensione dell'icona del campo (quanto è frequentato) | **simulata** |
| Creare una partita: solo da chi è al campo («Sono al campo adesso»), formato, orario non prima di adesso, tempo per rispondere | funziona nel telefono; la presenza al campo è dichiarata con una casella, non verificata col GPS |
| «Ci sono» (si toglie ripremendolo), barra di riempimento che sale e scende (es. 2 / 4) | funziona; gli altri giocatori che rispondono sono **simulati** |
| Partita non completata entro il tempo per rispondere | diventa «Non confermata» e sparisce dalla mappa |
| Partita completata | resta in piedi: se qualcuno toglie «Ci sono», la barra scende e il posto si riapre fino all'inizio; poi «in corso» per 60 minuti |
| Partite degli altri sulla mappa | **simulate** (circa un campo su tre, dalle 8 alle 22) |
| Chat della partita | temporanea: la vedono solo gli iscritti e sparisce con la partita; risposte **simulate** |
| Foto profilo (scelta dalla galleria, ritagliata quadrata) | salvata solo sul telefono |
| Amici: aggiunti scambiandosi il nickname, richieste da accettare | salvati solo sul telefono; le risposte degli altri sono **simulate** |
| Chat con gli amici | permanente, nasce quando l'amicizia è accettata; con il tasto di condivisione sulla partita la si manda in chat a un amico |
| Stato degli amici («al campo», «iscritto a una partita») | **simulato**; non esiste online/offline |
| Allenamento: Tiro (tiri liberi, triple), Palleggio, Dribbling, Stoppatore; riusciti su tentati, media | salvato solo sul telefono, visibile solo a te; i numeri li inserisce l'utente. Categorie, esercizi e parole si cambiano in `js/config.js` |
| Condivisione dell'allenamento (immagine, WhatsApp) | vera: l'immagine viene creata sul telefono |
| Campi preferiti e avviso quando parte una partita | preferiti veri; la partita che fa scattare l'avviso è **simulata** |
| Segnalazioni sullo stato del campo, con conferme | **simulate**; quelle che aggiungi restano sul telefono |
| Foto del campo | **segnaposto** |
| Eventi e tornei | **tolti**: si vedono solo le partite in corso o in partenza |

Nella tesi va scritto così: il prototipo usa dati reali per i campi e dati simulati per le funzioni sociali.

## Struttura

```
index.html            struttura delle schermate
css/style.css         stile del prototipo: il rosso del logo e le sue tonalità (variabili :root in cima al file)
js/config.js          zona iniziale della mappa, nome, durata delle segnalazioni
js/app.js             logica dell'app
manifest.webmanifest  nome, icone e colori dell'app installata
sw.js                 service worker (fa aprire l'app anche con rete debole)
icons/                icone provvisorie, da sostituire con quelle del marchio
```

## Pubblicarla gratis su GitHub Pages

1. Crea un account su github.com.
2. Crea un nuovo repository pubblico, per esempio `campetti`.
3. Nel repository: **Add file → Upload files**, trascina tutto il contenuto della cartella (non la cartella stessa) e conferma con **Commit changes**.
4. Vai su **Settings → Pages**. In "Branch" scegli `main` e la cartella `/ (root)`, poi **Save**.
5. Dopo un paio di minuti l'app è online all'indirizzo `https://TUONOME.github.io/campetti/`.
6. Dal telefono apri l'indirizzo e scegli **Aggiungi a schermata Home** (iPhone: tasto Condividi in Safari; Android: menu di Chrome).

Ogni volta che carichi file nuovi, il sito si aggiorna da solo in un paio di minuti.

## Cambiare zona

In `js/config.js` modifica `center` con le coordinate della tua zona (le trovi su openstreetmap.org: tasto destro sul punto → "Mostra indirizzo"). Sulla mappa puoi comunque spostarti e premere "Cerca campi in quest'area".

## Cose da sapere

- **Dati OpenStreetMap.** Sono inseriti da volontari: alcuni campi mancano o hanno informazioni incomplete ("non indicato"). Il pulsante "Segnala una modifica" porta all'editor di OpenStreetMap. Nella tesi la fonte va citata come "© contributori di OpenStreetMap" (licenza ODbL).
- **Overpass** è un servizio gratuito con limiti d'uso: va bene per la tesi e per i test con poche persone, non per un'app con molti utenti.
- **La posizione** funziona solo su indirizzi https, quindi sì su GitHub Pages, no aprendo il file dal computer.
- Il pulsante "Azzera i dati della demo" nel profilo cancella partite, chat e sessioni salvate: utile prima di ogni test con un nuovo utente.

## Prossimi passi

1. Definire il design in Figma (wireframe → interfaccia).
2. Riportare colori, caratteri e icone del marchio in `css/style.css` e in `icons/`.
3. Usare il link o un QR code per il test con 5-8 persone.
