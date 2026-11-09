# Schednd — Piano di progetto

> App Android per organizzare sessioni ricorrenti di giochi da tavolo, giochi di ruolo, giochi online e meetup fisici: chi c'è, quando si gioca, a cosa si gioca.

Stato: **bozza v0.1**. Le scelte segnate con ❓ dipendono dalle risposte alle [domande aperte](#13-domande-aperte).

---

## Indice

1. [Visione e obiettivi](#1-visione-e-obiettivi)
2. [Glossario](#2-glossario)
3. [Esempio di riferimento](#3-esempio-di-riferimento)
4. [Utenti e ruoli](#4-utenti-e-ruoli)
5. [Funzionalità](#5-funzionalità)
6. [Regole di dominio](#6-regole-di-dominio)
7. [Modello dati](#7-modello-dati)
8. [Schermate e flussi](#8-schermate-e-flussi)
9. [Notifiche](#9-notifiche)
10. [Architettura e stack tecnico](#10-architettura-e-stack-tecnico)
11. [Roadmap](#11-roadmap)
12. [Rischi e punti delicati](#12-rischi-e-punti-delicati)
13. [Domande aperte](#13-domande-aperte)

---

## 1. Visione e obiettivi

**Problema.** Chi gioca in più gruppi coordina tutto su chat (WhatsApp, Telegram, Discord). Le presenze si perdono tra i messaggi, i cambi di data si decidono "a voce" e non è mai chiaro chi viene e a cosa si gioca.

**Soluzione.** Un'app in cui ogni gruppo ha una sessione ricorrente con un calendario. Ogni incontro mostra le presenze, il gioco in programma e le proposte di modifica (cambio giorno, salto, cambio gioco), che si votano e si applicano in modo trasparente.

**Obiettivi dell'MVP**
- Vedere in un'unica schermata tutti i prossimi incontri di tutte le mie sessioni.
- Segnare la mia presenza con un tap.
- Creare una sessione ricorrente e invitarci altre persone.
- Proporre e votare: cambio giorno, salto dell'incontro, cambio gioco.
- Ricevere notifiche su quello che mi riguarda.

**Fuori dall'MVP (per ora)**
- iOS e web (da valutare dopo, vedi §10).
- Chat interna: si continua a usare quella esistente, al massimo con un link.
- Gestione di campagne GdR (schede, diari, mappe).

---

## 2. Glossario

| Termine | Significato |
|---|---|
| **Sessione** (Gruppo/Tavolo) | Il gruppo ricorrente, es. "Sessione A – D&D del mercoledì". Ha membri, regola di ricorrenza, gioco predefinito e luogo. |
| **Incontro** (Occurrence) | La singola data di una sessione, es. "mercoledì 18 novembre 2026". Le presenze e le proposte sono legate all'incontro. |
| **Regola di ricorrenza** | Ogni quanto si gioca: settimanale, ogni 2 settimane, ecc. Ha una data di partenza (*ancora*). |
| **Presenza** (RSVP) | La risposta di un membro per un incontro: ✅ presente, ❌ assente, ❔ forse, — non ha risposto. |
| **Proposta** | Una richiesta di modifica che i membri votano: cambio data, salto, cambio gioco. |
| **Gioco** | Il titolo giocato (es. "D&D 5e", "Gloomhaven", "Among Us"). Può essere il predefinito della sessione o cambiare per un singolo incontro. |
| **Quorum** | Numero minimo di presenti perché l'incontro si confermi. |

---

## 3. Esempio di riferimento

| Sessione | Giocatori | Ricorrenza | Note |
|---|---|---|---|
| A | 5 fissi | ogni mercoledì | |
| B | 4 fissi | ogni martedì | |
| C | 6 fissi | ogni 2 venerdì | serve una data di partenza per sapere *quali* venerdì |
| D | variabili | ogni sabato | sessione "aperta": chi c'è c'è, con un eventuale limite di posti |

Questo esempio porta a due **tipi di sessione**:
- **Chiusa**: membri fissi e un quorum (es. "si gioca se ci siamo almeno in 4 su 5").
- **Aperta**: gli iscritti si prenotano incontro per incontro, con un numero massimo di posti opzionale e una lista d'attesa.

---

## 4. Utenti e ruoli

| Ruolo | Permessi |
|---|---|
| **Owner** (chi crea la sessione) | Tutto: modifica impostazioni, ricorrenza e gioco predefinito; gestisce i membri; nomina gli admin; elimina la sessione. |
| **Admin** (opzionale) ❓ | Come l'owner, tranne eliminare la sessione o rimuovere l'owner. Può applicare una proposta senza voto. |
| **Membro** | Vede la sessione, segna la presenza, crea proposte, vota. |
| **Ospite** (sessioni aperte) ❓ | Si prenota per un singolo incontro senza essere membro fisso. |

Ogni utente:
- vede **tutte** le proprie sessioni e i propri incontri;
- può **creare** nuove sessioni, diventandone owner;
- può **proporre** modifiche in qualsiasi sessione di cui è membro.

---

## 5. Funzionalità

Priorità: **P0** = MVP, **P1** = subito dopo, **P2** = in futuro.

### 5.1 Account
- P0: Registrazione e login (Google Sign-In ed email/password ❓).
- P0: Profilo con nome visualizzato, avatar e fuso orario.
- P1: Preferenze di notifica.
- P2: Disponibilità generica settimanale (es. "il lunedì non ci sono mai").

### 5.2 Sessioni
- P0: Crea una sessione: nome, descrizione, tipo (chiusa/aperta), ricorrenza, orario d'inizio e durata, gioco predefinito, modalità (fisica/online/ibrida), luogo o link.
- P0: Invita tramite link o codice; entra in una sessione con un codice.
- P0: Lista membri e loro ruoli.
- P0: Modifica le impostazioni (owner/admin).
- P1: Archivia/metti in pausa una sessione (es. pausa estiva).
- P1: Rotazione dell'host: a turno qualcuno ospita a casa propria.
- P2: Colore e icona per riconoscere la sessione nel calendario.

### 5.3 Incontri e calendario
- P0: **Home "Prossimi incontri"**: lista cronologica di tutti gli incontri di tutte le mie sessioni, con il mio stato di presenza.
- P0: Dettaglio incontro: data e ora, gioco, luogo/link, presenze (chi sì, chi no, chi forse, chi non ha risposto), proposte attive.
- P1: Vista calendario mensile.
- P1: Incontro straordinario singolo, fuori dalla ricorrenza.
- P1: Note per l'incontro (es. "porto io le pizze", "finiamo il dungeon").
- P2: Esportazione nel calendario Google/di sistema (iCal).

### 5.4 Presenze
- P0: Presente / Assente / Forse con un tap, anche dalla home.
- P0: Nota opzionale (es. "arrivo alle 22").
- P0: Riepilogo "4/5 presenti", con indicazione di quorum raggiunto o meno.
- P1: Segnare in anticipo un'assenza su più incontri (es. "sono in vacanza dal 10 al 24").
- P1: Lista d'attesa per le sessioni aperte piene.

### 5.5 Proposte e voto
- P0: **Cambio data/ora** di un singolo incontro.
- P0: **Salto** di un incontro.
- P0: **Cambio gioco** per un singolo incontro.
- P1: Cambio **permanente**, cioè della ricorrenza ("da ora in poi giochiamo il giovedì") o del gioco predefinito.
- P1: Proposta con più date alternative, per trovare la data migliore (stile Doodle).
- P0: Voto Sì/No, con stato visibile e scadenza.
- P0: Applicazione automatica quando si raggiunge la soglia (vedi §6.3).

### 5.6 Giochi
- P0: Il gioco è un testo libero, con suggerimenti tra i giochi già usati.
- P1: Libreria giochi della sessione (titolo, tipo, giocatori min/max, durata, immagine).
- P2: Integrazione BoardGameGeek per cercare titoli e copertine ❓.
- P2: Storico delle partite giocate (cosa, quando, chi c'era).

---

## 6. Regole di dominio

### 6.1 Ricorrenza
- Tipi supportati nell'MVP: **settimanale** con intervallo N (N=1 ogni settimana, N=2 ogni due settimane), più giorno della settimana e orario.
- La **data di ancoraggio** stabilisce quali settimane: nella Sessione C, il primo venerdì di gioco fa da ancora, poi ogni 14 giorni.
- P1: mensile, sia "ogni primo sabato del mese" sia "ogni 15 del mese".
- Conviene salvare la regola in formato **RRULE** (standard iCalendar, RFC 5545): è facile da esportare e ci sono librerie già pronte.
- Gli incontri si **generano al volo** per una finestra (es. le prossime 8 settimane). Diventano record nel database solo quando qualcuno ci interagisce (presenza, proposta, nota). Questo evita di riempire il database di incontri vuoti.
- Una modifica a un singolo incontro crea un'**eccezione** (data spostata, saltato, gioco diverso) che sovrascrive la regola solo per quella data.
- Fusi orari: data e ora vanno salvate con il fuso della sessione (es. `Europe/Rome`). Il cambio dell'ora legale non deve spostare gli incontri.

### 6.2 Stato di un incontro
```
programmato ──(quorum raggiunto)──▶ confermato
     │                                   │
     ├──(proposta di salto approvata)────┴──▶ saltato
     ├──(proposta di cambio data approvata)─▶ spostato (nuova data)
     └──(data passata)──────────────────────▶ concluso
```
- **Quorum** (solo sessioni chiuse): numero di presenti configurabile. Se a X ore dall'incontro non è raggiunto, l'app avvisa che l'incontro è a rischio ❓.

### 6.3 Proposte
- Una proposta ha: tipo, incontro di riferimento (o "permanente"), valore proposto, autore, scadenza, voti.
- **Regola di approvazione** configurabile per sessione ❓:
  - *Maggioranza dei membri* (default per le sessioni chiuse);
  - *Unanimità* dei presenti a quell'incontro (utile per il cambio data: se sposti, devono poterci essere tutti);
  - *Decide l'owner/admin*, con i voti solo come parere.
- Alla scadenza senza soglia raggiunta, la proposta è **respinta**.
- Per lo stesso incontro e lo stesso tipo può esserci **una sola proposta attiva** alla volta, così si evitano conflitti.
- Dopo un **cambio data**, le presenze vengono **azzerate** (chi c'era il mercoledì non è detto ci sia il giovedì). Chi aveva votato Sì alla nuova data viene segnato presente in automatico ❓.
- Il **salto** può essere approvato dall'owner/admin anche senza voto (es. emergenza del master) ❓.

### 6.4 Gioco
- Ogni sessione ha un **gioco predefinito**, che può anche mancare.
- Ogni incontro eredita il predefinito, a meno che una proposta approvata (o un admin) lo cambi **solo per quell'incontro**.
- Un cambio permanente modifica il predefinito per tutti gli incontri futuri che non hanno già un'eccezione.

---

## 7. Modello dati

Modello concettuale, indipendente dal database:

```
User
  id, displayName, email, avatarUrl, timezone, fcmTokens[]

Session
  id, name, description, type (CLOSED|OPEN), mode (IN_PERSON|ONLINE|HYBRID)
  location, onlineLink
  rrule, anchorDate, startTime, durationMinutes, timezone
  defaultGameId?, quorum?, maxSeats?
  approvalRule (MAJORITY|UNANIMOUS_ATTENDEES|ADMIN_DECIDES)
  status (ACTIVE|PAUSED|ARCHIVED), createdBy, createdAt
  inviteCode

Membership
  sessionId, userId, role (OWNER|ADMIN|MEMBER|GUEST), joinedAt

Game
  id, sessionId?, title, kind (BOARD|RPG|ONLINE|OTHER)
  minPlayers?, maxPlayers?, imageUrl?, externalId? (BGG)

Occurrence                      ← creato solo al primo utilizzo
  id, sessionId
  originalStart                 ← la data prevista dalla regola (chiave stabile)
  actualStart                   ← diversa se spostato
  status (SCHEDULED|CONFIRMED|SKIPPED|MOVED|DONE)
  gameIdOverride?, notes

Attendance
  occurrenceId, userId, status (YES|NO|MAYBE), note, updatedAt

Proposal
  id, sessionId, occurrenceId? (null = permanente)
  type (RESCHEDULE|SKIP|CHANGE_GAME|CHANGE_RECURRENCE|CHANGE_DEFAULT_GAME)
  payload (es. { newStart } / { gameId })
  createdBy, createdAt, expiresAt
  status (OPEN|APPROVED|REJECTED|CANCELLED|EXPIRED)

Vote
  proposalId, userId, value (YES|NO), createdAt
```

La chiave che identifica un incontro è **(sessionId, originalStart)**: così presenze e proposte restano agganciate all'incontro giusto anche se viene spostato.

---

## 8. Schermate e flussi

### 8.1 Schermate MVP
1. **Login / Onboarding**
2. **Home – Prossimi incontri**: card con data, sessione, gioco, presenze (3/5), il mio stato e i pulsanti rapidi ✅❌❔. Un badge segnala le proposte da votare.
3. **Le mie sessioni**: lista, con pulsante "+" per crearne una ed "Entra con codice".
4. **Dettaglio sessione**: info, ricorrenza, membri, prossimi incontri, impostazioni.
5. **Crea/Modifica sessione**: wizard in 3 passi (info e tipo → ricorrenza e orario → gioco e luogo).
6. **Dettaglio incontro**: presenze, gioco, luogo, note, proposte attive, pulsante "Proponi modifica".
7. **Nuova proposta**: scegli il tipo (cambio data / salto / cambio gioco), poi inserisci il valore e la scadenza.
8. **Dettaglio proposta**: voti, tempo rimanente, pulsanti Vota Sì/No.
9. **Profilo e impostazioni**.

### 8.2 Flussi principali
- **Creo una sessione** → configuro la ricorrenza → ottengo il link d'invito → lo condivido su WhatsApp → gli amici aprono il link, installano l'app ed entrano nella sessione.
- **Segno la presenza** → dalla home, un tap su ✅ → il contatore si aggiorna in tempo reale per tutti.
- **Propongo un cambio data** → dettaglio incontro → "Proponi modifica" → nuova data → notifica ai membri → voti → alla soglia l'incontro si sposta e tutti ricevono una notifica.

---

## 9. Notifiche

| Evento | Chi riceve | Priorità |
|---|---|---|
| Nuova proposta nella mia sessione | tutti i membri tranne l'autore | P0 |
| Proposta approvata/respinta | tutti i membri | P0 |
| Promemoria: "non hai ancora risposto per mercoledì" | chi non ha risposto, X giorni prima | P0 |
| Promemoria incontro: "domani si gioca!" | i presenti | P1 |
| Quorum non raggiunto a X ore dall'incontro | owner/admin (o tutti) | P1 |
| Nuovo membro nella sessione | owner/admin | P1 |
| Un posto si libera (lista d'attesa) | il primo in lista | P1 |

Tecnologia: **Firebase Cloud Messaging (FCM)**. I promemoria programmati girano lato server (Cloud Functions schedulate o cron).

---

## 10. Architettura e stack tecnico

### 10.1 Proposta consigliata

| Livello | Scelta | Perché |
|---|---|---|
| Linguaggio | **Kotlin** | Standard per Android |
| UI | **Jetpack Compose** + Material 3 | UI moderna e dichiarativa, meno codice |
| Architettura | MVVM + Clean Architecture leggera (ui / domain / data), un solo modulo all'inizio | Semplice ma testabile |
| DI | Hilt | Standard Android |
| Async | Coroutines + Flow | Si sposa bene con i dati in tempo reale |
| Navigazione | Navigation Compose | Gestisce anche i deep link d'invito |
| Cache locale / offline | Room (oppure la cache offline di Firestore) | L'app si apre e mostra i dati anche senza rete |
| Date | `java.time` + una libreria RRULE (es. `lib-recur`) | Ricorrenze affidabili |
| Backend | **Firebase**: Auth, Firestore, Cloud Functions, FCM | Niente server da gestire, tempo reale incluso, piano gratuito sufficiente all'inizio |
| Logica server | Cloud Functions (TypeScript): conteggio voti, applicazione proposte, promemoria | Le regole critiche girano lato server, non sul telefono |
| Sicurezza | Firestore Security Rules: legge e scrive solo chi è membro della sessione | |
| Inviti | Android App Links con un dominio proprio (Firebase Dynamic Links è stato dismesso) | |
| CI | GitHub Actions: build, lint, test | |
| Distribuzione | Google Play, con il canale *Internal testing* per gli amici | |

### 10.2 Alternativa: Supabase (Postgres)
Il modello dati è molto **relazionale** (sessioni ↔ membri ↔ incontri ↔ voti), e un database SQL lo rappresenta meglio: query come "tutti i miei incontri della settimana con il conteggio delle presenze" sono più naturali. Supabase offre Auth, Realtime ed Edge Functions. Le notifiche push passerebbero comunque da FCM.
**Consiglio:** Firebase se vuoi partire veloce con l'ecosistema Android più integrato; Supabase se ti trovi bene con SQL o temi di dover fare report complessi ❓.

### 10.3 Multipiattaforma?
Se in futuro qualcuno del gruppo ha un iPhone, conviene decidere **ora**:
- **Kotlin Multiplatform + Compose Multiplatform**: stesso linguaggio, Android e iOS da un unico codice.
- **Flutter**: molto maturo per il multipiattaforma, ma usa Dart.
- **Solo Android nativo**: la scelta più semplice, ma per iOS bisognerebbe riscrivere tutto. ❓

### 10.4 Struttura del repository (bozza)
```
/app                    → modulo Android
  /ui                   → schermate Compose e ViewModel
  /domain               → modelli, casi d'uso (es. GenerateOccurrences, CastVote)
  /data                 → repository, Firestore/Room
/functions              → Cloud Functions (TypeScript)
/firestore.rules
/docs                   → questa documentazione
```

---

## 11. Roadmap

| Fase | Contenuto | Risultato |
|---|---|---|
| **0 – Fondamenta** | Setup del progetto Android, Firebase, CI, login con Google, profilo | L'app si installa e permette di loggarsi |
| **1 – Sessioni** | Creazione sessione, ricorrenza settimanale e bisettimanale, inviti con codice/link, lista membri | Si crea la Sessione A e ci si invitano 4 amici |
| **2 – Incontri e presenze** | Generazione degli incontri, home "Prossimi incontri", RSVP, dettaglio incontro | Ognuno segna se c'è mercoledì |
| **3 – Proposte** | Cambio data, salto, cambio gioco; voto; applicazione lato server | Si sposta un incontro votando |
| **4 – Notifiche** | FCM: nuove proposte, esiti, promemoria RSVP | L'app "vive" senza doverla aprire |
| **5 – Beta con gli amici** | Internal testing su Play, raccolta feedback, correzioni | **MVP completato** |
| **6 – P1** | Sessioni aperte con posti e lista d'attesa, vista calendario, assenze multiple, modifiche permanenti, sondaggi data stile Doodle, libreria giochi | |
| **7 – P2** | BGG, storico partite, esportazione iCal, eventuale iOS | |

Suggerimento: arrivare alla **beta con gli amici il prima possibile** (fasi 0–3) e usarla subito sulle sessioni reali A–D. Il loro feedback vale più di qualsiasi piano.

---

## 12. Rischi e punti delicati

- **Ricorrenze e fusi orari**: la fonte di bug più comune. Servono test automatici sulla generazione degli incontri, incluso il cambio dell'ora legale.
- **Concorrenza dei voti**: due voti contemporanei non devono applicare la proposta due volte. Conteggio e applicazione vanno fatti lato server, in una transazione.
- **Adozione**: se gli amici non installano l'app, l'app non serve a niente. L'invito deve essere semplicissimo, e si può valutare una vista web in sola lettura per chi non ha l'app.
- **Notifiche troppo frequenti**: vanno raggruppate e rese configurabili, altrimenti gli utenti le disattivano.
- **Privacy/GDPR**: i dati personali sono pochi (nome ed email), ma servono comunque un'informativa privacy (obbligatoria su Play Store) e la possibilità di cancellare l'account.
- **Costi**: il piano gratuito di Firebase basta per decine di utenti. Bisogna però evitare letture inutili, ad esempio con listener troppo ampi.

---

## 13. Domande aperte

Rispondere a queste domande aiuta a chiudere i punti segnati con ❓.

### Utenti e scopo
1. L'app è per **uso personale/tra amici**, oppure vuoi pubblicarla per chiunque (con possibile monetizzazione)?
2. Quante persone prevedi all'inizio? Solo i giocatori delle sessioni A–D, o di più?
3. Ci sono amici con **iPhone**? Serve iOS, o una versione web, prima o poi?

### Sessioni
4. Nella Sessione D, "giocatori variabili" vuol dire che **chiunque della sessione può venire**, con o senza **limite di posti**? Possono partecipare persone esterne (ospiti)?
5. Serve un **quorum** (es. "se siamo meno di 4 non si gioca")? Va deciso dall'owner per ogni sessione?
6. Oltre a settimanale e bisettimanale, servono ricorrenze **mensili** ("primo sabato del mese")?
7. Gli incontri **fisici** hanno sempre lo stesso luogo, oppure **ruota l'host** (a casa di uno, poi di un altro)?
8. Per le sessioni **online**, basta un link (Discord, Roll20, Foundry…) o vuoi integrazioni più profonde?
9. Una persona può essere **master/GM** con un ruolo speciale (es. il salto lo decide lui)?

### Proposte e voto
10. Come vuoi che si approvi una proposta: **maggioranza**, **unanimità**, **decide l'owner**, oppure **configurabile per sessione**?
11. Le proposte devono avere una **scadenza** (es. 48 ore, o "entro 24 ore prima dell'incontro")?
12. Il **cambio giorno** riguarda di solito **un singolo incontro** o anche la **ricorrenza** ("da ora giochiamo il giovedì")? Servono entrambi già nell'MVP?
13. Quando si propone un cambio data, vuoi poter indicare **più date alternative** da votare (stile Doodle)?
14. Il **salto** di un incontro può deciderlo l'owner da solo, o deve sempre passare dal voto?

### Giochi
15. Per il gioco basta un **nome libero**, o vuoi una **libreria** con dettagli (giocatori min/max, durata, copertina)?
16. Ti interessa l'integrazione con **BoardGameGeek** (ricerca titoli, copertine, magari la collezione di ciascuno)?
17. Ti interessa tenere uno **storico** di cosa si è giocato e chi c'era?

### Notifiche e uso quotidiano
18. Quali notifiche ritieni **indispensabili**? Con quanto anticipo vuoi il promemoria per chi non ha risposto?
19. Vuoi una **disponibilità generale** ("di lunedì non posso mai") che l'app usa per suggerire le date migliori?
20. Serve una **chat** dentro l'app, o basta il link al gruppo WhatsApp/Telegram/Discord esistente?

### Tecnica e progetto
21. Che **esperienza di sviluppo** hai? Conosci Kotlin/Android, o preferisci uno stack più accessibile?
22. Hai preferenze sul **backend**: Firebase, Supabase, un server tuo?
23. **Login**: Google basta, o servono anche email/password, Apple o Discord?
24. Lingua dell'app: **solo italiano**, o anche inglese fin da subito?
25. Hai già un'idea di **stile grafico** (tema scuro, fantasy, minimal…)? Il nome "Schednd" resta?
26. Vuoi che ti aiuti anche a **scrivere il codice** fase per fase, partendo dallo scheletro del progetto (fase 0)?
