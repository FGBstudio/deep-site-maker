
# Time Tracking & Budget Orario — Piano di implementazione

Sistema frictionless di tracking ore per `certifications`, con allocazione ibrida (globale + override milestone), inserimento giornaliero rapido da parte dei PM, e analytics di burn rate / saturazione per l'Admin.

## 1. Modello Dati (Supabase)

### 1.1 Estensioni a tabelle esistenti

**`certifications`** — aggiungere:
- `allocated_hours numeric` (monte ore globale della commessa)

**`certification_milestones`** — aggiungere:
- `allocated_hours numeric NULL` (override opzionale per milestone specifiche)

### 1.2 Nuova tabella `time_entries`

Campi:
- `id uuid PK`
- `user_id uuid` (PM che logga, FK logica a `auth.users`)
- `certification_id uuid NOT NULL` (root entity)
- `milestone_id uuid NULL` (opzionale, FK logica a `certification_milestones`)
- `entry_date date NOT NULL`
- `hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24)`
- `description text NULL`
- `overbudget_note text NULL` (compilato quando si supera il budget)
- `is_overbudget boolean DEFAULT false` (calcolato lato edit, vedi §3)
- `created_at`, `updated_at`

### 1.3 RLS

- **SELECT**: il PM vede solo le proprie entries (`user_id = auth.uid()`). Admin vede tutto via `is_admin()`. PM della certificazione vede tutte le entries della propria cert via `is_cert_pm()`.
- **INSERT/UPDATE/DELETE**: solo il proprietario (`user_id = auth.uid()`) entro N giorni dalla data dell'entry (lock retroattivo opzionale, default 14gg). Admin override.
- **`certifications.allocated_hours`** e **`certification_milestones.allocated_hours`**: solo Admin in scrittura; PM in lettura.

### 1.4 View aggregate (per analytics)

- `view_cert_hours_burn`: per ogni certification → `allocated_hours`, `consumed_hours`, `pct_used`, `status` (green<80, yellow 80-100, red>100).
- `view_milestone_hours_burn`: stesso schema per milestone con allocazione esplicita.
- `view_user_weekly_saturation`: per `user_id` + `week_start` → ore loggate totali, breakdown per cert.

## 2. UX & Componenti Frontend

### 2.1 Admin — Allocazione (Fase 1, top-down)

**Dove**: estendere `PMProjectConfigModal.tsx` (e/o `ProjectFormModal.tsx`) con una sezione "Hours Budget".

Campi:
- Total Hours (obbligatorio): allocazione globale sulla cert.
- Tabella milestone con colonna `Allocated Hours` editabile inline (override opzionale).
- Indicatore live: "Allocated to milestones: X / Total Y" con warning se override > totale.

### 2.2 PM — Pagina "My Timesheet" (Fase 2, bottom-up)

**Nuova pagina**: `src/pages/MyTimesheet.tsx`, link nel TopNavbar visibile a ruoli PM/ADMIN.

Layout (lista giornaliera + quick add):
- Header: date picker giorno + frecce ◀ ▶ + chip "Today" + totale ore del giorno.
- Mini-strip settimanale sopra (Mon-Sun con totali ore per giorno e barra verticale highlight su quello selezionato) per orientamento rapido.
- Body: lista delle entries del giorno selezionato (card compatte: certificazione, milestone opzionale, ore, descrizione, menu kebab edit/delete).
- Quick add bar in fondo (sticky): `[Certification ▾] [Milestone ▾ optional] [Hours #] [Description] [+ Add]`. Submit con Enter; il dropdown Certification mostra solo le cert assegnate al PM.
- Dopo l'inserimento: toast + barra di progresso contestuale che appare per ~3s sotto la entry appena creata: *"You've logged 18h / 20h on Milestone X"*.

### 2.3 Soft Alert overbudget (Fase 2 leverage point)

Doppio livello (milestone + globale):
- **80%** → barra gialla, tooltip "Approaching budget cap".
- **100%+** → barra rossa, l'inserimento NON è bloccato ma compare un campo obbligatorio `overbudget_note` ("Reason for overrun") prima del submit. Salvato in `time_entries.overbudget_note` e flag `is_overbudget = true`.
- Notifica passiva visibile all'Admin nella dashboard (badge rosso sulla riga del progetto).

### 2.4 Admin — Analytics (Fase 3, loop di controllo)

Due nuovi componenti in `src/components/dashboard/`:

**`ProjectBurnRate.tsx`** (tabella in `CeoDashboard`):
Colonne: Project | Client | PM | Allocated h | Consumed h | % | Status pill (G/Y/R) | Overrun alerts count.
Click riga → drilldown modal con breakdown per milestone e timeline delle entries.

**`ResourceMonitor.tsx`** (sezione "Resources" della CeoDashboard):
- Tabella PM con: PM | Hours this week | Saturation % (su base 40h) | Active projects count.
- Click su un PM → modal con calendario settimanale read-only (lista entries del PM per la settimana selezionata, raggruppate per progetto).

## 3. Logica & Hooks

Nuovi file:
- `src/hooks/useTimeEntries.ts` — CRUD + query per giorno/settimana/cert.
- `src/hooks/useHoursBudget.ts` — fetch aggregati da `view_cert_hours_burn` e `view_milestone_hours_burn`; espone helper `getBudgetStatus(consumed, allocated)`.
- `src/hooks/useResourceUtilization.ts` — fetch da `view_user_weekly_saturation`.
- `src/types/time-tracking.ts` — interfacce TS.

Query keys standardizzate: `['time-entries', userId, dateRange]`, `['hours-burn', certId]`, `['resource-utilization', weekStart]`. Invalidare cross-key dopo ogni mutation.

## 4. Navigazione & Permessi

- TopNavbar: nuovo link **"My Timesheet"** (icona Clock) per ruoli PM + ADMIN.
- CeoDashboard: nuovi tab/sezione **"Hours"** (ADMIN only) con i due componenti sopra.
- Route: `/timesheet` (protetta), `/dashboard?tab=hours`.

## 5. Rollout in fasi

1. **Migration DB** (estensioni + nuova tabella + RLS + views).
2. **Admin allocation UI** in `PMProjectConfigModal`.
3. **MyTimesheet page** + hooks CRUD + soft alert logic.
4. **Admin analytics** (`ProjectBurnRate`, `ResourceMonitor`) nella CeoDashboard.
5. **Memory update**: registrare il nuovo dominio "time-tracking" in `mem://features/time-tracking`.

## Dettagli tecnici (riepilogo)

```text
certifications.allocated_hours (numeric)
certification_milestones.allocated_hours (numeric, nullable)
time_entries (id, user_id, certification_id, milestone_id?, entry_date,
              hours, description, overbudget_note, is_overbudget, ts)

Views:
  view_cert_hours_burn      → burn rate per cert
  view_milestone_hours_burn → burn rate per milestone allocata
  view_user_weekly_saturation → ore settimanali per PM

Frontend:
  src/pages/MyTimesheet.tsx
  src/components/dashboard/ProjectBurnRate.tsx
  src/components/dashboard/ResourceMonitor.tsx
  src/hooks/useTimeEntries.ts
  src/hooks/useHoursBudget.ts
  src/hooks/useResourceUtilization.ts
```

Nessun blocco hard sull'inserimento ore: il sistema cattura sempre la realtà, il controllo avviene nel loop analytics dell'Admin.
