# Schednd
Scheduling for DnD — webapp (PWA) per gestire disponibilità e sessioni ricorrenti di giochi da tavolo, di ruolo, online e meetup fisici.

📄 Piano di progetto: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (database e login) · Vercel (hosting)

## Configurazione

### Variabili d'ambiente
Su Vercel (*Settings → Environment Variables*, per Production, Preview e Development):

| Nome | Dove trovarla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → chiave `anon` / `publishable` |

Per le notifiche (fase 5) servono anche le seguenti variabili. Le chiavi VAPID e il `CRON_SECRET` si generano dalla pagina **Profilo → Configurazione del server** dell'app (`/profile/configurazione`), che mostra anche quali variabili mancano.

| Nome | Note |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → chiave `service_role` / `secret`. **Segreta.** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | chiave pubblica per le notifiche push |
| `VAPID_PRIVATE_KEY` | chiave privata per le notifiche push. **Segreta.** |
| `CRON_SECRET` | protegge il cron giornaliero (`/api/cron/notifications`, ogni mattina alle 8 UTC). **Segreta.** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | facoltative, per gli avvisi via email (es. Gmail: `smtp.gmail.com`, `465`, indirizzo, password per le app) |
| `BGG_API_TOKEN` | facoltativa, per importare le collezioni da BoardGameGeek (token di un'applicazione registrata su boardgamegeek.com/applications). **Segreta.** |

Dopo aver aggiunto o cambiato variabili su Vercel serve un **Redeploy**.

Per lo sviluppo locale: copia `.env.example` in `.env.local` e compila i valori.

### Supabase → Authentication → URL Configuration
- **Site URL**: l'indirizzo di produzione su Vercel (es. `https://schednd.vercel.app`).
- **Redirect URLs**: aggiungi
  - `https://<tuo-progetto>.vercel.app/**`
  - `https://*-<tuo-account-vercel>.vercel.app/**` (anteprime dei branch)
  - `http://localhost:3000/**` (sviluppo locale)

### Supabase → Authentication → Emails → Magic Link (consigliato)
Sostituisci il link del template con:
```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Accedi a Schednd</a>
```
Così il link funziona anche se l'email viene aperta in un browser diverso (es. dall'app Gmail).

### Database (Supabase → SQL Editor)
Le migrazioni sono in `supabase/migrations/`, numerate in ordine. Per ognuna non ancora applicata:
*SQL Editor → New query →* incolla il contenuto del file *→ Run*.

| File | Contenuto |
|---|---|
| `0001_groups.sql` | profili, gruppi, ricorrenze, membri, permessi (RLS) e funzioni |
| `0002_occurrences.sql` | incontri, presenze, decisioni dell'owner sul singolo incontro, aggiornamenti in tempo reale |
| `0003_proposals.sql` | proposte (cambio data, salto, cambio gioco) con più opzioni, voto e regole di approvazione |
| `0004_guests.sql` | ospiti "una tantum": link per un singolo incontro, presenza e voto degli ospiti |
| `0005_notifications.sql` | notifiche: iscrizioni push, coda degli avvisi, trigger sugli eventi, promemoria giornalieri |
| `0006_libraries.sql` | librerie dei giochi: catalogo, libreria personale con preferiti, import BoardGameGeek, libreria del gruppo |
| `0007_i18n.sql` | lingua dell'utente (italiano/inglese) e notifiche nella lingua di chi le riceve |
| `0008_single_events_calendar.sql` | eventi singoli, incontri straordinari, spostamento di un incontro, link segreto per il calendario del telefono |
| `0009_group_channels.sql` | avvisi nelle chat di gruppo Telegram: collegamento con codice, scelta degli avvisi, coda dei messaggi |
| `0010_telegram_accounts.sql` | account Telegram personali: presenze e voti con i pulsanti del bot, avvisi in privato |

## Email di accesso (consigliato)
Il link "classico" di Supabase funziona solo se viene aperto nello stesso browser in cui è stato richiesto, e alcuni programmi di posta lo "consumano" aprendolo da soli. Con questo modello l'email contiene anche un **codice** da inserire nella pagina di accesso, e il link chiede un tocco di conferma:
1. Supabase → *Authentication → Emails* (o *Email Templates*).
2. In **Magic Link** e in **Confirm signup** sostituisci il contenuto con quello di `supabase/email-templates/accesso.html` e salva.
3. In *Authentication → URL Configuration* il **Site URL** deve essere l'indirizzo del sito (es. `https://schednd.vercel.app`).

## Chat di gruppo (Telegram e WhatsApp)
- **WhatsApp**: nella pagina di ogni incontro, "Condividi su WhatsApp" apre WhatsApp con il riepilogo già scritto (data, gioco, chi c'è, link): si sceglie il gruppo e si invia. WhatsApp non permette ai bot di scrivere nei gruppi di amici, quindi l'invio è manuale.
- **Telegram** (facoltativo): un bot scrive da solo gli avvisi nella chat del gruppo.
  1. Su Telegram apri **@BotFather**, scrivi `/newbot`, scegli nome e nome utente (deve finire con `bot`).
  2. Copia il token che ti dà e mettilo su Vercel nella variabile `TELEGRAM_BOT_TOKEN` (non incollarlo in nessuna chat), poi **Redeploy**.
  3. Nelle impostazioni del gruppo su Schednd: **Avvisi su Telegram → Collega un gruppo Telegram** e segui i passaggi. Lì scegli anche quali avvisi mandare e la lingua.
  4. Comandi nel gruppo: `/prossimo`, `/chi`, `/calendario`, `/proposte` (in inglese `/next`, `/who`, `/calendar`, `/proposals`). Per il menu dei comandi: su @BotFather `/setcommands` e incolla la lista che trovi in *Profilo → Configurazione del server*.
  5. Ognuno può collegare il proprio account da **Profilo → Telegram**: così risponde e vota con i pulsanti del bot e, se vuole, riceve i propri avvisi in privato.

## Velocità
Ogni pagina fa alcune richieste al database: se il server di Vercel e quello di Supabase sono lontani (es. Stati Uniti ed Europa) ogni richiesta costa ~100 ms in più.
- Supabase → *Project Settings → General*: guarda la **Region** del progetto (es. `eu-central-1` Francoforte).
- Vercel → progetto → *Settings → Functions → Function Region*: scegli la regione più vicina (Francoforte `fra1`, Irlanda `dub1`, Londra `lhr1`, Parigi `cdg1`, Stoccolma `arn1`) e ripubblica.

Le pagine leggono i dati in parallelo e il calendario carica più mesi insieme, così cambiare giorno o mese non richiede il server.

## Lingue
L'app è in italiano e inglese. I testi sono in `src/i18n/messages/it.ts` ed `en.ts` (stesse chiavi, controllate da TypeScript). La lingua si sceglie da **Profilo → Lingua**; se non è stata scelta si usa quella del browser.

## Sviluppo
```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm test        # test della logica (ricorrenze, date)
npm run build
```
