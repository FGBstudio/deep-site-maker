## Obiettivo

Spostare totalmente la gestione del ciclo "Pending → Approved / Canceled" delle quotazioni dentro la sezione **Quotations**, e lasciare a **Operations** solo i progetti già approvati con l'azione "Assegna PM".

## Stato attuale

- `Quotations` (`src/pages/Quotations.tsx`): ha 2 tab (Pending / Approved), bottone "Mark as Approved" che chiama `approve-quotation`. **Manca** azione Cancel e tab Canceled.
- `Operations` (`src/pages/Projects.tsx`, tab Projects): mostra la tab "Quotation" con bottoni **Confirmed** + **Canceled** + **Edit**, e una tab "Canceled". È qui che oggi si gestisce tutto il flusso quotazione, **duplicato** rispetto a Quotations.

## Modifiche

### 1. `src/pages/Quotations.tsx` — diventa il proprietario del flusso

- Aggiungere terzo tab **"Canceled"** accanto a Pending / Approved.
- Su ogni riga **Pending**, aggiungere:
  - bottone **"Mark as Approved"** (esistente) → invoca `approve-quotation`.
  - bottone **"Cancel"** (rosso) → apre piccolo dialog con textarea opzionale "Reason for cancellation", poi invoca nuova edge function `cancel-quotation` (vedi §3) che setta `status='canceled'`, `quotation_canceled_at`, `quotation_canceled_by`, `quotation_cancel_reason`.
- Filtro liste:
  - Pending: `status = 'quotation'`
  - Approved: `status NOT IN ('quotation','canceled')` (come oggi)
  - Canceled: `status = 'canceled'` — mostra colonne Project / Client / Region / Total Fees / Canceled date / Reason (read-only, nessuna azione, solo "Details").
- Nota: già esiste `wizardOpen` + `NewQuotationWizard` per creare nuove quotazioni → lasciato com'è.

### 2. `src/pages/Projects.tsx` (Operations) — pulizia ruoli

- **Rimuovere** la status-tab **"Quotation"** dalla `TabsList` (riga 549-551) e dai counters.
- **Rimuovere** la status-tab **"Canceled"** dalla `TabsList` (riga 564-566) e dai counters.
- **Rimuovere** dal `baseFiltered`/render i progetti con `setup_status IN ('quotation','canceled')` (anche dal tab "All" Operations non li deve vedere — sono di pertinenza Quotations).
- Nel render azioni riga (riga 811-845): eliminare interamente il ramo `isQuotation` (bottoni Confirmed / Canceled / Edit-quotation) e il ramo `isCanceled` (Delete Permanently). Restano solo Details + Edit per i progetti attivi.
- Rimuovere `handleCancel`, `openConfirm`, `hardDeleteProject` e relativo `AlertDialog` (non più necessari qui).
- Rimuovere import `NewQuotationWizard` + stato `wizardOpen` + bottone "New" + il componente montato (la creazione di quotazioni avviene SOLO in Quotations).
- L'azione **"Assign PM"** è già coperta dal flusso esistente: i progetti `da_configurare` vengono editati con `openEdit` → `ProjectFormModal` che assegna il PM. Niente da aggiungere lato UI, ma rinominare il bottone "Edit" in **"Assign PM"** per le righe con `setup_status='da_configurare'` e `pm_id` nullo, per chiarezza. (Il modal esistente già gestisce assegnazione PM e campi correlati.)

### 3. Database + edge function

Migration:
```sql
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS quotation_canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS quotation_canceled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS quotation_cancel_reason text;
```

Nuova edge function `supabase/functions/cancel-quotation/index.ts`:
- Auth: solo ADMIN (stesso pattern di `approve-quotation`).
- Input: `{ certification_id: string, reason?: string }`.
- Effetto: `status='canceled'`, `quotation_canceled_at=now()`, `quotation_canceled_by=user`, `quotation_cancel_reason=reason`.
- Nessun `task_alert` emesso (l'opposto di approve).

### 4. `useAdminPlannerData` / contatori Operations

Verificare/aggiornare il fetch in modo che la lista "Operations" filtri di default `status NOT IN ('quotation','canceled')`, così:
- KPI / Timeline / Forecast Operations non considerano più quotazioni e cancellate.
- Quotations.tsx continua a vedere tutto (usa già una propria query separata).

## Risultato

- **Quotations**: unico posto dove si crea, approva o cancella una quotazione; 3 tab Pending / Approved / Canceled con storico + reason.
- **Operations**: vede solo progetti con quotazione approvata, può solo assegnare PM e gestire ciclo operativo. Nessun bottone Cancel, nessun tab Quotation/Canceled.
