// ============================================================
// lib/flow.js — Logica post-connessione (il porting di .alan sul web)
// ============================================================
// Dopo che il pairing è riuscito, il socket temporaneo è autenticato come
// l'account dell'utente. Da qui in poi tutto avviene nella chat personale
// dell'utente (self-chat), come fa demoPairManager dell'Alan vero:
//   1. messaggio di benvenuto + bivio "installazione automatica?" (bottoni)
//   2. Sì  → attende il codice di abbinamento in chat → consegna le creds
//            al Worker Cloudflare (PUT /pending-creds)
//   3. No  → invia il file creds.json + la guida manuale
'use strict';

const fs = require('fs');
const path = require('path');
const { delay } = require('./wa');
const { normalizeAbbinamento } = require('./util');
const workerClient = require('./workerClient');

const BIVIO_REMINDER_MS = 60 * 1000;
const BIVIO_TIMEOUT_MS = 120 * 1000;
const CODE_TIMEOUT_MS = 15 * 60 * 1000;

// Canale ALAN (contextInfo) — stesso branding del bot vero.
const alanChannel = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363398375183048@newsletter',
        newsletterName: 'ALAN',
        serverMessageId: -1
    }
};

// ─── Estrazione testo/bottone da un messaggio in arrivo ─────────────────────
function estraiRisposta(m) {
    const msg = m.message || {};
    if (msg.conversation) return msg.conversation.trim();
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text.trim();
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
    // Bottoni "nativi" dei fork reverse: la scelta arriva in paramsJson.
    const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
    if (nf?.paramsJson) {
        try {
            const p = JSON.parse(nf.paramsJson);
            if (p.id) return String(p.id);
        } catch { /* ignora */ }
    }
    return '';
}

// Attende un messaggio dalla self-chat che soddisfa `match(testo)`.
// Risolve con il testo, o null allo scadere di timeoutMs. onReminder (facolt.)
// viene chiamato una volta a metà tempo.
function attendiRisposta(sock, myJid, match, timeoutMs, onReminder) {
    return new Promise((resolve) => {
        let done = false;
        let reminderTimer = null;

        const finish = (val) => {
            if (done) return;
            done = true;
            if (reminderTimer) clearTimeout(reminderTimer);
            clearTimeout(deadline);
            sock.ev.off('messages.upsert', handler);
            resolve(val);
        };

        const handler = ({ messages }) => {
            for (const m of messages || []) {
                if (!m.message) continue;
                if (m.key?.remoteJid !== myJid) continue;
                const testo = estraiRisposta(m);
                if (testo && match(testo)) {
                    finish(testo);
                    return;
                }
            }
        };

        sock.ev.on('messages.upsert', handler);
        const deadline = setTimeout(() => finish(null), timeoutMs);
        if (onReminder) {
            reminderTimer = setTimeout(() => { if (!done) onReminder(); }, Math.floor(timeoutMs / 2));
        }
    });
}

