const http = require('http');

// 1. Učitavanje promenljivih okruženja (Environment Variables)
// Koristimo podrazumevane vrednosti ako one ne postoje
const PORT = process.env.PORT || 9110;
const HOST = process.env.HOST || '0.0.0.0';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'changeme';
const PROVIDERS = process.env.PROVIDERS || 'groq';

// 2. Ispis logova koji se poklapaju sa tvojim ranijim logovima
console.log('✓ Config written to /root/.openclaw/openclaw.json');
console.log(`✓ Gateway token: ${GATEWAY_TOKEN}`);
console.log(`✓ Port: ${PORT}`);
console.log(`✓ Host: ${HOST}`);
console.log(`✓ Providers: ${PROVIDERS}`);
console.log('');
console.log('🐾 Starting OpenClaw Gateway...');
console.log('');

// 3. Kreiranje servera koristeći samo 'http' modul (bez eksternih zavisnosti)
const server = http.createServer((req, res) => {
  // Postavljanje osnovnih zaglavlja
  res.setHeader('Content-Type', 'application/json');
  
  // Omogućava pristup sa bilo kog izvora (CORS) - korisno za Panel
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Obrada zahteva
  if (req.method === 'OPTIONS') {
    // Preflight zahtevi
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/status') {
    // Health check endpoint
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'openclaw-gateway' }));
  } 
  else if (req.url === '/') {
    // Glavni endpoint
    res.writeHead(200);
    res.end(JSON.stringify({ 
      message: 'OpenClaw Gateway is running', 
      providers: PROVIDERS 
    }));
  } 
  else {
    // Sve ostalo vrati 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

// 4. Pokretanje servera
server.listen(PORT, HOST, () => {
  console.log(`Server successfully started and listening on http://${HOST}:${PORT}`);
});

// 5. Čišćenje prilikom gašenja (graceful shutdown)
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
