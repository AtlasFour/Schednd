# Schednd — Piano di progetto

> Webapp (PWA) per organizzare sessioni ricorrenti di giochi da tavolo, giochi di ruolo, giochi online e meetup fisici: chi c'è, quando si gioca, a cosa si gioca. Si usa da browser su qualsiasi telefono o PC e si può "installare" sulla schermata home.

Stato: **bozza v0.2**. Le scelte segnate con ❓ dipendono dalle [domande aperte](#14-domande-aperte).

---

## Indice

1. [Decisioni prese](#1-decisioni-prese)
2. [Visione e obiettivi](#2-visione-e-obiettivi)
3. [Glossario](#3-glossario)
4. [Esempio di riferimento](#4-esempio-di-riferimento)
5. [Utenti e ruoli](#5-utenti-e-ruoli)
6. [Funzionalità](#6-funzionalità)
7. [Regole di dominio](#7-regole-di-dominio)
8. [Modello dati](#8-modello-dati)
9. [Schermate e flussi](#9-schermate-e-flussi)
10. [Notifiche](#10-notifiche)
11. [Architettura e stack tecnico](#11-architettura-e-stack-tecnico)
12. [Roadmap](#12-roadmap)
13. [Rischi e punti delicati](#13-rischi-e-punti-delicati)
14. [Domande aperte](#14-domande-aperte)

---

## 1. Decisioni prese

| # | Tema | Decisione |
|---|---|---|
| D1 | Piattaforma | **Webapp PWA** invece di un'app Android nativa: funziona su Android, iPhone e PC, gli inviti passano da un link e non serve il Play Store. |
| D2 | Stack | **Next.js + TypeScript + Tailwind**, **Supabase** (database, login, tempo reale), **Vercel** (hosting). Account già creati e collegati a GitHub. |
| D3 | Approvazione proposte | **Configurabile gruppo per gruppo** dall'owner: maggioranza, unanimità dei presenti, oppure decide l'owner/admin. |
| D4 | Composizione del gruppo | I membri si aggiungono e si tolgono liberamente. In più, per un singolo incontro si possono invitare **ospiti "una tantum"** tramite link: vedono solo le informazioni di quell'incontro. |
| D5 | Cambio giorno | La **proposta** di cambio data vale per **un solo incontro**. Il cambio fisso del giorno (la ricorrenza) si fa dalle **impostazioni del gruppo** e non passa dal voto. |
| D6 | Numero minimo | Il gruppo può impostare un **minimo di presenti**. L'app controlla le presenze **2 giorni prima** e **il giorno prima** dell'incontro e avvisa se il minimo non è raggiunto. |

---

## 2. Visione e obiettivi

**Problema.** Chi gioca in più gruppi coordina tutto su chat (WhatsApp, Telegram, Discord). Le presenze si perdono tra i messaggi, i cambi di data si decidono "a voce" e non è mai chiaro chi viene e a cosa si gioca.

**Soluzione.** Una webapp in cui ogni gruppo ha una sessione ricorrente con un calendario. Ogni incontro mostra le presenze, il gioco in programma e le proposte di modifica (cambio giorno, salto, cambio gioco), che si votano e si applicano in modo trasparente.

**Obiettivi dell'MVP**
- Vedere in un'unica schermata tutti i prossimi incontri di tutti i miei gruppi.
- Segnare la mia presenza con un tap.
- Creare un gruppo ricorrente e invitarci altre persone con un link.
- Proporre e votare: cambio data di un incontro, salto, cambio gioco.
- Ricevere un avviso se un incontro non raggiunge il numero minimo di presenti.

**Fuori dall'MVP (per ora)**
- App sugli store: eventualmente in seguito, "impacchettando" la stessa webapp con Capacitor o TWA.
- Chat interna: si continua a usare quella esistente, al massimo con un link.
- Gestione di campagne GdR (schede, diari, mappe).

---

## 3. Glossario

| Termine | Significato |
|---|---|
| **Gruppo** (Sessione) | Il gruppo ricorrente, es. "Sessione A – D&D del mercoledì". Ha membri, regola di ricorrenza, gioco predefinito, luogo e regole di voto. |
| **Incontro** | La singola data di un gruppo, es. "mercoledì 18 novembre 2026". Le presenze, gli ospiti e le proposte sono legati all'incontro. |
| **Regola di ricorrenza** | Ogni quanto si gioca: ogni settimana, ogni 2 settimane, ecc. Ha una data di partenza (*ancora*). Si cambia solo dalle impostazioni. |
| **Presenza** (RSVP) | La risposta per un incontro: ✅ presente, ❌ assente, ❔ forse, — non ha risposto. |
| **Proposta** | Una richiesta di modifica di **un incontro** che i membri votano: cambio data, salto, cambio gioco. |
| **Ospite** | Persona invitata con un link a **un solo incontro**, senza diventare membro del gruppo. |
| **Minimo presenti** | Numero minimo di presenti perché l'incontro sia considerato "confermato". Se non è raggiunto, a 2 giorni e a 1 giorno dall'incontro parte un avviso. |

---

## 4. Esempio di riferimento

| Gruppo | Giocatori | Ricorrenza | Note |
|---|---|---|---|
| A | 5 | ogni mercoledì | |
| B | 4 | ogni martedì | |
| C | 6 | ogni 2 venerdì | la data di partenza stabilisce *quali* venerdì |
| D | variabili | ogni sabato | membri liberi più ospiti invitati di volta in volta con un link |

Con la decisione D4 non serve distinguere tra gruppi "chiusi" e "aperti": tutti i gruppi funzionano allo stesso modo, e la Sessione D usa semplicemente di più gli inviti agli ospiti.

---

## 5. Utenti e ruoli

| Ruolo | Permessi |
|---|---|
| **Owner** (chi crea il gruppo) | Tutto: impostazioni, ricorrenza, gioco predefinito, regola di voto, minimo presenti; gestisce i membri; nomina gli admin; elimina il gruppo. |
| **Admin** ❓ | Come l'owner, tranne eliminare il gruppo o rimuovere l'owner. |
| **Membro** | Vede il gruppo, segna la presenza, crea proposte, vota, invita ospiti a un incontro ❓. |
| **Ospite** | Vede **solo** l'incontro a cui è stato invitato (data, ora, luogo/link, gioco, chi c'è) e segna la propria presenza ❓. Non vede gli altri incontri, non vota e non fa proposte. |

Ogni utente registrato:
- vede **tutti** i propri gruppi e i propri incontri;
- può **creare** nuovi gruppi, diventandone owner;
- può **proporre** modifiche in qualsiasi gruppo di cui è membro.

---

## 6. Funzionalità

Priorità: **P0** = MVP, **P1** = subito dopo, **P2** = in futuro.

### 6.1 Account
- P0: Login con Google e/o link magico via email ❓.
- P0: Profilo con nome visualizzato, avatar e fuso orario.
- P0: Installazione come PWA (icona sulla home, schermo intero).
- P1: Preferenze di notifica.
- P2: Disponibilità generica settimanale (es. "il lunedì non ci sono mai").

### 6.2 Gruppi
- P0: Creazione del gruppo: nome, descrizione, ricorrenza (giorno, ogni N settimane, data di partenza), orario e durata, gioco predefinito, modalità (fisica/online/ibrida), luogo o link.
- P0: Regola di approvazione delle proposte (D3) e minimo presenti, facoltativo (D6).
- P0: Invito di un membro con link o codice; aggiunta e rimozione libere dei membri.
- P0: Modifica delle impostazioni, **compreso il cambio fisso del giorno** (D5). Vale dagli incontri futuri in poi.
- P1: Pausa o archiviazione del gruppo (es. pausa estiva).
- P1: Rotazione dell'host (a turno a casa di qualcuno) ❓.
- P2: Colore e icona del gruppo.

### 6.3 Incontri e calendario
- P0: **Home "Prossimi incontri"** con gli incontri di tutti i miei gruppi e il mio stato di presenza.
- P0: Dettaglio incontro: data e ora, gioco, luogo/link, presenze (chi sì, chi no, chi forse, chi non ha risposto), ospiti, proposte attive.
- P0: **Link ospite** per un singolo incontro (D4).
- P1: Vista calendario mensile.
- P1: Incontro straordinario singolo, fuori dalla ricorrenza.
- P1: Note per l'incontro (es. "porto io le pizze").
- P2: Esportazione nel calendario Google/Apple (iCal).

### 6.4 Presenze
- P0: Presente / Assente / Forse con un tap, anche dalla home.
- P0: Nota opzionale (es. "arrivo alle 22").
- P0: Riepilogo "4/5 presenti", con indicazione del minimo raggiunto o meno.
- P1: Assenza segnata in anticipo su più incontri (es. "in vacanza dal 10 al 24").

### 6.5 Proposte e voto (solo per un singolo incontro)
- P0: **Cambio data/ora** dell'incontro.
- P0: **Salto** dell'incontro.
- P0: **Cambio gioco** per l'incontro.
- P0: Voto Sì/No, con stato e scadenza visibili.
- P0: Approvazione secondo la regola del gruppo (D3).
- P1: Proposta con più date alternative (stile Doodle) ❓.

### 6.6 Giochi
- P0: Il gioco è un testo libero, con suggerimenti tra i giochi già usati nel gruppo.
- P1: Libreria giochi del gruppo (titolo, tipo, giocatori min/max, durata, immagine).
- P2: Integrazione BoardGameGeek ❓.
- P2: Storico delle partite (cosa, quando, chi c'era).

---

## 7. Regole di dominio

### 7.1 Ricorrenza
- Nell'MVP: **settimanale ogni N settimane** (N=1 ogni settimana, N=2 ogni due), con giorno della settimana, orario e **data di partenza**.
- La regola si salva come **RRULE** (standard iCalendar), es. `FREQ=WEEKLY;INTERVAL=2;BYDAY=FR`, così in futuro si possono aggiungere ricorrenze mensili ed esportare in iCal.
- Gli incontri si **calcolano al volo** per le prossime settimane. Diventano righe nel database solo quando qualcuno ci interagisce (presenza, proposta, ospite).
- **Cambio fisso del giorno** (D5): dalle impostazioni si chiude la regola vecchia e se ne apre una nuova a partire da una certa data. Gli incontri passati restano invariati.
  - Gli incontri futuri che avevano già presenze vanno gestiti: proposta di default, azzerare le presenze e avvisare ❓.
- Una modifica a un solo incontro crea un'**eccezione**: data spostata, saltato o gioco diverso, solo per quella data.
- Fuso orario: ogni gruppo ha il suo (es. `Europe/Rome`). L'ora "di parete" resta fissa anche al cambio dell'ora legale.

### 7.2 Stato di un incontro
```
programmato ──(minimo raggiunto)──▶ confermato
     │                                  │
     ├──(salto approvato)───────────────┴──▶ saltato
     ├──(cambio data approvato)─────────────▶ spostato (nuova data)
     └──(data passata)──────────────────────▶ concluso
```
Se il gruppo non ha un minimo presenti, l'incontro resta semplicemente "programmato".

### 7.3 Minimo presenti e avvisi (D6)
- Impostazione facoltativa del gruppo: "minimo N presenti".
- Due controlli automatici: **2 giorni prima** e **1 giorno prima** dell'orario d'inizio.
- Se i presenti sono meno di N, parte un avviso: "Mercoledì siete solo in 3 su un minimo di 4", con l'elenco di chi non ha ancora risposto.
- Destinatari: tutti i membri ❓, oppure solo chi non ha risposto più l'owner/admin.
- Gli ospiti con presenza ✅ contano nel minimo ❓.
- Se il minimo è raggiunto, si può mandare un messaggio positivo ("Confermato: si gioca!") ❓.

### 7.4 Proposte e voto (D3, D5)
- Tipi: `RESCHEDULE` (nuova data/ora), `SKIP`, `CHANGE_GAME`. Riguardano **sempre un singolo incontro**.
- Regola di approvazione scelta dall'owner per ogni gruppo:
  - **Maggioranza**: più della metà dei membri vota Sì.
  - **Unanimità dei presenti**: tutti quelli segnati presenti all'incontro votano Sì. È utile per il cambio data.
  - **Decide l'owner/admin**: i voti degli altri sono un parere, approva o respinge l'owner/admin.
- Ogni proposta ha una scadenza, di default ❓. Alla scadenza senza approvazione è **respinta**.
- Per lo stesso incontro può esserci **una sola proposta attiva per tipo**.
- Dopo un cambio data **approvato**, le presenze si azzerano e chi aveva votato Sì viene segnato presente ❓.
- Il conteggio dei voti e l'applicazione della proposta avvengono **sul server** (funzione SQL in Supabase), in modo atomico.

### 7.5 Gioco
- Ogni gruppo ha un **gioco predefinito**, che può anche mancare. Si cambia dalle impostazioni.
- Un incontro eredita il predefinito, salvo una proposta di cambio gioco approvata per quell'incontro.

### 7.6 Ospiti (D4)
- Un membro (o solo owner/admin ❓) genera un **link ospite** legato a un incontro.
- Chi apre il link vede solo quell'incontro.
  - Per segnare la presenza basta il nome, senza account ❓, oppure un login veloce.
- Il link scade dopo la data dell'incontro e si può revocare.
- Se l'incontro viene spostato o saltato, anche l'ospite lo vede (e riceve un avviso, se ha lasciato un contatto).

---

## 8. Modello dati

Tabelle Postgres (Supabase). L'accesso è protetto con **Row Level Security**: ognuno vede solo i dati dei propri gruppi.

```
profiles
  id (= auth.users.id), display_name, avatar_url, timezone, created_at

groups
  id, name, description
  mode (in_person | online | hybrid), location, online_link
  timezone, start_time, duration_minutes
  default_game_id?, min_attendees?
  approval_rule (majority | unanimous_attendees | admin_decides)
  proposal_default_hours            ← scadenza standard delle proposte
  status (active | paused | archived)
  invite_code, created_by, created_at

group_schedules                     ← storico delle ricorrenze (per il cambio fisso del giorno)
  id, group_id, rrule, valid_from, valid_until?

memberships
  group_id, user_id, role (owner | admin | member), joined_at

games
  id, group_id, title, kind (board | rpg | online | other)

occurrences                         ← creata solo al primo utilizzo
  id, group_id
  original_start                    ← data prevista dalla regola (chiave stabile)
  actual_start                      ← diversa se spostato
  status (scheduled | confirmed | skipped | moved | done)
  game_id_override?, notes
  UNIQUE (group_id, original_start)

attendances
  occurrence_id, user_id? | guest_id?, status (yes | no | maybe), note, updated_at

guest_invites
  id, occurrence_id, token, created_by, expires_at, revoked_at?

guests
  id, invite_id, display_name, contact?

proposals
  id, occurrence_id, type (reschedule | skip | change_game)
  payload jsonb                     ← { new_start } oppure { game_id }
  created_by, created_at, expires_at
  status (open | approved | rejected | cancelled | expired)

votes
  proposal_id, user_id, value (yes | no), created_at

push_subscriptions
  id, user_id, endpoint, keys jsonb, created_at

notifications_log                   ← evita di mandare due volte lo stesso avviso
  id, occurrence_id, kind (min_check_48h | min_check_24h | ...), sent_at
```

---

## 9. Schermate e flussi

### 9.1 Schermate MVP (pensate prima per il telefono)
1. **Login**
2. **Home – Prossimi incontri**: card con data, gruppo, gioco, presenze (3/5), il mio stato e i pulsanti ✅❌❔. Badge per le proposte da votare e per gli incontri sotto il minimo.
3. **I miei gruppi**: lista, con "+ Nuovo gruppo" ed "Entra con codice".
4. **Dettaglio gruppo**: info, prossimi incontri, membri, link d'invito.
5. **Impostazioni gruppo**: dati base, ricorrenza (cambio fisso del giorno), gioco predefinito, regola di voto, minimo presenti, membri.
6. **Crea gruppo**: wizard in 3 passi (info → ricorrenza e orario → gioco, luogo e regole).
7. **Dettaglio incontro**: presenze, gioco, luogo, ospiti, proposte, pulsanti "Proponi modifica" e "Invita ospite".
8. **Nuova proposta**: scegli il tipo (cambio data / salto / cambio gioco), poi inserisci il valore.
9. **Dettaglio proposta**: voti, tempo rimanente, Vota Sì/No (o Approva/Respingi per l'owner, se la regola è "decide l'owner").
10. **Pagina ospite** (pubblica, da link): info dell'incontro e la sua presenza.
11. **Profilo**: nome, fuso orario, notifiche, "installa app".

### 9.2 Flussi principali
- **Creo un gruppo** → configuro ricorrenza e regole → copio il link d'invito → lo mando su WhatsApp → gli amici lo aprono, fanno login e sono dentro.
- **Segno la presenza** → dalla home, un tap su ✅ → il contatore si aggiorna in tempo reale per tutti.
- **Propongo un cambio data** → dettaglio incontro → "Proponi modifica" → nuova data → notifica ai membri → voti → se approvata secondo la regola del gruppo, l'incontro si sposta e tutti ricevono un avviso.
- **Invito un ospite (Sessione D)** → dettaglio incontro → "Invita ospite" → copio il link → l'ospite lo apre, vede le info e segna "ci sono".
- **Avviso minimo** → 2 giorni prima: "siete in 3, minimo 4" → qualcuno risponde → 1 giorno prima: nuovo controllo.

---

## 10. Notifiche

| Evento | Chi riceve | Priorità |
|---|---|---|
| Minimo presenti non raggiunto, **2 giorni prima** | membri ❓ | P0 |
| Minimo presenti non raggiunto, **1 giorno prima** | membri ❓ | P0 |
| Nuova proposta nel mio gruppo | membri tranne l'autore | P0 |
| Proposta approvata/respinta | membri (e ospiti dell'incontro, se cambia la data) | P0 |
| Promemoria "non hai ancora risposto" | chi non ha risposto | P1 |
| Promemoria "domani si gioca!" | i presenti | P1 |
| Nuovo membro nel gruppo | owner/admin | P1 |

**Come si inviano.** Su una webapp ci sono due canali:
- **Web Push** (standard VAPID), il canale principale.
  - Su Android (Chrome) funziona sempre.
  - Su iPhone funziona solo se la webapp è stata **aggiunta alla schermata home** (iOS 16.4 o successivo). L'app mostrerà una breve guida.
- **Email**, di riserva, per chi non attiva le notifiche push ❓.

**Controlli programmati** (avvisi a 2 giorni e a 1 giorno): un job orario che cerca gli incontri in quelle finestre e invia gli avvisi una sola volta, registrandoli in `notifications_log`. Si può realizzare con Supabase `pg_cron` + Edge Function, oppure con un Cron Job di Vercel.

---

## 11. Architettura e stack tecnico

| Livello | Scelta | Perché |
|---|---|---|
| Framework | **Next.js** (App Router) + **TypeScript** | Il più diffuso, con tantissima documentazione; frontend e backend leggero nello stesso progetto |
| UI | **Tailwind CSS** + componenti **shadcn/ui** | Grafica pulita e adatta al telefono, senza scrivere CSS da zero |
| PWA | Manifest + service worker (**Serwist**) | Installazione sulla home e notifiche push |
| Database | **Supabase Postgres** | Modello relazionale, vincoli, funzioni SQL per i voti |
| Login | **Supabase Auth** (Google e/o link via email) | Già integrato |
| Sicurezza | **Row Level Security** | Ognuno legge e scrive solo nei propri gruppi |
| Tempo reale | **Supabase Realtime** | Presenze e voti si aggiornano senza ricaricare |
| Date e ricorrenze | `rrule` + `date-fns-tz` | Ricorrenze e fusi orari affidabili |
| Logica server | Funzioni SQL (RPC) + Server Actions di Next.js | Voti, applicazione delle proposte, link ospite |
| Job programmati | Supabase `pg_cron` + Edge Function (o Vercel Cron) | Avvisi a 2 giorni e a 1 giorno |
| Notifiche | `web-push` (VAPID) | Standard, gratuito |
| Hosting | **Vercel**: ogni push su GitHub va online da solo, con un'anteprima per ogni branch | Gratis per l'uso tra amici |
| Test | Vitest (logica ricorrenze e voti), Playwright (flussi principali) | |

### 11.1 Struttura del repository (bozza)
```
/src
  /app                → pagine (Next.js App Router)
    /(auth)/login
    /(app)/page.tsx           → home "Prossimi incontri"
    /(app)/groups/...
    /(app)/occurrences/[id]
    /invite/[code]            → entrata nel gruppo
    /guest/[token]            → pagina ospite pubblica
  /components         → componenti UI
  /lib                → client Supabase, ricorrenze, utilità date
/supabase
  /migrations         → schema SQL, policy RLS, funzioni
  /functions          → Edge Functions (avvisi, push)
/public               → icone, manifest PWA
/docs                 → questa documentazione
```

### 11.2 Configurazione degli account (una volta sola)
1. **Supabase**: crea un progetto (regione: Europa, es. Frankfurt). Da *Project Settings → API* servono `Project URL` e la chiave `anon`/`publishable`.
2. **Vercel**: importa il repository GitHub `Schednd`. In *Settings → Environment Variables* inserisci:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (in seguito) `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
3. Le chiavi **non vanno mai** scritte in chat né salvate nel codice: si inseriscono solo nei pannelli di Vercel/Supabase (e in un file `.env.local`, escluso da git, per lo sviluppo locale).
4. **Login con Google** (facoltativo): in *Supabase → Authentication → Providers* si abilita Google e si incolla il client ID creato in Google Cloud. È una procedura guidata.

---

## 12. Roadmap

| Fase | Contenuto | Risultato |
|---|---|---|
| **0 – Fondamenta** | Progetto Next.js, Tailwind, collegamento a Supabase, login, deploy su Vercel, PWA base | Apri il sito dal telefono, fai login e lo installi sulla home |
| **1 – Gruppi** | Schema del database, creazione gruppo con ricorrenza, link d'invito, membri, impostazioni (cambio fisso del giorno, regola di voto, minimo) | Crei la Sessione A e ci entrano 4 amici |
| **2 – Incontri e presenze** | Calcolo degli incontri, home "Prossimi incontri", RSVP in tempo reale, dettaglio incontro | Ognuno segna se c'è mercoledì |
| **3 – Proposte** | Cambio data, salto, cambio gioco; voto secondo la regola del gruppo; applicazione lato server | Spostate un incontro votando |
| **4 – Ospiti** | Link ospite per un incontro, pagina pubblica, presenza dell'ospite | Sessione D con invitati una tantum |
| **5 – Notifiche** | Web Push, avvisi minimo presenti a 2 giorni e a 1 giorno, notifiche sulle proposte | L'app avvisa da sola |
| **6 – Beta con gli amici** | Uso reale sulle sessioni A–D, raccolta feedback, correzioni | **MVP completato** |
| **7 – P1/P2** | Calendario mensile, incontri straordinari, assenze multiple, libreria giochi, date stile Doodle, iCal, storico partite | |

---

## 13. Rischi e punti delicati

- **Ricorrenze e fusi orari**: servono test automatici sul calcolo degli incontri, incluso il cambio dell'ora legale e il cambio fisso del giorno.
- **Voti in contemporanea**: il conteggio e l'applicazione delle proposte avvengono in una transazione SQL, così una proposta non si applica due volte.
- **Notifiche su iPhone**: arrivano solo se la webapp è installata sulla home. Serve una guida chiara nell'app, ed eventualmente l'email come riserva.
- **Link ospite**: vanno trattati come segreti. Token lunghi e casuali, scadenza automatica, possibilità di revocarli.
- **Adozione**: login e ingresso nel gruppo devono richiedere pochissimi passaggi.
- **Privacy/GDPR**: i dati personali sono pochi, ma servono un'informativa e la possibilità di cancellare l'account.
- **Piani gratuiti**: Supabase mette in pausa i progetti gratuiti inattivi per 7 giorni. Con un uso settimanale non è un problema.

---

## 14. Domande aperte

### Ospiti
1. L'ospite può **segnare la presenza** (sì/no/forse) o vede solo le informazioni?
2. L'ospite deve fare **login** o basta che scriva il proprio nome?
3. Chi può creare un link ospite: **tutti i membri** o solo **owner/admin**?
4. Gli ospiti presenti **contano nel minimo presenti**?

### Minimo presenti e avvisi
5. L'avviso a 2 giorni e a 1 giorno va a **tutti i membri** o solo a **chi non ha risposto** e all'owner?
6. Quando il minimo è raggiunto, vuoi un messaggio di **conferma** ("si gioca!")?
7. Se il giorno prima il minimo non c'è, l'incontro va **annullato in automatico**, o decide l'owner?

### Proposte
8. Che **scadenza di default** vuoi per le proposte: 48 ore, o "entro X ore dall'incontro"?
9. Dopo un **cambio data approvato**, si azzerano le presenze? Chi ha votato Sì va segnato presente in automatico?
10. Ti interessa (anche più avanti) la proposta con **più date** da votare, stile Doodle?

### Gruppi
11. Serve il ruolo **admin**, o basta l'owner?
12. Quando si **cambia il giorno fisso** dalle impostazioni, gli incontri futuri con presenze già segnate vanno azzerati e va inviato un avviso?
13. Gli incontri fisici hanno sempre lo stesso luogo, oppure **ruota l'host**?
14. Servono ricorrenze **mensili** ("primo sabato del mese")?

### Generali
15. **Login**: Google, link via email, o entrambi?
16. Lingua: **solo italiano**, o anche inglese?
17. Uso **tra amici** o vuoi pubblicarla per chiunque?
18. Preferenze di **stile grafico** (tema scuro, fantasy, minimal…)?
19. Per il gioco basta un nome libero, o ti interessano una **libreria** e **BoardGameGeek** più avanti?
