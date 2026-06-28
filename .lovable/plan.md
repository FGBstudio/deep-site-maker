
## Problema

L'errore "Failed to send a request to the Edge Function" succede perché il client Supabase punta al progetto esterno (`vejqfpznzcohtbggkfhr`), dove l'edge function `approve-quotation` non è deployata (vive solo nel backend Lovable Cloud). Quindi la chiamata `supabase.functions.invoke("approve-quotation")` fallisce e nessuna quotation passa allo stato `quotation_approved`, lasciando la tab "Quotations Approved" in Operations vuota.

## Fix

Sostituire l'invocazione dell'edge function in `src/pages/Quotations.tsx` con un update diretto sulla tabella `certifications`, identico a quanto faceva la function ma eseguito lato client (la stessa pagina già usa update diretti per "Cancel"):

```ts
const { error } = await supabase
  .from("certifications")
  .update({
    status: "quotation_approved",
    quotation_approved_at: new Date().toISOString(),
    quotation_approved_by: user?.id ?? null,
  })
  .eq("id", id);
```

- Importare `useAuth` per ricavare `user.id`.
- Mantenere toast di successo/errore, mantenere `invalidateAll()` per rinfrescare la tab Approved di Quotations e la lista di Operations.
- Niente `task_alerts` lato client (la generazione degli alert era a carico della function; per ora viene saltata — può essere reintrodotta in futuro lato DB).

Nessuna altra modifica: la tab "Quotations Approved" di Operations è già configurata per leggere lo stato `quotation_approved`.

## File toccato

- `src/pages/Quotations.tsx`
