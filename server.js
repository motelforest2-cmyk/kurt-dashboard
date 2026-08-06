'use strict';

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { avviaSessione } = require('./pairingManager');
const { newSessionId } = require('./util');

const app = express();
app.use(express.json());

// Endpoint di salute
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

// Avvio pairing via HTTP (QR o CODE)
app.post('/pairing/start', async (req, res) => {
    const { phone, method } = req.body;
    const sessionId = newSessionId();

    try {
        await avviaSessione({
            sessionId,
            phone,
            method,
            send: () => {}
        });

        res.json({ ok: true, sessionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Server HTTP + WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    const sessionId = newSessionId();
    let handle = null;

    const send = (obj) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    };

    // Dashboard ready
    send({ t: 'ready' });

    ws.on('message', async (raw) => {
        let data;
        try { data = JSON.parse(raw.toString()); } catch { return; }

        if (data.t === 'start') {
            if (handle) return;

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
        try { handle?.stop?.(); } catch {}
    });
});

server.listen(3001, () => {
    console.log('API WhatsApp Bot attive su porta 3001');
});
