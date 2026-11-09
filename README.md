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

## Sviluppo
```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```
