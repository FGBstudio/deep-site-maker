
## Goal

Aggiungere uno stato intermedio tra Quotations e Operations. Quando l'utente clicca "Mark as Approved" in Quotations, il progetto NON va più direttamente in "To Configure", ma entra in una nuova sezione "Quotations Approved" dentro Operations, dove l'utente Operations può solo assegnare il PM (con i campi correlati). Solo dopo l'assegnazione del PM il progetto passa in "To Configure" e prosegue il flusso normale.

## Cambi funzionali

```text
Quotations (Pending)
   └─ Mark as Approved ──► Operations / "Quotations Approved" (NEW tab)
                              └─ Assign to PM (+ PO date, allocated hours, coord.)
                                    └─► Operations / "To Configure"
                                          └─ PM configura timeline → "In Progress" → ...
```

- Nuovo valore di stato `quotation_approved` sulla certification.
- Operations non vede più la propria "Quotations" interna (già rimossa): adesso vede invece "Quotations Approved" come tab subito dopo "All".

## Modifiche tecniche

1. **Edge function `approve-quotation`**  
   - Cambia il target status da `da_configurare` → `quotation_approved`.  
   - Mantiene gli alert `quotation_to_operations` (Assign PM) e `quotation_to_payments`.

2. **`src/hooks/useAdminPlannerData.ts`**  
   - Aggiunge `quotation_approved` all'early-exit (come `quotation`/`canceled`) così non viene riclassificato in `da_configurare`. `setup_status` resta `quotation_approved`.

3. **`src/pages/Projects.tsx`**  
   - Aggiunge `quotation_approved` a `SETUP_STATUS_META` (label "Quotation Approved", icona `FileText`, stile verde tenue).  
   - In `baseFiltered`: rimuove `quotation_approved` dall'esclusione (resta esclusi solo `quotation` e `canceled`).  
   - Aggiunge tab `quotation_approved` nella `TabsList`, subito dopo "All": "Quotations Approved (N)".  
   - `operationsTotal` include `counts.quotation_approved`.  
   - Per le righe con `setup_status === 'quotation_approved'`, il pulsante diventa **"Assign to PM"** e apre `ProjectFormModal` in modalità `confirm_project` (stesso modulo già usato in passato per assegnare PM + PO date + allocated hours + coordinate sito).

4. **`src/components/projects/ProjectFormModal.tsx`** (mode `confirm_project`)  
   - Quando il progetto di partenza è `quotation_approved`, il salvataggio aggiorna `pm_id`, `po_sign_date`, `allocated_hours`, coord. sito **e** imposta `status = 'da_configurare'` (non più `in_progress`), così la derivazione di `useAdminPlannerData` lo porta nella tab "To Configure".

5. **Quotations page**  
   - Nessuna modifica al pulsante "Mark as Approved": continua a invocare l'edge function `approve-quotation`. La tab "Approved" qui resta come storico (filtro `status !== 'quotation' && status !== 'canceled'`, che continua a coprire `quotation_approved` e tutti gli stati successivi).

## File toccati

- `supabase/functions/approve-quotation/index.ts`
- `src/hooks/useAdminPlannerData.ts`
- `src/pages/Projects.tsx`
- `src/components/projects/ProjectFormModal.tsx`

Nessuna migration: `certifications.status` è una text column libera, basta usare il nuovo valore stringa.
