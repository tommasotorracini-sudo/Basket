// Impostazioni del prototipo: modifica qui zona e nome.
window.CONFIG = {
  appName: 'Check Camp',          // nome scelto dall'autore
  center: [45.5416, 10.2118],     // centro iniziale della mappa (Brescia)
  zoom: 14,
  // Server Overpass che legge i dati di OpenStreetMap
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  // Durata delle segnalazioni di presenza (requisito R2: scadenza automatica)
  checkinMinutes: 120,
  arrivingMinutes: 45
};
