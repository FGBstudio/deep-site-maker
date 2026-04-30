# Fix modulo "Assign to Site"

## Il problema

Nel dialog **Project Assignment** (`AssignToSiteDialog.tsx`) la logica di calcolo degli slot da assegnare è sbagliata. Confonde due concetti diversi:

- **Richiesta** = quanti dispositivi servono al sito (decisa da PM o CT Builder).
- **Assegnazione fisica** = un hardware reale, con `device_id` e `mac_address`, viene linkato al sito (status → `Assigned`, `site_id` → quel sito).

Oggi entrambi i concetti vivono nella stessa colonna `project_allocations.quantity`:
- Quando un PM crea il progetto, viene scritto `quantity = requested_quantity` (vedi `ProjectFormModal`, `PMProjectConfigModal`, `DataImporter`).
- Risultato: il dialog calcola `remaining = requested - quantity = 0` e mostra il messaggio *"All requested air devices are already assigned"* anche se in realtà **nessun hardware fisico è mai stato collegato al sito**.

Si vede chiaramente nello screenshot: 4× WELL CIAir + 1× CO2 + 1× LEED richiesti per "Casa FGB", ma nessuno slot di assegnazione disponibile e nessun pulsante per scegliere un device dallo stock.

## Cosa cambia

Calcoliamo l'assegnazione fisica **dalla tabella `hardwares`**, non da `project_allocations.quantity`. La fonte di verità per "questo device è sul sito X" è la riga in `hardwares` con `site_id = X` e `status = 'Assigned'`.

### 1. `AssignToSiteDialog.tsx` — riscrittura della logica slot

- Caricare anche gli hardware già assegnati al sito selezionato:
  ```ts
  supabase.from("hardwares")
    .select("id, device_id, mac_address, product_id, hardware_type, status")
    .eq("site_id", selectedCert.site_id)
    .eq("status", "Assigned")
  ```
- Per ogni allocation della modalità corrente (AIR/ENERGY):
  - `requested = allocation.requested_quantity ?? allocation.quantity`
  - `physicallyAssigned = count(hardwares assigned to site con product_id matching)`
  - `remaining = max(requested - physicallyAssigned, 0)`
- Mostrare in cima un riepilogo a 3 colonne per ogni prodotto richiesto:
  *Requested · Already on site · To assign now*.
- Generare uno slot per ciascun pezzo `remaining`: dropdown "Pick available device" che attinge dallo stock (`status = 'In Stock'`) filtrabile per `hardware_type`. Il PM/admin sceglie il **device fisico** (serial + MAC).
- Mostrare anche, in sola lettura, la lista dei device già fisicamente sul sito (con device_id/MAC) così l'admin vede cosa c'è già.

### 2. Submit: non toccare più `project_allocations.quantity`

Oggi alla conferma il dialog fa `quantity = quantity + count` su `project_allocations`. Questo va rimosso: la quantità "richiesta" non deve cambiare quando assegniamo fisicamente. L'unica scrittura necessaria è:

- `hardwares` → set `site_id`, `status = 'Assigned'`, e (per i bridge in modalità Energy) i campi network.
- `project_allocations.status`: aggiornarlo dinamicamente:
  - se `physicallyAssigned >= requested` → `Allocated` (fulfilled)
  - se `physicallyAssigned > 0` ma `< requested` → `Partially Allocated`
  - altrimenti resta `Requested` / `Draft`.
- `site_energy_records` (solo Energy): ricalcolare i contatori `total_sensors`, `no_pan10/12/14`, `total_bridges` dai device **realmente** sul sito (query su `hardwares` con join `products`), non da incrementi locali.

### 3. Copy / UX

- Banner blu sostituito con tre stati possibili:
  - **Tutto da assegnare**: *"PM ha richiesto X dispositivi. Seleziona dallo stock i device fisici da inviare al sito."*
  - **Parzialmente assegnato**: *"Y di X dispositivi già installati. Restano Z da assegnare."*
  - **Completato**: *"Tutti i X dispositivi richiesti sono fisicamente sul sito."* (in questo caso mostriamo solo la lista read-only dei device assegnati, niente slot vuoti).
- Pulsante "Confirm Allocation" → "Assign Devices to Site".

## File toccati

- `src/components/hardwares/AssignToSiteDialog.tsx` — logica e UI rifatte.
- (Opzionale, nessuna modifica DB) Nessuna migrazione richiesta: la tabella `hardwares` ha già tutto. Volutamente **non** modifichiamo gli inserimenti PM in `ProjectFormModal`/`PMProjectConfigModal`/`DataImporter` per non rompere altre parti che leggono `quantity` come "richiesto".

## Dettagli tecnici

```text
allocations (richiesta)          hardwares (stato fisico)
────────────────────             ────────────────────────
requested_quantity = 4    ◄──►   COUNT(hardwares WHERE
quantity (legacy)                  site_id = cert.site_id
                                   AND product_id = X
                                   AND status='Assigned')
```

`remaining_slots = requested_quantity − physical_count`. Quando `remaining = 0`, lo slot non viene generato (riga read-only "completato"). Quando `> 0`, generiamo N dropdown sullo stock disponibile.