// ─── Invio del bivio con bottoni (+ fallback testo) ─────────────────────────
async function inviaBivio(sock, myJid) {
    const testo =
        `🤔 *Vuoi l'installazione automatica su Katabump/Quaxly?*\n\n` +
        `✅ *Sì* → installazione automatica (ti guido passo passo)\n` +
        `📄 *No* → ti mando il file e la guida manuale\n\n` +
        `Se i bottoni non compaiono, rispondi scrivendo *si* oppure *no*.`;

    try {
        await sock.sendMessage(myJid, {
            text: testo,
            footer: 'Alan Cloud ☁️',
            buttons: [
                { buttonId: 'alan_si', buttonText: { displayText: '✅ Sì, automatica' }, type: 1 },
                { buttonId: 'alan_no', buttonText: { displayText: '📄 No, manuale' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: alanChannel
        });
    } catch (err) {
        // Se il fork non supporta i bottoni, ripiego su un messaggio semplice.
        console.log('[flow] Bottoni non inviati, uso testo semplice:', err.message);
        await sock.sendMessage(myJid, { text: testo, contextInfo: alanChannel });
    }
}

function isSi(t) { return t === 'alan_si' || /^s[iì]$/i.test(t) || /^\.?alan\s+s[iì]$/i.test(t); }
function isNo(t) { return t === 'alan_no' || /^no$/i.test(t) || /^\.?alan\s+no$/i.test(t); }

// ─── Ramo automatico: attende il codice e consegna le creds ─────────────────
async function ramoAutomatico(sock, myJid, creds, send) {
    await sock.sendMessage(myJid, {
        text:
            `🚀 *Installazione automatica*\n\n` +
            `1️⃣ Avvia PRIMA il tuo server (Katabump/Quaxly) col file di installazione — così il codice sarà già pronto in console (o via mail, se l'hai registrata).\n` +
            `2️⃣ Poi mandami qui il *codice di abbinamento* (es. \`A1B2-C3D4\`).\n\n` +
            `⏳ Hai 15 minuti prima che le credenziali in attesa scadano.`,
        contextInfo: alanChannel
    });
    send({ t: 'status', state: 'waiting_abbinamento', msg: 'In attesa del codice di abbinamento in chat…' });

    const codiceRaw = await attendiRisposta(
        sock, myJid,
        (t) => normalizeAbbinamento(t) !== null,
        CODE_TIMEOUT_MS
    );

    if (!codiceRaw) {
        await sock.sendMessage(myJid, {
            text: `⏱️ *Tempo scaduto*\n\nNon ho ricevuto nessun codice entro 15 minuti. Se vuoi riprovare, rifai la procedura dal sito.`,
            contextInfo: alanChannel
        });
        send({ t: 'status', state: 'expired', msg: 'Codice non ricevuto in tempo.' });
        return;
    }

    const code = normalizeAbbinamento(codiceRaw);
    send({ t: 'status', state: 'delivering', msg: 'Consegno le credenziali…' });

    try {
        const res = await workerClient.deliverCreds(code, creds);
        if (res.ok) {
            await sock.sendMessage(myJid, {
                text: `✅ *Consegnato!*\n\nIl tuo server riceverà le credenziali entro pochi secondi e partirà da solo.`,
                contextInfo: alanChannel
            });
            send({ t: 'status', state: 'done_auto', msg: 'Credenziali consegnate. Installazione in corso sul tuo server.' });
        } else {
            await sock.sendMessage(myJid, {
                text: `❌ Codice scaduto o errato. Riprova a mandarmi il codice giusto.`,
                contextInfo: alanChannel
            });
            send({ t: 'status', state: 'error', msg: `Consegna rifiutata (HTTP ${res.status}).` });
        }
    } catch (err) {
        await sock.sendMessage(myJid, {
            text: `⚠️ Errore nella consegna delle credenziali: ${err.message}`,
            contextInfo: alanChannel
        });
        send({ t: 'status', state: 'error', msg: 'Errore di rete durante la consegna.' });
    }
}

// ─── Ramo manuale: invia il file creds.json + guida ─────────────────────────
async function ramoManuale(sock, myJid, credsBuffer, send) {
    await sock.sendMessage(myJid, {
        document: credsBuffer,
        fileName: 'creds.json',
        mimetype: 'application/json',
        caption: `🔐 *IL TUO FILE SESSIONE*\n\nCarica questo file nella cartella *session* del tuo bot.`,
        contextInfo: alanChannel
    });

    await delay(1500);

    await sock.sendMessage(myJid, {
        text:
            `📖 *GUIDA RAPIDA*\n\n` +
            `1️⃣ Scarica il pacchetto ALAN e caricalo sul tuo hosting.\n` +
            `2️⃣ Metti il file \`creds.json\` qui sopra nella cartella \`session\`.\n` +
            `3️⃣ Avvia il bot.\n\n` +
            `Per assistenza contatta *Red*.`,
        contextInfo: alanChannel
    });

    send({ t: 'status', state: 'done_manual', msg: 'File e guida inviati nella tua chat WhatsApp.' });
}

// ─── Entry point ────────────────────────────────────────────────────────────
// ctx = { send, sessionDir, onFinish }
async function runPostConnect(sock, ctx) {
    const { send, sessionDir, onFinish } = ctx;
    try {
        const numero = sock.user.id.split(':')[0].split('@')[0];
        const myJid = numero + '@s.whatsapp.net';

        // Le creds appena salvate su disco (il file che poi consegneremo).
        const credsPath = path.join(sessionDir, 'creds.json');
        const credsBuffer = fs.readFileSync(credsPath);
        const creds = JSON.parse(credsBuffer.toString('utf8'));

        await sock.sendMessage(myJid, {
            text: `✅ *Collegato!*\n\nSono Alan Cloud ☁️. Ora scegli come vuoi installare il bot.`,
            contextInfo: alanChannel
        });

        await inviaBivio(sock, myJid);
        send({ t: 'status', state: 'bivio', msg: 'Controlla WhatsApp: scegli Sì (automatica) o No (manuale).' });

        const scelta = await attendiRisposta(
            sock, myJid,
            (t) => isSi(t) || isNo(t),
            BIVIO_TIMEOUT_MS,
            () => {
                sock.sendMessage(myJid, {
                    text: `⏳ Aspetto ancora 1 minuto una risposta (*si* / *no*), poi procedo col metodo classico.`,
                    contextInfo: alanChannel
                }).catch(() => {});
            }
        );

        if (scelta && isSi(scelta)) {
            await ramoAutomatico(sock, myJid, creds, send);
        } else {
            if (!scelta) {
                await sock.sendMessage(myJid, {
                    text: `⏱️ Nessuna risposta ricevuta, ho proceduto col metodo classico.`,
                    contextInfo: alanChannel
                }).catch(() => {});
            }
            await ramoManuale(sock, myJid, credsBuffer, send);
        }
    } catch (err) {
        console.error('[flow] Errore:', err);
        send({ t: 'status', state: 'error', msg: 'Errore interno durante la procedura.' });
    } finally {
        if (typeof onFinish === 'function') onFinish();
    }
}

module.exports = { runPostConnect };
