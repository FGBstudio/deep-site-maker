## Audit della specifica vs codice attuale

Ho controllato tutti i punti della specifica. **Quasi tutto è già implementato**. Riepilogo:

### ✅ Già implementato
| Punto spec | Stato | File |
|---|---|---|
| Rename Projects→Operations (admin) / Projects (PM) in Home | ✅ | `src/lib/hubSections.ts` (`getSectionDisplayName`), `src/pages/Home.tsx` |
| Rename Invoice→Payments (Home, Sidebar, InvoicePage) | ✅ | `hubSections.ts`, `AppSidebar.tsx`, `InvoicePage.tsx` |
| Voce "Operations" / "Payments" / "Quotations" in Sidebar | ✅ | `src/components/layout/AppSidebar.tsx` |
| Nuova PittoCard "Quotations" colore `#a0d5d6`, route `/quotations` | ✅ | `hubSections.ts` |
| Route `/quotations` protetta (ADMIN) | ✅ | `src/App.tsx` |
| RBAC: per ora solo ADMIN accesso totale, PM come prima | ✅ | `ProtectedRoute`, `App.tsx` (costanti `QUOTATIONS_ROLES`/`PAYMENTS_ROLES`/`OPERATIONS_ROLES` predisposte per i futuri sotto-ruoli) |
| Pagina `/quotations` con tab Pending/Approved + wizard | ✅ | `src/pages/Quotations.tsx` |
| Bottone "Mark as Approved" che invoca edge function | ✅ | `src/pages/Quotations.tsx` |
| Edge function `approve-quotation` con inserimento 2 task_alerts (operations + payments handover) | ✅ | `supabase/functions/approve-quotation/index.ts` |
| Tipi alert `quotation_to_operations` / `quotation_to_payments` | ✅ | `src/hooks/useTaskAlerts.ts` |
| Tab "Tasks & Alerts" in Payments | ✅ | `InvoicePage.tsx` + `PaymentsTasksPanel.tsx` |
| Migration `quotation_approved_at` / `quotation_approved_by` | ✅ | `20260626084554_*.sql` |

### ❌ Unica cosa rimasta da pulire
Il file `src/pages/Projects.tsx` ha rimosso il **bottone** "New Quotation" (riga 201 lo commenta), ma lascia ancora montato `<NewQuotationWizard>` con import + `wizardOpen` state inutili (righe 7, 48, 395-399). Codice morto: nessun setter lo apre, ma è meglio rimuoverlo per coerenza con la spec ("rimosso totalmente") e per non confondere chi legge.

## Implementazione (1 file)

**`src/pages/Projects.tsx`** — rimuovere:
- `import { NewQuotationWizard } from "@/components/projects/NewQuotationWizard"` (riga 7)
- `const [wizardOpen, setWizardOpen] = useState(false)` (riga 48) e relativo commento
- blocco `<NewQuotationWizard open={wizardOpen} ... />` (righe 395-399)

Nessuna altra modifica necessaria: la spec è già completata.
