## Goal

Sostituire i due widget Recharts attualmente illeggibili ("Project Status" donut e "Late Projects (days)" barre) con due card minimal in stile Apple iOS, scegliendo la direzione **v2 — Apple minimalista palette iOS**.

## Cosa cambia

### Project Status (donut)
- Donut SVG custom (no Recharts) con 4 archi colorati: Late (rosso iOS), Certified (verde iOS), In Progress (blu iOS), To Configure (grigio chiaro).
- Numero totale grande al centro + label "TOTAL".
- Legenda strutturata a destra: per ogni stato, pallino colorato + label + conteggio numerico allineato a destra.
- Tipografia: titolo uppercase tracking-wider colore muted, valori in font-semibold.

### Late Projects (days)
- Sostituisce il BarChart orizzontale con una lista verticale di righe (Top 5).
- Ogni riga: nome progetto a sinistra + "N days" a destra, barra di progresso sotto piena/rounded.
- Colore barra **rosso** per i top 2 progetti più in ritardo (critici), **grigio** per gli altri (meno critici), così la priorità è leggibile a colpo d'occhio.
- Larghezza barra proporzionale al massimo della serie.

### Stile card (entrambe)
- `rounded-3xl`, padding generoso (`p-6`/`p-8`), bordo soft, shadow leggera.
- Header: titolo `text-xs uppercase tracking-wider text-muted-foreground`.
- Usa token semantici del design system (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) invece dei colori hex hardcoded. I 4 colori di stato vengono mappati su token: `destructive`, `success`, `primary`, `muted`.

## Dettagli tecnici

- File toccato: `src/pages/PMPortal.tsx` (solo i due `Card` dei widget Project Status e Late Projects nel grid `md:grid-cols-3`; il widget Financial Alerts resta invariato).
- Rimuovo gli import non più usati: `PieChart`, `Pie`, `Label`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `statusChartConfig`, `lateChartConfig`.
- I dati `statusData`/`lateData` esistenti vengono riutilizzati senza modifiche alla logica di calcolo (`useMemo` rimane).
- Nessuna modifica a hook, query, schema o business logic — è una sostituzione puramente di presentazione.
- Colori di stato definiti come array `STATUS_COLORS` mappati ai token: `Late→destructive`, `Certified→success`, `In Progress→primary`, `To Configure→muted-foreground`.

## Out of scope

- Nessuna modifica alle altre card KPI o al widget Financial Alerts.
- Nessuna modifica al CEO Dashboard (anche se ha widget analoghi).
