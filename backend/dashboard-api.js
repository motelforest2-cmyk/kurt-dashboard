import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";

const app = express();
app.use(express.json());

let PHONE = null;
let auth = null;

// -----------------------------
// 1️⃣ SET NUMBER
// -----------------------------
app.post("/api/set-number", (req, res) => {
    const { phone } = req.body;

    if (!phone || !/^[0-9]{8,15}$/.test(phone)) {
        return res.json({ ok: false, error: "Numero non valido" });
    }

    PHONE = phone;

    // Decidi se QR o pairing
    const mode = phone.startsWith("39") ? "qr" : "pairing";

    res.json({ ok: true, mode });
});

// -----------------------------
// 2️⃣ GET NUMBER
// -----------------------------
app.get("/api/get-number", (req, res) => {
    res.json({ phone: PHONE });
});

// -----------------------------
// 3️⃣ GENERA QR
// -----------------------------
app.get("/api/qr", async (req, res) => {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    auth = { state, saveCreds };

    // Baileys genera QR automaticamente
    res.setHeader("Content-Type", "image/png");
    res.end(Buffer.from("QR_PLACEHOLDER"));
});

// -----------------------------
// 4️⃣ PAIRING CODE
// -----------------------------
app.post("/api/pairing", async (req, res) => {
    const { code } = req.body;
    if (!code) return res.json({ ok: false, error: "Codice mancante" });

    res.json({ ok: true });
});

// -----------------------------
// 5️⃣ INSTALLAZIONE AUTOMATICA
// -----------------------------
app.post("/api/install", async (req, res) => {
    const { serverId } = req.body;

    if (!serverId) {
        return res.json({ ok: false, error: "ID server mancante" });
    }

    try {
        await fetch("https://216.40.79.16/install", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverId })
        });

        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// -----------------------------
// 6️⃣ INVIO PRIVATO CREDS.JSON AL CLIENTE
// -----------------------------
app.post("/api/send-creds-private", async (req, res) => {
    try {
        const credsPath = path.join("./auth", "creds.json");

        if (!fs.existsSync(credsPath)) {
            return res.json({ ok: false, error: "creds.json non trovato" });
        }

        const creds = JSON.parse(fs.readFileSync(credsPath));

        // Qui invii i creds al cliente
        // Puoi usare email, Telegram, Discord, ecc.
        // Esempio placeholder:
        console.log("Invio privato creds.json al cliente:", creds);

        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// -----------------------------
// 7️⃣ AVVIO SERVER
// -----------------------------
app.listen(3001, () => {
    console.log("Dashboard API attiva su porta 3001");
});
