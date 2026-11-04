# AI Trading Desk — correzione login 1.0.1

## Problema
La pagina login inviava un POST con `Origin: null` in alcuni browser, per effetto della policy `Referrer-Policy: no-referrer`. Il controllo `isSameOrigin` nella versione 1.0.0 rifiutava la richiesta con `403 {"error":"Origine richiesta non valida"}`.

## Correzione rapida dalla dashboard Cloudflare
Se hai accesso al codice del Worker e trovi la costante `SECURITY` in `src/index.js` (o nel codice pubblicato), modifica questa **singola riga**:

```js
'Referrer-Policy': 'no-referrer',
```

in:

```js
'Referrer-Policy': 'same-origin',
```

Salva e fai deploy. Apri direttamente il dominio pubblico `https://<nome>.<account>.workers.dev/login`, non l'anteprima incorporata nella console Cloudflare. Ricarica la pagina di login e riprova. La correzione singola mantiene il controllo CSRF originale basato su Origin per le richieste del modulo.

## Correzione completa (consigliata)
La versione 1.0.1 aggiunge anche un fallback sicuro `Sec-Fetch-Site: same-origin` o `Referer` same-origin, per i browser che inviano `Origin: null` o omettono Origin.

Se lavori con Wrangler, **non sovrascrivere il tuo `wrangler.jsonc` già configurato** con il placeholder dell'archivio. Copia dal pacchetto 1.0.1 solo:

- `src/index.js`
- `src/auth.js`

Poi, dalla cartella originale già configurata:

```bash
npx wrangler deploy
```

Se è il primo deploy, segui il README e configura l'UUID reale del database D1 in `wrangler.jsonc`.

## Importante
- Non eliminare il Worker.
- Non ricreare il database D1.
- Non rigenerare o inviare le chiavi API Alpaca o i segreti Cloudflare.
- Un test del codice è stato superato localmente, ma il deploy nel tuo account Cloudflare non è stato eseguito.
