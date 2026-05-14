## Quotation Value per certificazione

Trasformo l'intera sezione **Quotation Details / Quotation Value** dello step 2 in una serie di pannelli, **uno per ogni certificazione selezionata** (LEED, WELL, BREEAM, ESG, GRESB, Energy_Audit). Ogni pannello è indipendente: ha i suoi Services Fees, GBCI Fees, Quotation Value (Direct o Builder) e flag IAQ/Energy/Water specifiche per quella cert.

### UX

- Sezione globale "Quotation Details" mantiene **solo i campi davvero comuni**: Area (sqm), Quotation sent date, Notes, Payment scheme.
- Per ogni cert spuntata appare una card dedicata con header `LEED`, `WELL`, ecc., contenente:
  - Services Fees (€)
  - GBCI Fees (€)
  - Toggle **Direct Input / FTE & Budget Builder**
  - Total Fees (Direct) **oppure** `QuotationBudgetBuilder` (collegato alle flag IAQ/Energy di quella stessa cert).
- Il pulsante **"Use this value"** del Builder popola il Total Fees + GBCI Fees **solo della propria cert**.
- Validazione step 2: ogni cert deve avere `total_fees > 0` (Direct) o un Builder applicato.

### Persistenza

In `handleSave`, il loop `for (const cert of services.certifications)` ora usa i campi per-cert:
- `services_fees`, `gbci_fees`, `total_fees`, `allocated_hours` presi dallo state della cert corrente.
- Snapshot in `quotation_budget_history` solo per le cert in modalità Builder applicata.

### File toccati

- **`src/components/projects/NewQuotationWizard.tsx`** — refactor mirato:
  - `CertConfig` esteso con `services_fees`, `gbci_fees`, `total_fees`, `quote_mode: "direct"|"builder"`, `builder: BudgetBuilderState`, `builder_applied: boolean`.
  - Rimossi i campi globali `servicesFees / gbciFees / totalFees / quoteMode / builder / builderApplied` da `ServicesState`.
  - Nuovo helper `renderQuotationPanelForCert(cert)`; lo step 2 cicla sulle cert e renderizza un pannello ciascuno.
  - `handleSave` letture per-cert.
  - Step 3 (Review) mostra un mini-summary per cert.

### Fuori scope

- Schema DB (già pronto: `total_fees`, `allocated_hours`, `quotation_budget_history` sono già per-cert).
- Logica del Builder (`QuotationBudgetBuilder`, `quotationBudget.ts`, `useHardwarePricing.ts`) — riusati identici, una istanza per cert.
- Prezzo ClAir: confermato funzionante, niente modifiche.
