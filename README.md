# Kurt Render ☁️

Mini servizio web che porta sul browser il meccanismo di `.kurt`: l'utente
apre il sito, sceglie **QR** o **codice**, collega il proprio numero WhatsApp,
e da lì il bot lo guida su WhatsApp fino all'installazione automatica (via
Cloudflare) o alla consegna manuale del file `creds.json`.

Progetto **autonomo e separato** dal bot Kurt vero. Non contiene giochi, ping
statistiche, né protezione integrità: solo pairing + consegna creds + email.

## Come funziona

1. L'utente apre il sito e (facoltativo) inserisce la sua email.
2. Sceglie **QR** (mostra un QR da inquadrare) o **Codice** (chiede il numero e
   mostra un codice a 8 cifre da inserire su WhatsApp).
3. A collegamento riuscito, il bot scrive nella chat personale dell'utente e
   invia il bivio **installazione automatica? Sì / No** con i bottoni.
4. **Sì** → chiede l'ID del server WispByte poi consegna le creds al Worker Cloudflare
   (`PUT /pending-creds`) → il server dell'utente parte da solo.
5. **No** → invia `creds.json` + guida manuale nella chat.

## Requisiti

- Node.js ≥ 20
- Le variabili d'ambiente in `.env.example` (copiale in `.env` o nel pannello Render).

## Avvio locale

```bash
npm install
cp .env.example .env   # poi compila WORKER_HMAC_SECRET ecc.
npm start
# apri http://localhost:3000
```

## Deploy su Render

Guida completa passo-passo (senza saper programmare) in **`DEPLOY.md`**.
In breve: carichi la cartella su GitHub → su Render fai **New → Blueprint**
(legge `render.yaml` e configura tutto da solo) → in pochi minuti è online.
Non serve impostare `PORT` (Render la inietta) né il secret (vedi sotto).

## Note importanti

### Bottoni WhatsApp e la libreria Baileys

Il bivio Sì/No usa i **bottoni** WhatsApp. Il Baileys ufficiale
(`@whiskeysockets/baileys`) oggi non li renderizza sui WhatsApp aggiornati,
perciò `package.json` punta di default a un **fork "reverse"**
(`@realvare/baileys`) che dovrebbe supportarli.

- Se quel pacchetto **non si installa** su Render (nome/versione non risolti),
  il deploy fallisce. In quel caso apri **`lib/wa.js`** e cambia la costante
  `PACKAGE` (una riga), aggiornando di conseguenza la dipendenza in
  `package.json`. Un fallback che si installa sempre ma **senza bottoni** è
  `@whiskeysockets/baileys`.
- In ogni caso il bivio accetta **anche la risposta scritta** `si` / `no`:
  se i bottoni non compaiono, l'utente digita e il flusso prosegue lo stesso.
