Ho verificato due cose importanti:

- L’app in preview sta ancora generando l’errore da Edge Function, quindi sta eseguendo un bundle/flusso vecchio o una chiamata non più allineata.
- Il backend Lovable Cloud risponde, ma la connessione dati effettiva usata dalla pagina Quotations è un altro database dove esistono `certifications` e i dati reali. Per questo non va cambiata alla cieca la connessione principale, altrimenti spariscono i dati.

Piano di intervento:

1. Bloccare la connessione dati corretta
   - Non cambio URL/key del client principale senza necessità.
   - Mantengo la pagina Quotations sulla stessa connessione che sta leggendo i 13 pending / 322 approved / 6 canceled.
   - Verifico che il codice compilato non usi più `approve-quotation` per il bottone `Mark as Approved`.

2. Rimuovere definitivamente la dipendenza dall’Edge Function per questo flusso
   - In `src/pages/Quotations.tsx`, il click su `Mark as Approved` deve fare solo un update diretto su `certifications`:
     - `status = 'quotation_approved'`
     - `quotation_approved_at = now`
     - `quotation_approved_by = user.id` se disponibile
   - Nessuna chiamata a `supabase.functions.invoke('approve-quotation')` deve rimanere nel flusso Quotations.

3. Rendere l’update verificabile e non “silenzioso”
   - Dopo l’update, ritorno la riga aggiornata con `.select('id, status, quotation_approved_at').single()`.
   - Se il database blocca la scrittura per policy/RLS o colonne mancanti, mostro l’errore reale del database, non il vecchio errore generico Edge Function.
   - Se nessuna riga viene aggiornata, mostro un errore chiaro invece di far sembrare approvato qualcosa che non è stato salvato.

4. Popolare Operations > Quotations Approved dalla stessa fonte dati
   - La tab `Quotations Approved` deve leggere solo progetti con `certifications.status = 'quotation_approved'`.
   - Il conteggio e la lista devono aggiornarsi dopo l’approvazione invalidando le query già usate da Quotations e Operations.

5. Ripulire il codice fragile introdotto nel flusso
   - Tolgo eventuali cast inutili tipo `as any` nel payload di approvazione, usando un tipo locale compatibile.
   - Non tocco `src/integrations/supabase/client.ts`, `.env`, auth o altre connessioni finché il flusso Quotations non è stabile.

6. Verifica finale
   - Controllo che nel codice non ci siano più riferimenti a `approve-quotation` nella pagina Quotations.
   - Verifico che il bottone produca una richiesta REST di update su `certifications`, non una richiesta Edge Function.
   - Verifico che, dopo approvazione, la quotazione sparisca da Pending e compaia in Operations > Quotations Approved.