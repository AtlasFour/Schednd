# Schednd — Piano di progetto

> Webapp (PWA) per organizzare sessioni ricorrenti di giochi da tavolo, giochi di ruolo, giochi online e meetup fisici: chi c'è, quando si gioca e a cosa si gioca. Si usa da browser su qualsiasi telefono o PC e si può "installare" sulla schermata home.

Stato: **v0.4**. Tutte le scelte principali sono decise (§1).

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
| D1 | Piattaforma | **Webapp PWA**, non app Android nativa. |
| D2 | Stack | **Next.js + TypeScript + Tailwind**, **Supabase**, **Vercel**. |
| D3 | Approvazione delle proposte | **Configurabile per gruppo**: maggioranza, unanimità dei presenti, oppure decide l'owner. |
| D4 | Composizione del gruppo | Membri liberi; **ospiti "una tantum"** invitati con un link a un solo incontro. |
| D5 | Cambio giorno | La proposta vale per **un solo incontro**. Il cambio fisso del giorno si fa dalle **impostazioni**. |
| D6 | Minimo presenti | Facoltativo per gruppo. Gli avvisi partono a **2 giorni** e a **1 giorno** dall'incontro (dettagli in D11). |
| D7 | Ospiti | Devono fare **login**, possono **segnare la presenza** e **contano nel minimo**. **Qualsiasi membro** può invitarli. |
| D8 | Ruoli | Solo **owner** e **membro**: niente admin. |
| D9 | Proposte | **Più opzioni da subito**: più date o più giochi tra cui scegliere. Si vota fino a **24 ore prima** dell'incontro. |
| D10 | Dopo un cambio data | Chi aveva votato Sì alla data scelta **resta segnato presente**. Gli altri devono rispondere di nuovo. |
| D11 | Avvisi | **2 giorni prima**: se manca il minimo, avviso a chi non ha risposto e all'owner. **Quando il minimo è raggiunto**: messaggio "si gioca!". **1 giorno prima**: promemoria a tutti i presenti. Se il minimo non c'è, **decide l'owner** (gioca comunque, salta, cambia gioco). |
| D12 | Cambio fisso del giorno | Le presenze degli incontri futuri coinvolti si **azzerano** e i membri ricevono un **avviso**. |
| D13 | Ricorrenza | **Ogni N settimane** (1, 2, 4…). Le ricorrenze mensili non servono. |
| D14 | Host | Il luogo può **cambiare di volta in volta** (host a rotazione). |
| D15 | Login | Link via email subito; **Google** appena possibile (è gratuito, circa mezz'ora di configurazione). |
| D16 | Lingua | **Italiano**, con il codice predisposto per la **traduzione** (inglese come seconda lingua). |
| D17 | Pubblico | **Solo tra amici**, per ora. |
| D18 | Grafica | Più avanti. Direzione: **tema pixel art**. |
| D19 | Giochi | **Librerie personali** dei giochi, **preferiti** e **voto sul gioco** da fare all'incontro. |
| D20 | Voto degli ospiti | Gli ospiti **votano** le proposte dell'incontro a cui partecipano. |
| D21 | Pareggi | Con la regola "maggioranza", in caso di pareggio **decide l'owner**. |
| D22 | Ritiri dopo la conferma | Se si scende sotto il minimo dopo la conferma, l'owner viene **avvisato subito**. |
| D23 | BoardGameGeek | Usato già per la collezione: **importazione da BGG** prevista insieme alle librerie. |

---

## 2. Visione e obiettivi

**Problema.** Chi gioca in più gruppi coordina tutto in chat: le presenze si perdono, i cambi di data si decidono "a voce" e non è mai chiaro chi viene e a cosa si gioca.

**Soluzione.** Ogni gruppo ha una sessione ricorrente con un calendario. In ogni incontro sono visibili presenze, gioco e luogo, insieme alle proposte di modifica che si votano tra più opzioni.

**Obiettivi dell'MVP**
- Vedere in un'unica schermata tutti i prossimi incontri di tutti i miei gruppi.
- Segnare la presenza con un tap.
- Creare un gruppo ricorrente e invitarci altre persone con un link; invitare ospiti a un singolo incontro.
- Proporre e votare: date alternative, salto, giochi alternativi.
- Avvisi automatici su minimo presenti e promemoria.

**Fuori dall'MVP (per ora):** app sugli store, chat interna, gestione di campagne GdR (schede, diari, mappe).

---

## 3. Glossario

| Termine | Significato |
|---|---|
| **Gruppo** | La sessione ricorrente, es. "Sessione A – D&D del mercoledì". |
| **Incontro** | La singola data di un gruppo, es. "mer 18/11/2026". |
| **Ricorrenza** | Giorno della settimana + ogni N settimane + data di partenza. |
| **Presenza** | ✅ presente, ❌ assente, ❔ forse, — non ha risposto. |
| **Proposta** | Richiesta di modifica di un incontro, con **una o più opzioni** da votare. |
| **Ospite** | Utente invitato a **un solo incontro**, senza essere membro del gruppo. |
| **Host** | Chi ospita l'incontro; il luogo può cambiare a ogni incontro. |
| **Libreria** | I giochi che possiede un utente. |
| **Minimo presenti** | Numero minimo di presenti (membri + ospiti) perché l'incontro sia "confermato". |

---

## 4. Esempio di riferimento

| Gruppo | Giocatori | Ricorrenza |
|---|---|---|
| A | 5 | ogni settimana, mercoledì |
| B | 4 | ogni settimana, martedì |
| C | 6 | ogni 2 settimane, venerdì (con data di partenza) |
| D | variabili | ogni settimana, sabato, con molti ospiti |

---

## 5. Utenti e ruoli

| Ruolo | Permessi |
|---|---|
| **Owner** | Impostazioni del gruppo (ricorrenza, gioco predefinito, regola di voto, minimo); gestione dei membri; decide sugli incontri sotto il minimo; approva o respinge le proposte se la regola è "decide l'owner"; può trasferire il ruolo di owner a un altro membro; elimina il gruppo. |
| **Membro** | Vede il gruppo, segna la presenza, crea proposte, vota, **invita ospiti**, può fare da host. |
| **Ospite** | Fa login e vede **solo** l'incontro a cui è invitato. Segna la propria presenza, che conta nel minimo, e **vota** le proposte di quell'incontro. Non crea proposte. |

---

## 6. Funzionalità

**P0** = MVP · **P1** = subito dopo · **P2** = in futuro

### 6.1 Account
- ✅ P0: Login con link via email.
- P0: Profilo con nome visualizzato, avatar e fuso orario.
- ✅ P0: Installazione come PWA.
- P1: **Login con Google**.
- P1: Lingua dell'interfaccia: italiano/inglese.
- P2: Disponibilità generica settimanale.

### 6.2 Gruppi
- P0: Creazione: nome, descrizione, ricorrenza (giorno, ogni N settimane, data di partenza), orario, durata, gioco predefinito, modalità (fisica/online/ibrida), luogo/link predefinito, regola di voto, minimo presenti.
- P0: Link d'invito per i membri; rimozione dei membri; trasferimento del ruolo di owner.
- P0: Modifica delle impostazioni, compreso il **cambio fisso del giorno** (D5, D12).
- P1: Pausa/archiviazione del gruppo.

### 6.3 Incontri
- P0: **Home "Prossimi incontri"** di tutti i miei gruppi.
- P0: Dettaglio: data, ora, gioco, luogo/link, host, presenze, ospiti, proposte.
- P0: **Link ospite** per un incontro (D7).
- P1: **Host e luogo per il singolo incontro** (D14): "questa volta da Marco".
- P1: Vista calendario mensile; incontri straordinari; note dell'incontro.
- P2: Esportazione iCal.

### 6.4 Presenze
- P0: ✅/❌/❔ con un tap, con nota opzionale.
- P0: Contatore "4/5 (min. 4)", ospiti compresi.
- P1: Assenza su più incontri (vacanze).

### 6.5 Proposte (D9)
- P0: **Cambio data** con **una o più date** proposte.
- P0: **Salto** dell'incontro.
- P0: **Cambio gioco** con **uno o più giochi** proposti.
- P0: Ognuno spunta **tutte le opzioni che gli vanno bene**; la scelta segue la regola del gruppo (§7.4).
- P0: Voto aperto fino a **24 ore prima** dell'incontro.

### 6.6 Giochi e librerie (D19)
- P0: Gioco come testo libero, con suggerimenti tra quelli già usati nel gruppo.
- P1: **Libreria personale**: ognuno inserisce i giochi che possiede (titolo, tipo, giocatori min/max, durata).
- P1: **Libreria del gruppo** = unione delle librerie dei membri ("Gloomhaven – di Luca").
- P1: **Preferiti**: ognuno segna i giochi che vorrebbe giocare.
- P1: Le proposte di cambio gioco pescano dalla libreria del gruppo, filtrata per numero di presenti.
- P1: Importazione della collezione da **BoardGameGeek** (nome utente BGG nel profilo → importa i giochi posseduti).
- P2: Storico delle partite.

### 6.7 Grafica
- P2: **Tema pixel art**: font pixel, icone 8/16-bit, bordi "a blocchi". I colori sono già raccolti in variabili CSS, così il tema si potrà cambiare senza riscrivere le pagine.

---

## 7. Regole di dominio

### 7.1 Ricorrenza (D13)
- Regola: giorno della settimana + **ogni N settimane** (N ≥ 1) + data di partenza + orario + fuso orario.
- Formato salvato: data del primo incontro (`anchor_date`) + `interval_weeks` + `start_time`. Il giorno della settimana si ricava dalla data. Per l'esportazione iCal si potrà generare l'equivalente RRULE (`FREQ=WEEKLY;INTERVAL=4;BYDAY=SA`).
- Gli incontri si **calcolano al volo** e diventano righe nel database al primo utilizzo (presenza, proposta, ospite, host).
- Il **cambio fisso** chiude la regola vecchia e ne apre una nuova da una certa data (tabella `group_schedules`). Gli incontri futuri che avevano già dati vengono azzerati e i membri ricevono un avviso (D12).
- Le modifiche a un singolo incontro sono **eccezioni**: data spostata, saltato, gioco diverso, host/luogo diverso.

### 7.2 Stato di un incontro
```
programmato ──(minimo raggiunto)──▶ confermato
     │                                  │
     ├──(salto approvato / owner)───────┴──▶ saltato
     ├──(cambio data approvato)─────────────▶ spostato
     └──(data passata)──────────────────────▶ concluso
```

### 7.3 Minimo presenti e avvisi (D6, D11)
| Momento | Condizione | Destinatari | Messaggio |
|---|---|---|---|
| **2 giorni prima** | presenti < minimo | chi non ha risposto + owner | "Mercoledì siete in 3, minimo 4: segna se ci sei!" |
| **Minimo raggiunto** (in qualsiasi momento, una volta sola) | presenti ≥ minimo | tutti i presenti | "Confermato: mercoledì si gioca! 🎲" |
| **1 giorno prima** | sempre | tutti i presenti | "Domani si gioca a Gloomhaven, alle 21 da Marco" |
| **1 giorno prima** | presenti < minimo | owner | "Manca ancora il minimo: decidi cosa fare" |

- Gli ospiti presenti **contano** nel minimo.
- Se il minimo non è raggiunto, l'incontro **non si annulla da solo**: decide l'owner (gioca comunque, salta, oppure cambia gioco con chi c'è).
- Se dopo la conferma qualcuno si ritira e si scende sotto il minimo, l'incontro torna "programmato" e l'owner riceve **subito** un avviso.

### 7.4 Proposte con più opzioni (D3, D9, D10)
- Tipi: `reschedule` (opzioni = date/ore), `skip` (nessuna opzione: Sì/No), `change_game` (opzioni = giochi).
- **Voto per approvazione**: ognuno spunta tutte le opzioni che gli vanno bene, oppure "nessuna".
- **Chiusura**: alla scadenza (**24 ore prima** dell'incontro originale), oppure prima, appena una delle opzioni soddisfa la regola.
- **Quale opzione vince**, secondo la regola del gruppo:
  - **Maggioranza**: vince l'opzione con più voti, purché abbia i voti di **più della metà degli aventi diritto** (membri + ospiti dell'incontro). In caso di **pareggio decide l'owner**.
  - **Unanimità dei presenti**: vince un'opzione votata da **tutti** quelli segnati presenti all'incontro. Se sono più d'una, vince la più votata.
  - **Decide l'owner**: i voti degli altri sono un parere; l'owner sceglie l'opzione o respinge la proposta.
- Se nessuna opzione soddisfa la regola, la proposta è **respinta** e l'incontro resta com'è.
- Per ogni incontro può esserci **una sola proposta aperta per tipo**.
- **Cambio data approvato** (D10): chi aveva votato la data vincente resta ✅ presente, gli altri tornano a "non ha risposto". Gli ospiti ricevono un avviso.
- Conteggio dei voti e applicazione della proposta avvengono **sul server**, in una transazione.
- Chiusura anticipata: con "maggioranza" appena un'opzione ha più della metà dei voti e nessun'altra può più raggiungerla (o quando non può più vincerne nessuna); con "unanimità dei presenti" quando tutti i presenti hanno votato.
- Le proposte scadute vengono chiuse quando qualcuno apre l'app; dalla fase 5 anche da un controllo programmato, che invierà le notifiche.

### 7.5 Gioco
- Ogni gruppo ha un gioco predefinito, che si cambia dalle impostazioni.
- Un incontro eredita il gioco predefinito, salvo una proposta approvata (o una decisione dell'owner sotto il minimo).

### 7.6 Ospiti (D4, D7)
- Qualsiasi membro genera un **link ospite** per un incontro.
- Chi lo apre fa login (lo stesso link via email o Google) e diventa ospite **di quell'incontro**.
- L'ospite vede solo quell'incontro e segna la presenza.
- Il link scade dopo l'incontro e chi l'ha creato, o l'owner, può revocarlo.
- Un ospite può essere aggiunto come membro dall'owner (es. "è venuto 3 volte, lo aggiungiamo?").

---

## 8. Modello dati

Tabelle Postgres su Supabase, protette con **Row Level Security**.

```
profiles
  id (= auth.users.id), display_name, avatar_url, timezone, locale, created_at

groups
  id, name, description
  mode (in_person | online | hybrid), default_location, online_link
  timezone, start_time, duration_minutes
  default_game_title?, min_attendees?
  approval_rule (majority | unanimous_attendees | owner_decides)
  status (active | paused | archived)
  invite_code, owner_id, created_at

group_schedules                   ← storico delle ricorrenze
  id, group_id, rrule, valid_from, valid_until?

memberships
  group_id, user_id, role (owner | member), joined_at

occurrences                       ← creata solo al primo utilizzo
  id, group_id, original_start, actual_start
  status (scheduled | confirmed | skipped | moved | done)
  game_title_override?, host_user_id?, location_override?, notes
  UNIQUE (group_id, original_start)

attendances
  occurrence_id, user_id, status (yes | no | maybe), note, updated_at

guest_invites
  id, occurrence_id, token, created_by, expires_at, revoked_at?

occurrence_guests                 ← ospiti (utenti registrati) di un incontro
  occurrence_id, user_id, invite_id, joined_at

proposals
  id, occurrence_id, type (reschedule | skip | change_game)
  created_by, created_at, closes_at
  status (open | approved | rejected | cancelled)
  winning_option_id?

proposal_options
  id, proposal_id, position
  new_start?            ← per reschedule
  game_title? / game_id?  ← per change_game

votes                             ← voto per approvazione: una riga per opzione accettata
  proposal_id, option_id, user_id, created_at
  (per skip: option unica "sì")

games                             ← P1: catalogo condiviso
  id, title, kind (board | rpg | online | other)
  min_players?, max_players?, duration_minutes?, image_url?, bgg_id?

user_games                        ← P1: libreria personale
  user_id, game_id, is_favorite, added_at

push_subscriptions
  id, user_id, endpoint, keys jsonb, created_at

notifications_log                 ← evita invii doppi
  id, occurrence_id, kind (min_check_48h | confirmed | reminder_24h | owner_min_24h | ...), sent_at
```

La libreria del gruppo è una **vista**: l'unione degli `user_games` dei membri, con il proprietario di ogni gioco e il numero di "preferito".

---

## 9. Schermate e flussi

### 9.1 Schermate
1. ✅ **Login**
2. **Home – Prossimi incontri**: card con data, gruppo, gioco, host, presenze "3/5 (min. 4)", pulsanti ✅❌❔, badge per proposte e avvisi.
3. **I miei gruppi** + "Nuovo gruppo" / "Entra con codice".
4. **Dettaglio gruppo**: info, prossimi incontri, membri, link d'invito.
5. **Impostazioni gruppo** (owner).
6. **Crea gruppo** (wizard in 3 passi).
7. **Dettaglio incontro**: presenze, gioco, host/luogo, ospiti, proposte, "Proponi modifica", "Invita ospite".
8. **Nuova proposta**: tipo → aggiungi 1+ date o 1+ giochi.
9. **Dettaglio proposta**: opzioni con caselle di spunta, chi ha votato cosa, scadenza.
10. **Pagina ospite** (`/guest/[token]`): login e poi dettaglio dell'incontro.
11. **Profilo**: nome, fuso orario, lingua, notifiche, "installa app".
12. P1: **La mia libreria** e **libreria del gruppo** con i preferiti.

### 9.2 Flussi chiave
- **Proposta con più date**: dettaglio incontro → "Proponi modifica" → "Cambio data" → aggiungo giovedì 20:30 e venerdì 21:00 → i membri spuntano le date che vanno bene → la regola del gruppo decide → l'incontro si sposta, i voti diventano presenze e tutti ricevono un avviso.
- **Sotto il minimo**: 2 giorni prima, avviso a chi non ha risposto e all'owner → 1 giorno prima, l'owner riceve "decidi cosa fare" → sceglie "giochiamo comunque", "saltiamo" o "cambiamo gioco".
- **Ospite**: un membro copia il link ospite → l'amico lo apre, fa login e vede l'incontro → segna ✅ → il contatore sale.

---

## 10. Notifiche

| Evento | Destinatari | Priorità |
|---|---|---|
| Minimo non raggiunto, 2 giorni prima | chi non ha risposto + owner | P0 |
| Minimo raggiunto ("si gioca!") | presenti | P0 |
| Promemoria 1 giorno prima | presenti | P0 |
| Minimo non raggiunto, 1 giorno prima ("decidi") | owner | P0 |
| Nuova proposta | membri tranne l'autore | P0 |
| Proposta chiusa (esito) | membri + ospiti coinvolti | P0 |
| Cambio fisso del giorno | membri | P0 |
| Sceso sotto il minimo dopo la conferma | owner | P0 |
| Pareggio in una proposta ("decidi tu") | owner | P0 |
| Nuovo ospite/membro | owner | P1 |

**Canali.**
- **Web Push**. Su iPhone funziona solo con la webapp installata sulla home (iOS 16.4 o successivo).
- **Email** di riserva, tramite **Resend** (piano gratuito), che servirà comunque per i link di accesso perché il servizio email incluso in Supabase invia pochissimi messaggi l'ora.

**Controlli programmati.** Un job orario (Supabase `pg_cron` + Edge Function, oppure un Cron Job di Vercel) trova gli incontri nelle finestre 48h/24h e invia gli avvisi una sola volta, registrandoli in `notifications_log`.

---

## 11. Architettura e stack tecnico

| Livello | Scelta |
|---|---|
| Framework | **Next.js 16** (App Router, Cache Components) + **TypeScript** |
| UI | **Tailwind CSS**; colori e font in variabili CSS, per il futuro tema pixel art |
| Traduzioni | **next-intl**: testi in `messages/it.json`, inglese aggiunto in seguito |
| PWA | Manifest ✅; service worker (Serwist) per le notifiche push |
| Database / Login / Tempo reale | **Supabase** (Postgres, Auth, Realtime, RLS) |
| Ricorrenze e date | `rrule` + `date-fns-tz` |
| Logica server | Funzioni SQL (RPC) per voti e proposte + Server Actions di Next.js |
| Job programmati | Supabase `pg_cron` + Edge Function |
| Email | **Resend** (SMTP personalizzato in Supabase) |
| Notifiche | `web-push` (VAPID) |
| Hosting | **Vercel** (produzione da `main`, anteprime dai branch) |
| Test | Vitest (ricorrenze e voti), Playwright (flussi) |

### 11.1 Struttura del repository
```
/src
  /app            → pagine (login ✅, home ✅, gruppi, incontri, ospiti…)
  /components     → componenti UI
  /lib            → client Supabase ✅, ricorrenze, date
  /proxy.ts       → rinnovo della sessione e protezione delle pagine ✅
/supabase
  /migrations     → schema SQL, policy RLS, funzioni
  /functions      → Edge Functions (avvisi, push)
/messages         → traduzioni (it, en)
/public           → icone ✅
/docs             → questa documentazione
```

### 11.2 Configurazione
Le istruzioni passo passo sono nel [README](../README.md): variabili d'ambiente, URL di redirect, template email.

---

## 12. Roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| **0 – Fondamenta** | Next.js, Supabase, login via email, PWA base, deploy | ✅ fatto |
| **1 – Gruppi** | Schema database + RLS, profilo, creazione gruppo con ricorrenza ogni N settimane, invito membri, impostazioni, cambio fisso del giorno, trasferimento owner | ✅ fatto |
| **2 – Incontri e presenze** | Calcolo incontri, home, RSVP in tempo reale, dettaglio incontro, contatore del minimo, decisioni dell'owner sul singolo incontro (salta, gioco/luogo diverso, nota) | ✅ fatto |
| **3 – Proposte** | Date/giochi multipli, voto per approvazione, 3 regole di approvazione, chiusura 24 ore prima, applicazione lato server | ✅ fatto (da provare) |
| **4 – Ospiti** | Link ospite, login dell'ospite, pagina dell'incontro, presenza che conta nel minimo | |
| **5 – Notifiche ed email** | Resend, Web Push, avvisi a 48h e 24h, conferma, promemoria, "decidi" per l'owner | |
| **6 – Beta con gli amici** | Uso reale sulle sessioni A–D | **MVP** |
| **7 – Extra** | Login Google, host a rotazione, librerie, preferiti e import da BGG, inglese, calendario | |
| **8 – Grafica** | Tema pixel art | |
| **9 – Futuro** | Storico partite, iCal | |

---

## 13. Rischi e punti delicati

- **Ricorrenze e fusi orari**: servono test automatici, incluso il cambio dell'ora legale.
- **Voti in contemporanea**: chiusura delle proposte con una transazione SQL, così una proposta non si applica due volte.
- **Notifiche su iPhone**: arrivano solo con la webapp installata sulla home. Serve una guida nell'app, con l'email come riserva.
- **Limiti email di Supabase**: pochi messaggi l'ora. Prima della beta va configurato Resend.
- **Link ospite**: token lunghi e casuali, con scadenza e possibilità di revoca.
- **BoardGameGeek**: dal 2025 l'API XML richiede la registrazione dell'applicazione (gratuita per uso non commerciale) e risponde in modo asincrono per le collezioni. Va registrata prima della fase 7.
- **Privacy**: un'informativa minima e la possibilità di cancellare l'account.

---

## 14. Domande aperte

Nessuna al momento. Nuove domande verranno aggiunte qui man mano che si sviluppano le fasi.
