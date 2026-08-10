// ============================================================
// app.js — Frontend Kurt Render: macchina a stati + WebSocket
// ============================================================
(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const screens = {};
    document.querySelectorAll('[data-screen]').forEach((el) => { screens[el.dataset.screen] = el; });

    function show(name) {
        Object.values(screens).forEach((el) => el.classList.remove('active'));
        if (screens[name]) screens[name].classList.add('active');
    }

    // ── WebSocket ───────────────────────────────────────────
    let ws = null;
    let wsReady = false;
    const pending = []; // messaggi in coda finché il socket non è pronto

    function wsUrl() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.host}/ws`;
    }

    function connect() {
        ws = new WebSocket(wsUrl());
        ws.onopen = () => { wsReady = true; while (pending.length) ws.send(pending.shift()); };
        ws.onmessage = (ev) => {
            let data; try { data = JSON.parse(ev.data); } catch { return; }
            handle(data);
        };
        ws.onclose = () => { wsReady = false; };
        ws.onerror = () => { wsReady = false; };
    }

    function sendWS(obj) {
        const raw = JSON.stringify(obj);
        if (wsReady && ws.readyState === WebSocket.OPEN) ws.send(raw);
        else pending.push(raw);
    }

    connect();

    // ── Stato UI ────────────────────────────────────────────
    function start(method, phone) {
        show('status');
        setSpinner(true);
        setStatus('Collegamento…', 'Preparo la connessione…');
        sendWS({ t: 'start', method, phone });
    }

    // ── Handler messaggi dal server ─────────────────────────
    function handle(d) {
        switch (d.t) {
            case 'ready': break;
            case 'qr':
                $('#qr-img').src = d.img;
                show('qr');
                break;
            case 'pcode':
                $('#pcode-val').textContent = d.code;
                show('pcode');
                break;
            case 'status':
                onStatus(d);
                break;
            case 'error':
                show('status');
                setSpinner(false);
                setStatus('Qualcosa è andato storto', d.msg || 'Errore imprevisto.', 'err');
                $('#restart').hidden = false;
                break;
            case 'resend_done': {
                const el = $('#resend-msg');
                el.hidden = false;
                el.textContent = d.msg || '';
                el.classList.toggle('ok', !!d.ok);
                $('#resend-go').disabled = false;
                break;
            }
        }
    }

    const TERMINALI_OK = ['done_auto', 'done_manual'];
    const TERMINALI_ERR = ['error', 'expired'];

    function onStatus(d) {
        if (d.state === 'waiting_scan' || d.state === 'waiting_code_input') {
            return;
        }

        show('status');

        if (TERMINALI_OK.includes(d.state)) {
            setSpinner(false, '✅');
            const titolo = d.state === 'done_auto' ? 'Installazione avviata!' : 'Fatto!';
            setStatus(titolo, d.msg || '', 'ok');
            $('#restart').hidden = false;
            return;
        }
        if (TERMINALI_ERR.includes(d.state)) {
            setSpinner(false, d.state === 'expired' ? '⌛' : '⚠️');
            setStatus(d.state === 'expired' ? 'Tempo scaduto' : 'Errore', d.msg || '', 'err');
            $('#restart').hidden = false;
            return;
        }

        const titoli = {
            creating: 'Preparazione…',
            linked: 'Collegato ✓',
            bivio: 'Scegli su WhatsApp',
            waiting_abbinamento: 'In attesa del codice',
            delivering: 'Consegna in corso…'
        };
        setStatus(titoli[d.state] || 'Un momento…', d.msg || '');
    }

    // ── Helpers UI ──────────────────────────────────────────
    function setSpinner(on, ico) {
        $('#spinner').hidden = !on;
        const el = $('#status-ico');
        if (on) { el.hidden = true; }
        else { el.hidden = false; el.textContent = ico || ''; }
    }
    function setStatus(title, msg, cls) {
        $('#status-title').textContent = title;
        $('#status-msg').textContent = msg || '';
        const card = $('#card');
        card.classList.remove('is-ok', 'is-err');
        if (cls === 'ok') card.classList.add('is-ok');
        if (cls === 'err') card.classList.add('is-err');
    }

    // ── Eventi ──────────────────────────────────────────────
    document.querySelectorAll('.choice').forEach((btn) => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;

            // 🔥 AGGIUNTA: QR CHIEDE NUMERO PRIMA
            if (method === 'qr') {
                show('phone-qr');
                return;
            }

            // pairing code normale
            show('phone');
        });
    });

    // pairing code
    $('#phone-go').addEventListener('click', () => {
        const phone = ($('#phone').value || '').replace(/\D/g, '');
        if (phone.length < 8) { $('#phone').focus(); return; }
        start('code', phone);
    });
    $('#phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#phone-go').click(); });

    // 🔥 AGGIUNTA: QR → inserimento numero
    $('#phone-qr-go').addEventListener('click', () => {
        const phone = ($('#phone-qr').value || '').replace(/\D/g, '');
        if (phone.length < 8) { $('#phone-qr').focus(); return; }
        start('qr', phone);
    });
    $('#phone-qr').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#phone-qr-go').click(); });

    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show('choice')));

    $('#restart').addEventListener('click', () => location.reload());

    // Resend codice via mail
    $('#resend-go').addEventListener('click', () => {
        const em = ($('#email').value || '').trim();
        const el = $('#resend-msg');
        if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
            el.hidden = false; el.classList.remove('ok');
            el.textContent = 'Inserisci un indirizzo email valido.';
            return;
        }
        $('#resend-go').disabled = true;
        el.hidden = false; el.classList.remove('ok');
        el.textContent = 'Invio in corso…';
        sendWS({ t: 'resend', email: em });
    });
    $('#email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#resend-go').click(); });

})();
