// ============================================================
// server.js — Kurt Render: HTTP statico + WebSocket per il pairing
// ============================================================
'use strict';

require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { avviaSessione } = require('./lib/pairingManager');
const { newSessionId } = require('./lib/util');   // email rimossa
const workerClient = require('./lib/workerClient');

const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint di salute (utile per Render).
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    const sessionId = newSessionId();
    let handle = null;

    // Invia un oggetto JSON al client (se il socket è ancora aperto).
    const send = (obj) => {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(JSON.stringify(obj)); } catch { /* ignora */ }
        }
    };

    send({ t: 'ready' });

    ws.on('message', async (raw) => {
        let data;
        try { data = JSON.parse(raw.toString()); } catch { return; }

        if (data.t === 'start') {
            if (handle) return; // una sola sessione per connessione
            const method = data.method === 'code' ? 'code' : 'qr';
            handle = await avviaSessione({
                sessionId,
                method,
                phone: data.phone,
                send
            });
        }
    });

    ws.on('close', () => {
        // L'utente ha chiuso la pagina: interrompi il pairing se ancora attivo.
        try { handle?.stop?.(); } catch { /* ignora */ }
    });
});

server.listen(PORT, () => {
    console.log(`\n☁️  Kurt Render in ascolto sulla porta ${PORT}`);
    console.log(`   Apri http://localhost:${PORT}\n`);
    // Chiede il secret al Worker in anticipo, così è pronto quando serve.
    workerClient.warmup();
});
        }
    };

    send({ t: 'ready' });

    ws.on('message', async (raw) => {
        let data;
        try { data = JSON.parse(raw.toString()); } catch { return; }

        if (data.t === 'start') {
            if (handle) return; // una sola sessione per connessione
            const method = data.method === 'code' ? 'code' : 'qr';
            handle = await avviaSessione({
                sessionId,
                method,
                phone: data.phone,
                send
            });
        }

    ws.on('close', () => {
        // L'utente ha chiuso la pagina: interrompi il pairing se ancora attivo.
        try { handle?.stop?.(); } catch { /* ignora */ }
    });
});

server.listen(PORT, () => {
    console.log(`\n☁️  Alan Render in ascolto sulla porta ${PORT}`);
    console.log(`   Apri http://localhost:${PORT}\n`);
    // Chiede il secret al Worker in anticipo, così è pronto quando serve.
    workerClient.warmup();
});
