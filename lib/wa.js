// ============================================================
// lib/wa.js — Punto UNICO di import della libreria WhatsApp
// ============================================================
// Tutto il resto del progetto importa Baileys SOLO da qui. Così cambiare
// fork è una riga sola, senza toccare pairingManager/flow.
//
// Di default usiamo un fork "reverse" che supporta i bottoni interattivi
// (il Baileys ufficiale @whiskeysockets/baileys oggi non li renderizza sui
// WhatsApp aggiornati). Se il nome/versione del fork non risolve su Render:
//   1. cambia la dipendenza in package.json, e
//   2. cambia la stringa qui sotto in PACKAGE.
// Un fallback funzionante (ma SENZA bottoni) è '@whiskeysockets/baileys'.
'use strict';

const PACKAGE = '@realvare/baileys';

let baileys;
try {
    baileys = require(PACKAGE);
} catch (err) {
    console.error(`[wa] Impossibile caricare "${PACKAGE}": ${err.message}`);
    console.error('[wa] Controlla la dipendenza in package.json (vedi commento in lib/wa.js).');
    throw err;
}

// I fork espongono makeWASocket come default export; normalizziamo.
const makeWASocket = baileys.default || baileys.makeWASocket || baileys;

module.exports = {
    makeWASocket,
    useMultiFileAuthState: baileys.useMultiFileAuthState,
    fetchLatestBaileysVersion: baileys.fetchLatestBaileysVersion,
    Browsers: baileys.Browsers,
    DisconnectReason: baileys.DisconnectReason,
    makeCacheableSignalKeyStore: baileys.makeCacheableSignalKeyStore,
    delay: baileys.delay,
    proto: baileys.proto
};
