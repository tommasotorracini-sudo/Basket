// Impostazioni del prototipo: modifica qui zona e nome.
window.CONFIG = {
  appName: 'Check Camp',          // nome scelto dall'autore
  center: [45.5416, 10.2118],     // centro iniziale della mappa (Brescia)
  zoom: 14,
  // Server Overpass che legge i dati di OpenStreetMap
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  // Info di esempio: completano quelle che mancano in OpenStreetMap, per mostrare come funziona la sezione Info.
  // Le info vere di OpenStreetMap, quando ci sono, restano quelle.
  exampleInfo: { surface: 'cemento', lit: 'parziale', hoops: 2, access: 'libero' },
  // Campi inseriti a mano dall'autore, visitati di persona.
  // lat e lon sono facoltativi: se mancano, l'app cerca l'indirizzo una volta sola (Nominatim, OpenStreetMap).
  // Se in OpenStreetMap c'è già un campo a meno di 150 m, l'app usa quello invece di aggiungerne un altro.
  extraCourts: [
    { id: 'extra/balestrieri', name: 'Campo di via Balestrieri', address: 'Via Federico Balestrieri 6, 25124 Brescia' },
    { id: 'extra/rhino', name: 'Rhino skatepark', address: 'Rhino skatepark, 25124 Brescia', search: 'Rhino skatepark, Brescia' },
    { id: 'extra/pista', name: 'Campo Pista', address: 'Viale del Piave 40, 25123 Brescia' }
  ],
  // Durata delle segnalazioni di presenza (requisito R2: scadenza automatica)
  checkinMinutes: 120,
  arrivingMinutes: 45,
  // Allenamento: categorie ed esercizi. Si possono rinominare liberamente.
  // fatti / tentati = le due parole che compaiono sotto i numeri e nel grafico.
  train: [
    { id: 'tiro', name: 'Tiro', fatti: 'canestri fatti', tentati: 'tiri tentati',
      drills: { liberi: 'Tiri liberi', triple: 'Triple' } },
    { id: 'palleggio', name: 'Palleggio', fatti: 'riusciti', tentati: 'tentati',
      drills: { palleggio: 'Palleggio' } },
    { id: 'dribbling', name: 'Dribbling', fatti: 'riusciti', tentati: 'tentati',
      drills: { dribbling: 'Dribbling' } },
    { id: 'stoppatore', name: 'Stoppatore', fatti: 'stoppate riuscite', tentati: 'tentativi',
      drills: { stoppate: 'Stoppate' } }
  ]
};
