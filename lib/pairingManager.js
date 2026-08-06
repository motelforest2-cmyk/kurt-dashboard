'use strict';

const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

async function avviaSessione({ sessionId, phone, method, send }) {
    const sessionPath = path.join(__dirname, '../bot/session', sessionId);

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        mobile: method === 'code' // pairing code richiede modalità mobile
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { qr, pairingCode, connection } = update;

        if (qr && method === 'qr') {
            send({ t: 'qr', qr });
        }

        if (pairingCode && method === 'code') {
            send({ t: 'code', code: pairingCode });
        }

        if (connection === 'open') {
            send({ t: 'connected', sessionId });
        }
    });

    return {
        stop() {
            try { sock.end(); } catch {}
        }
    };
}

module.exports = { avviaSessione };
