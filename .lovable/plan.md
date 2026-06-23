# HR Section — Availability, Leave Requests, QR Attendance

Attivo la sezione HR (oggi `comingSoon`) e implemento 3 moduli + lo scanner integrato dal progetto `entry-watcher`.

## 1. Database (1 migration)

**Tabelle nuove:**

- `hr_availability` — riga per utente/giorno
  - `user_id uuid`, `date date`, `status` (`available` | `busy` | `off` | `travel` | `remote`), `note text`, `hours_planned numeric`
  - UNIQUE(user_id, date)
- `hr_requests`
  - `user_id`, `type` (`holiday` | `permit` | `travel`), `start_date`, `end_date`, `start_time`, `end_time`, `reason text`, `status` (`pending` | `approved` | `rejected`), `manager_note text`, `approved_by uuid`, `approved_at`
- `hr_attendance`
  - `user_id`, `timestamp_in timestamptz`, `timestamp_out timestamptz`, `location_lat`, `location_lng`, `status` (`auto_qr` | `manual_override`), `approved_by uuid`, `device_label text`, `note text`
- `hr_qr_tokens` — token QR personali per utente (per scanner)
  - `user_id`, `token text unique`, `active bool`, `rotated_at`

**GRANT + RLS** (uso `is_admin(auth.uid())` già presente):

- `hr_availability`: SELECT a tutti gli `authenticated` (vista d'insieme). INSERT/UPDATE/DELETE solo su `user_id = auth.uid()`; Admin tutto.
- `hr_requests`: SELECT proprie righe + Admin tutto. INSERT proprie. UPDATE: proprie se `status='pending'`; Admin sempre (per approvazione).
- `hr_attendance`: SELECT proprie + Admin tutto. INSERT solo Admin (scanner) o `user_id = auth.uid()` per override richiesto, ma UPDATE/APPROVE solo Admin.
- `hr_qr_tokens`: SELECT proprio token; Admin tutto.

**Trigger:** all'`approved` di un `hr_request` di tipo `holiday`/`permit`, popolare `hr_availability` con `status='off'` per il range.

## 2. Frontend

Nuove route protette (allowedRoles `ADMIN`, `PM`):

```
/hr                        → HR Hub (3 card: Availability, Requests, Attendance)
/hr/availability           → Calendario condiviso
/hr/requests               → Le mie richieste + (Admin) coda approvazione
/hr/attendance             → Registro presenze (Admin: pulsante "Apri Scanner")
/hr/scanner                → Solo Admin: QR scanner fullscreen
```

**Update `hubSections.ts`:** `hr.comingSoon = false`, e aggiungo `HR_SECTION_PATHS` con le route sopra, analogo a `PROJECTS_SECTION_PATHS`.

### Availability (`/hr/availability`)
- Griglia mensile orizzontale: righe = utenti (da `profiles`), colonne = giorni del mese corrente (navigazione mese precedente/successivo).
- Cella colorata per `status`; tooltip con `note`.
- Click su cella: editabile **solo** se `row.user_id === auth.uid()` o utente è Admin. Popover con select status + note + hours.
- Admin ha badge "Manager mode" e può editare qualsiasi riga.
- Realtime opzionale via Supabase channel su `hr_availability`.

### Requests (`/hr/requests`)
- Tab "Le mie richieste" (lista + form "Nuova richiesta": tipo, date range, motivo).
- Tab "Da approvare" (visibile solo ad Admin): lista `pending`, bottoni Approve/Reject con `manager_note`.
- Stato → toast + invalidate query. Admin può anche creare richieste proprie.

### Attendance (`/hr/attendance`)
- Tabella registro con filtro per utente/giorno.
- Admin vede tutti; PM vede solo se stesso.
- Admin: bottone "Apri Scanner" che porta a `/hr/scanner`.
- Permette di marcare `manual_override` con approvazione Admin.

### Scanner (`/hr/scanner`, solo Admin)
- Porto i componenti chiave da `entry-watcher`: `QRScanner.tsx` (libreria già presente o `html5-qrcode`/`@zxing/browser`), adattato per:
  - Leggere token QR → lookup `hr_qr_tokens.token` → ottenere `user_id`.
  - Determinare se è check-in o check-out (ultimo record aperto dell'utente nello stesso giorno).
  - `INSERT`/`UPDATE` su `hr_attendance` con `status='auto_qr'`, geolocation opzionale (`navigator.geolocation`).
  - Feedback visivo: nome utente + IN/OUT + timestamp.
- Stampa QR per ciascun utente (Admin): pulsante "Genera/Rigenera QR" nella tabella utenti, mostra QR (libreria `qrcode`).

**Dipendenze nuove:** `@zxing/browser` (scanner) + `qrcode` (generazione). Tutto client-side.

## 3. Hooks/Files

```
src/hooks/useHrAvailability.ts
src/hooks/useHrRequests.ts
src/hooks/useHrAttendance.ts
src/hooks/useHrQrTokens.ts
src/pages/HrHub.tsx
src/pages/hr/Availability.tsx
src/pages/hr/Requests.tsx
src/pages/hr/Attendance.tsx
src/pages/hr/Scanner.tsx
src/components/hr/AvailabilityCell.tsx
src/components/hr/RequestForm.tsx
src/components/hr/ApprovalQueue.tsx
src/components/hr/QrScannerView.tsx
src/components/hr/UserQrDialog.tsx
```

Update:
- `src/lib/hubSections.ts` (attivo hr, aggiungo `HR_SECTION_PATHS`).
- `src/App.tsx` (5 nuove route con `<ProtectedRoute allowedRoles={["ADMIN","PM"]}>`; `/hr/scanner` solo `["ADMIN"]`).

## Note

- UI in inglese, design Apple/glassmorphism coerente col resto.
- Date con `date-fns`.
- Niente `as any`, tipi in `src/types/custom-tables.ts`.
- Lo scanner del progetto allegato gira in locale standalone; qui ne riuso solo la **logica QR**, salvando i timbri direttamente in Supabase (no `database.json`, no server Node separato).
