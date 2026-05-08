## Issues from screenshot

1. **No visible edit icon on rows** — currently cells are editable but the only hint is hover ring + helper text "Click any cell to edit". Users don't perceive the row as editable.
2. **"Upcoming" status badge overlaps the city line** in the Project column — the sticky Project cell shows `Project name` + `City, Country` underneath, and the Status cell next to it renders the badge that visually drifts over the city text (the status column is too narrow, status is in its own column but the absolutely-positioned save indicators + low z-index of the Project cell let the badge bleed).

## Plan

### 1. Visible per-row edit affordance
- Add a small **leading "row handle" cell** at the very start of each row (before the sticky Project cell) containing a `Pencil` icon button (ghost, `h-6 w-6`, muted color).
- The icon is always rendered but only fully visible on `group-hover` (opacity 40 → 100) so the table stays clean at rest.
- Clicking it opens the **first editable cell of that row** (Status) in edit mode — implemented by lifting an `editingRowId` state into `EnergyTable` and passing it down so the row can auto-focus its first `EditCell`.
- Keep the existing click-to-edit on individual cells (no regression).
- Update the helper text under the filters to: *"Click the pencil to edit a row, or click any cell directly."*

### 2. Visible cell edit affordance
- Inside `EditCell` (idle state), render a tiny `Pencil` icon at the top-right of the cell, `opacity-0 group-hover/cell:opacity-60`. Wrap the `<td>` with `group/cell` so each cell gets its own hover indicator independent of row hover.
- Keeps the spreadsheet feel but makes editability discoverable.

### 3. Fix "Upcoming" overlap
- Root cause: the Project sticky `<td>` and the Status `<td>` share the same row but the status badge wraps under the Project cell because of negative spacing/whitespace. Fix by:
  - Giving the Project sticky cell a fixed `min-w-[200px] max-w-[240px]` and `truncate` on long names.
  - Ensuring the Status `<td>` has `min-w-[110px]` so the pill always fits without flex collapse.
  - Removing the absolutely-positioned `Loader2` / `Check` save markers from inside the cell flow when the cell holds a badge — render them as a small dot in the corner with `pointer-events-none` so they don't shift the badge.

### 4. Small polish
- Increase the sticky Project column z-index over the group-header row so the Site Info banner doesn't show through.
- Add `bg-clip-padding` to sticky cells to prevent the border from leaking transparency.

## Files touched
- `src/pages/Monitor.tsx` — add row handle column, lift `editingRowId` state, add hover pencil to `EditCell`, fix widths on Project/Status cells.

No backend, no schema, no data-hook changes.
