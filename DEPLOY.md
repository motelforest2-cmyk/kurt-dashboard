# Come mettere Kurt Render online (guida passo-passo)

Non serve saper programmare. Segui i passi in ordine. Ti serve solo un
account **GitHub** (gratis) e un account **Render** (gratis).

---

## Passo 1 — Metti il codice su GitHub

Render prende il codice da GitHub. Devi caricarci questa cartella
(`kurt-dashboard`).

**Modo più semplice (dal sito GitHub, senza comandi):**

1. Vai su https://github.com e fai login (o registrati, è gratis).
2. In alto a destra: **+** → **New repository**.
3. Nome: `alan-render`. Lascialo **Public** (o Private, va bene lo stesso).
   NON aggiungere README/gitignore (ce li hai già). Clicca **Create repository**.
4. Nella pagina che si apre, clicca **"uploading an existing file"**.
5. Trascina dentro **tutti i file e le cartelle** di `alan-render`
   (server.js, package.json, la cartella `lib`, la cartella `public`,
   render.yaml, ecc.). **NON** caricare la cartella `node_modules` se esiste.
6. In basso clicca **Commit changes**.

> Se preferisci i comandi (Git installato):
> ```bash
> cd kurt-dashboard
> git init
> git add .
> git commit -m "primo commit"
> git branch -M main
> git remote add origin https://github.com/TUONOME/alan-render.git
> git push -u origin main
> ```

---

## Passo 2 — Crea il servizio su Render

1. Vai su https://render.com e fai login con GitHub (bottone
   **"Sign in with GitHub"** — è la via più rapida, così Render vede i
   tuoi repo).
2. Dashboard Render → **New +** (in alto a destra) → **Blueprint**.
   - "Blueprint" perché nel progetto c'è già il file `render.yaml` che
     dice a Render come configurarsi da solo.
3. Se richiesto, autorizza Render ad accedere ai tuoi repo GitHub, poi
   **seleziona il repo `kurt-render`**.
4. Render legge `render.yaml` e ti mostra il servizio `kurt-render` già
   pronto (build `npm install`, start `npm start`). Clicca **Apply** /
   **Create**.
5. Aspetta il primo deploy (qualche minuto). Quando lo stato diventa
   **Live**, in alto trovi l'indirizzo pubblico del sito, tipo
   `https://kurt-dashboard.onrender.com`.

> **Alternativa senza Blueprint** (se preferisci): New + → **Web Service**
> → scegli il repo → imposta a mano: Build Command `npm install`,
> Start Command `npm start`, Health Check Path `/health`. Poi in
> **Environment** aggiungi `WORKER_BASE_URL` e `WORKER_BOT_ID` (vedi
> `.env.example`). **Non** impostare `PORT` (Render la mette da solo).

---

## Passo 3 — L'immagine di Kurt (facoltativo ma consigliato)

Il sito cerca un'immagine in `public/kurt.png`. Se non c'è, mostra un
robot 🤖 al suo posto. Per mettere il poster di Kurt:

1. Salva l'immagine del robot Kurt come file **`kurt.png`**.
2. Caricala su GitHub dentro la cartella **`public/`** (stesso metodo del
   Passo 1: apri la cartella `public` nel repo → **Add file** →
   **Upload files** → trascina `kurt.png` → Commit).
3. Render rifà il deploy da solo e la nuova immagine appare.

---

## Passo 4 — Prova

1. Apri l'indirizzo `https://...onrender.com` dal telefono o dal PC.
2. Scegli **QR** o **Codice**, collega un numero WhatsApp di prova.
3. Guarda WhatsApp: dovrebbe arrivare il messaggio col bivio Sì/No.

---

## Cose utili da sapere

- **Il secret Cloudflare è automatico.** Non devi incollare niente: al
  primo avvio il sito lo chiede da solo al tuo Worker (`POST /register-bot`).
  Perché funzioni, il Worker deve essere online e avere quell'endpoint (ce
  l'ha già nella tua versione v5.0).
- **Piano gratis di Render:** dopo ~15 minuti di inattività il servizio si
  "addormenta" e la prima apertura successiva è lenta (10-30s) mentre si
  risveglia. Normale sul piano free.
- **Aggiornare il sito:** carichi i file modificati su GitHub e Render
  rifà il deploy da solo. Nessun altro passaggio.
- **I bottoni WhatsApp:** vedi la sezione dedicata nel `README.md`.
