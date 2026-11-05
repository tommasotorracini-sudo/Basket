// Impostazioni del prototipo: modifica qui zona e nome.
window.CONFIG = {
  appName: 'Check Camp',          // nome scelto dall'autore
  center: [45.5416, 10.2118],     // centro iniziale della mappa (Brescia)
  zoom: 14,
  // Server Overpass che legge i dati di OpenStreetMap
  overpassUrl: 'https://overpass-api.de/api/interpreter',
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
