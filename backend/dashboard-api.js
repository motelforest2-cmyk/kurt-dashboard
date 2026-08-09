// dashboard-api.js
import express from "express"
import fetch from "node-fetch"
import fs from "fs"

// CONFIGURAZIONE
const VPS_URL = "http://216.40.79.16"     // ← METTI IP PUBBLICO DEL VPS
const API_KEY = "9f3b1c2e7a4d9b8c6f1e3a7d2c9f4b1" // stessa API key del VPS

// LOG FILE
const LOG_FILE = "./dashboard-log.json"

// Funzione log
function logEvent(event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    data
  }

  let logs = []
  if (fs.existsSync(LOG_FILE)) {
    logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"))
  }

  logs.push(entry)
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2))
}

// EXPRESS
const app = express()
app.use(express.json())

// HEALTHCHECK
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dashboard-api" })
})

// ─────────────────────────────────────────────
// DASHBOARD → VPS → BOT
// invia messaggi WhatsApp
// ─────────────────────────────────────────────
app.post("/api/send", async (req, res) => {
  try {
    const { botNumber, to, text } = req.body

    logEvent("dashboard_send", { botNumber, to, text })

    const response = await fetch(`${VPS_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "9f3b1c2e7a4d9b8c6f1e3a7d2c9f4b1"
      body: JSON.stringify({ botNumber, to, text })
    })

    const data = await response.json()
    return res.json({ ok: true, vpsResponse: data })
  } catch (err) {
    logEvent("dashboard_send_error", err.message)
    return res.status(500).jso"n({ ok: false, error: err.message })
  }
})

// ─────────────────────────────────────────────
// VPS → DASHBOARD
// eventi del bot (installazioni, pairing, errori)
// ─────────────────────────────────────────────
app.post("/api/events", async (req, res) => {
  try {
    const { event, botNumber, serverId, whatsapp, message } = req.body

    logEvent("vps_event", req.body)

    // Qui puoi aggiornare il database della dashboard
    // oppure inviare notifiche in tempo reale al frontend

    return res.json({ ok: true })
  } catch (err) {
    logEvent("vps_event_error", err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ─────────────────────────────────────────────
// DASHBOARD → VPS
// installazione manuale Wispbyte
// ─────────────────────────────────────────────
app.post("/api/install", async (req, res) => {
  try {
    const { serverId, botNumber, whatsapp } = req.body

    logEvent("dashboard_install", { serverId, botNumber, whatsapp })

    const response = await fetch(`${VPS_URL}/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "9f3b1c2e7a4d9b8c6f1e3a7d2c9f4b1"
      },
      body: JSON.stringify({ serverId, number: botNumber, whatsapp })
    })

    const data = await response.json()
    return res.json({ ok: true, vpsResponse: data })
  } catch (err) {
    logEvent("dashboard_install_error", err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ─────────────────────────────────────────────
// AVVIO SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[DASHBOARD-API] Server attivo su porta ${PORT}`)
})
