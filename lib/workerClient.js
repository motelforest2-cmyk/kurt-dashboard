// ============================================================
// lib/workerClient.js — Client autenticato verso il Worker Cloudflare
// ============================================================
// Il sito si autentica al Worker con lo stesso schema HMAC per-bot
// dell'Alan vero (X-Kurt-Id / X-Kurt-Ts / X-Kurt-Sign). MA il secret
// NON va incollato a mano: il sito se lo fa dare dal Worker chiamando
// POST /register-bot con il proprio botId (endpoint v5.0). La chiamata
// è idempotente: la prima volta genera il secret, le volte successive
// restituisce lo stesso. Se WORKER_HMAC_SECRET è impostato a mano, quello
// ha la precedenza (utile per test).
//
// Cosa serve firmato e cosa no (dal contratto del Worker):
//   • PUT /pending-creds  (consegna creds) → NON firmato (protetto dal
//     codice usa-e-getta). La firmiamo comunque, è innocua e a prova di
//     futuro se un giorno il Worker la richiederà.
'use strict';

const crypto = require('crypto');
const fetch = require('node-fetch');

const BASE_URL = process.env.WORKER_BASE_URL || 'https://alan-stats.watusigold99.workers.dev';
const BOT_ID = process.env.WORKER_BOT_ID || 'kurt-render-web';

let cachedSecret = process.env.WORKER_HMAC_SECRET || null;
let secretPromise = null;
let warnedNoSecret = false;

// Ottiene il secret: da env se impostato, altrimenti dal Worker via
// /register-bot (una sola volta, poi in cache in memoria).
async function ensureSecret() {
    if (cachedSecret) return cachedSecret;
    if (!secretPromise) secretPromise = registerBot();
    return secretPromise;
}

async function registerBot() {
    try {
        const res = await fetch(`${BASE_URL}/register-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: BOT_ID })
        });
        if (res.status === 403) {
            console.log('[workerClient] ⛔ /register-bot: questo servizio risulta sospeso lato Worker.');
            return null;
        }
        if (!res.ok) {
            console.log(`[workerClient] /register-bot non riuscito (HTTP ${res.status}) — riprovo al prossimo bisogno.`);
            secretPromise = null; // consenti un nuovo tentativo più avanti
            return null;
        }
        const data = await res.json();
        if (data && data.botSecret) {
            cachedSecret = data.botSecret;
            console.log(`[workerClient] ✅ Secret ottenuto dal Worker${data.resumed ? ' (riusato)' : ''}.`);
            return cachedSecret;
        }
        return null;
    } catch (err) {
        console.log(`[workerClient] /register-bot fallito (${err.message}) — riprovo al prossimo bisogno.`);
        secretPromise = null;
        return null;
    }
}

// Pre-carica il secret all'avvio (best-effort): così è già pronto quando serve.
function warmup() {
    ensureSecret().catch(() => {});
}

// Header firmati per un payload. IMPORTANTE: firma la STESSA stringa passata
// come body, mai una ri-serializzazione. Senza secret → solo Content-Type
// (grace mode), con un warning una sola volta.
async function signedHeaders(payload) {
    const secret = await ensureSecret();
    if (!secret) {
        if (!warnedNoSecret) {
            warnedNoSecret = true;
            console.log('[workerClient] ⚠️ Nessun secret disponibile — chiamate NON firmate (grace mode).');
        }
        return { 'Content-Type': 'application/json' };
    }
    const ts = Date.now().toString();
    const sign = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
    return {
        'Content-Type': 'application/json',
        'X-Alan-Id': BOT_ID,
        'X-Alan-Ts': ts,
        'X-Alan-Sign': sign
    };
}

// Consegna le creds per un codice di abbinamento in attesa (PUT /pending-creds).
// Ritorna { ok:true } su successo, { ok:false, status } se il Worker rifiuta
// (es. 404 = codice scaduto/errato). Lancia solo su errore di rete.
async function deliverCreds(code, creds) {
    const body = JSON.stringify({ code, creds });
    const res = await fetch(`${BASE_URL}/pending-creds`, {
        method: 'PUT',
        headers: await signedHeaders(body),
        body
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true };
}
