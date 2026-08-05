// ============================================================
// lib/util.js — Piccole utility condivise
// ============================================================
'use strict';

const crypto = require('crypto');

// ID di sessione casuale (una per pairing in corso).
function newSessionId() {
    return crypto.randomBytes(8).toString('hex');
}

// Ripulisce un numero di telefono: solo cifre, niente +, spazi, trattini.
// Stesso comportamento del comando .kurt.
function sanitizePhone(raw) {
    return String(raw || '').replace(/\D/g, '');
}

// Un numero E.164 senza + sta tra ~8 e 15 cifre.
function isPhoneValid(phone) {
    return /^\d{8,15}$/.test(phone);
}

// Formatta un codice pairing WhatsApp (8 char) in blocchi da 4: ABCD-EFGH.
function formatPairingCode(code) {
    if (!code) return code;
    return code.match(/.{1,4}/g)?.join('-') || code;
}

// Riconosce/normalizza un codice di abbinamento tipo A1B2-C3D4 (o senza
// trattino, 8 caratteri). Ritorna la forma con trattino in maiuscolo, o null.
const CODE_DASH = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
const CODE_RAW = /^[A-Z0-9]{8}$/i;
function normalizeAbbinamento(input) {
    const up = String(input || '').trim().toUpperCase();
    if (CODE_DASH.test(up)) return up;
    if (CODE_RAW.test(up)) return `${up.slice(0, 4)}-${up.slice(4)}`;
    return null;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
    newSessionId,
    sanitizePhone,
    isPhoneValid,
    formatPairingCode,
    normalizeAbbinamento,
    isEmailValid,
    sleep
};
