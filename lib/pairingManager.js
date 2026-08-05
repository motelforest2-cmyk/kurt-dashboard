// ============================================================
// lib/pairingManager.js — Ciclo di vita di un pairing WhatsApp temporaneo
// ============================================================
// Una sessione = un utente che sta collegando il proprio bot dal sito.
// Crea un socket Baileys usa-e-getta in una cartella temporanea, mostra
// QR o codice sul sito (via callback `send`), e all'avvenuta connessione
// passa la mano a flow.runPostConnect. Poi pulisce tutto.
'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('./wa');

const QRCode = require('qrcode');
const { runPostConnect } = require('./flow');
const { sanitizePhone, isPhoneValid } = require('./util');

const SESSIONS_ROOT = path.join(process.cwd(), 'sessions');
const SESSION_TTL_MS = 20 * 60 * 1000; // hard limit: 20 min per sessione

const MAX_SESSIONI = parseInt(process.env.MAX_SESSIONI || '15', 10);
const attive = new Map(); // sessionId -> handle

function ensureRoot() {
    if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

function rimuoviCartella(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignora */ }
}

// Avvia una sessione di pairing.
//   opts = { sessionId, method: 'qr'|'code', phone, send }
//   send(obj) → invia un messaggio JSON al client (WebSocket)
// Ritorna un handle con .stop().
async function avviaSessione(opts) {
    const { sessionId, method, send } = opts;

    if (attive.size >= MAX_SESSIONI) {
        send({ t: 'error', msg: 'Il servizio è momentaneamente al completo. Riprova tra qualche minuto.' });
        return null;
    }

    const phone = sanitizePhone(opts.phone);
    if (method === 'code' && !isPhoneValid(phone)) {
        send({ t: 'error', msg: 'Numero non valido. Usa il formato internazionale senza + e senza spazi (es. 39333...).' });
        return null;
    }

    ensureRoot();
    const sessionDir = path.join(SESSIONS_ROOT, sessionId);

    const handle = {
        sessionId,
        sock: null,
        cleaned: false,
        finished: false,
        codeRequested: false,
        stop: () => cleanup()
    };
    attive.set(sessionId, handle);

    const cleanup = () => {
        if (handle.cleaned) return;
        handle.cleaned = true;
        clearTimeout(ttlTimer);
        try { handle.sock?.ev?.removeAllListeners?.(); } catch {}
        try { handle.sock?.ws?.close?.(); } catch {}
        setTimeout(() => rimuoviCartella(sessionDir), 3000);
        attive.delete(sessionId);
    };

    const ttlTimer = setTimeout(() => {
        if (!handle.finished) {
            send({ t: 'status', state: 'expired', msg: 'Tempo scaduto. Ricarica la pagina per riprovare.' });
        }
        cleanup();
    }, SESSION_TTL_MS);

    const connect = async () => {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        let version;
        try {
            ({ version } = await fetchLatestBaileysVersion());
        } catch {
            version = undefined; // il fork userà il default interno
        }

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore
                    ? makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                    : state.keys
            },
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0
        });
        handle.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // ── QR (metodo qr) ────────────────────────────────────────────
            if (qr && method === 'qr') {
                try {
                    const img = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
                    send({ t: 'qr', img });
                    send({ t: 'status', state: 'waiting_scan', msg: 'Inquadra il QR con WhatsApp per collegarti.' });
                } catch (e) {
                    console.error('[pairing] QR encode error:', e.message);
                }
            }

            // ── Codice pairing (metodo code) ──────────────────────────────
            if (connection === 'connecting' && method === 'code' && !handle.codeRequested) {
                handle.codeRequested = true;
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(phone);
                        const { formatPairingCode } = require('./util');
                        send({ t: 'pcode', code: formatPairingCode(code) });
                        send({ t: 'status', state: 'waiting_code_input', msg: 'Inserisci questo codice su WhatsApp (Dispositivi collegati → Collega con numero).' });
                    } catch (e) {
                        console.error('[pairing] pairing code error:', e.message);
                        send({ t: 'error', msg: 'Impossibile generare il codice. Controlla il numero e riprova.' });
                        cleanup();
                    }
                }, 2500);
            }

            // ── Connessione riuscita ──────────────────────────────────────
            if (connection === 'open') {
                send({ t: 'status', state: 'linked', msg: 'Collegato! Continua su WhatsApp.' });
                handle.finished = true; // impedisce il messaggio "scaduto" del TTL
                await runPostConnect(sock, {
                    send,
                    sessionDir,
                    onFinish: () => setTimeout(cleanup, 4000)
                });
            }

            // ── Connessione chiusa ────────────────────────────────────────
            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                const restart = DisconnectReason && code === DisconnectReason.restartRequired;
                if (restart && !handle.finished) {
                    // Baileys chiede un restart dopo la registrazione: riconnetti.
                    return connect();
                }
                if (!handle.finished && !handle.cleaned) {
                    send({ t: 'status', state: 'error', msg: 'Connessione chiusa prima del completamento. Riprova.' });
                    cleanup();
                }
            }
        });
    };

    try {
        await connect();
        send({ t: 'status', state: 'creating', msg: 'Preparo la connessione…' });
    } catch (err) {
        console.error('[pairing] avvio fallito:', err);
        send({ t: 'error', msg: 'Errore di avvio del pairing. Riprova.' });
        cleanup();
        return null;
    }

    return handle;
}

module.exports = { avviaSessione, attive };
