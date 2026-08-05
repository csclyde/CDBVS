# CDBVS implementation plan

## Status

The first working editor baseline is in place. The repository now contains a desktop VS Code extension with a custom `.cdb` editor, a spreadsheet-style webview, schema-aware primitive/reference controls, row/column/sheet editing, quick search, per-column filtering and sorting, and a raw JSON fallback. The reusable CastleDB Haxe `cdb` sources from `Cursemark\.haxelib\castle\git` are vendored under `vendor/castledb/cdb`, while the legacy level-editor sources are intentionally excluded.

## Completed

- Created the VS Code extension manifest and `.cdb` language registration.
- Added a `CustomTextEditorProvider` named `cdb.editor` for desktop VS Code.
- Added commands to open, validate, and format `.cdb` documents.
- Added a `.vscode/launch.json` configuration for starting an Extension Development Host with `F5`.
- Ported the CastleDB type-string conventions and basic validation into `src/cdbParser.js`, based on the original `cdb/Parser.hx` and `cdb/Data.hx` sources.
- Added a spreadsheet webview with visible-sheet tabs, search/filtering, schema-aware booleans/enums/references/numbers, generic JSON-backed complex values, and automatic workspace edits.
- Added raw JSON editing for recovery and for CastleDB constructs not yet represented by a specialized control.
- Added the `cdbvs.showHiddenSheets` setting for optionally exposing CastleDB internal/sub-sheets.
- Added expandable, schema-driven list cells using CastleDB's `parentSheet@listColumn` sub-sheet definitions, including nested lists, add/delete list items, and primitive/reference editors inside list rows.
- List cells now show only the first item's truncated field preview with compact expand/collapse arrows; nested values are summarized as `[...]`, toggling updates only that cell, and document refreshes restore the table's horizontal/vertical scroll position.
- Text (`TString`) fields open a larger multiline modal editor on double-click, with Save/Cancel controls and Ctrl/Cmd+Enter save support.
- Column headers now include a pencil editor for names, type strings, optional/display/kind/scope/documentation settings, advanced JSON properties, and deletion.
- Sheet tabs now include a pencil editor for sheet metadata and advanced properties, with in-modal deletion of a sheet and its sub-sheets; sheet renames update sub-sheet names and direct reference type strings.
- Added row insertion/deletion from the sheet controls, with row ordering handled as a sheet-level non-destructive sort view rather than per-row controls. Separator metadata remains preserved by the model for raw/data edits.
- Replaced row-level delete `x` controls with row-number selection, whole-row highlighting, Insert/Delete Row toolbar actions, and matching selection controls for expanded list items.
- Made row selection immediate through local DOM updates and raised the selected sticky row-number/primary-ID layers so scrolled content cannot show through them.
- Added an opaque editor-background layer beneath the selected-state color for pinned cells, covering themes whose selection color is translucent.
- Added Ctrl/Cmd+Up and Ctrl/Cmd+Down keyboard movement for the selected main-sheet row, preserving separator metadata and selection.
- Added selected-row clipboard shortcuts: Ctrl/Cmd+C copies, Ctrl/Cmd+X cuts, and Ctrl/Cmd+V inserts a cloned row below the current selection, with a tagged system-clipboard fallback.
- Kept separator indexes fixed during row reordering so moving across a section boundary places the separator on the appropriate side of the moved row instead of carrying it along.
- Added column and sheet move-left/move-right actions in their edit modals.
- Added schema-driven `TProperties` expansion, a JSON custom-type editor with reference validation, checkbox-based `TFlags`, and a color picker for `TColor`.
- Added quick row search plus a type-aware filter/sort modal covering every column, with non-destructive sorting and a clear-all view reset.
- Refactored the webview from one large script into focused runtime, DOM, model, actions, cell, modal, view, and bootstrap modules loaded in dependency order.
- Moved the sheet tabs into a sticky bottom dock while keeping the active sheet's search/filter/sort bar at the top.
- Added a synchronized horizontal scrollbar dock directly above the sheet tabs for wide sheets, hiding the table's internal horizontal scrollbar.
- Hardened the horizontal-scroll dock sizing and visible scrollbar styling, with an intrinsic-width table and native-scroll fallback.
- Fixed the modular filter modal Apply path and added a visible summary of the active sheet search, filters, and sorting beneath the view controls.
- Aligned the sheet search box with the view buttons and added an embedded X button that clears only the search query.
- Replaced the global view reset with individually removable search, filter, and sort pills; removed the confusing per-row insert/separator icons.
- Separated filtering and sorting controls: the toolbar now opens a filter-only modal, while each column header cycles neutral/descending/ascending sorting with a compact icon.
- Simplified main and nested headers to show only their intended controls and names, removing inline type/optional metadata.
- Restored visible separator section rows in the table, using separator object titles or `props.separatorTitles` when available.
- Kept separator titles sticky at the left edge so section names remain visible during horizontal table scrolling.
- Extended the separator's blue top rule across the full-width separator row while retaining the sticky section title.
- Strengthened active-state styling for selected sheets, active modes, applied view pills, sorting, search, and expanded nested cells.
- Changed the main table to content-based auto sizing so columns shrink to their titles/data where possible instead of expanding evenly.
- Balanced the compact sizing so text fields have usable minimum widths and editable controls fill their columns while numeric/list/nested cells remain narrow.
- Added explicit primary-ID controls to column and sheet editors, enforcing CastleDB's single `typeStr: "0"` ID column.
- Pinned each sheet's primary-ID column beside the row numbers with a sticky scrolling boundary, keeping it visible during horizontal table scrolling.
- Fixed column move-left, move-right, and delete actions to redraw immediately after their structural document updates.
- Replaced the column type-string text control with a named type dropdown and contextual type-argument/raw fallback fields while preserving CastleDB type-string serialization.
- Raised the main and sheet-view toolbars into opaque stacking layers above selected sticky ID cells so top row controls remain visible and clickable.
- Restored plain Insert/Delete keyboard shortcuts for row operations and made the Delete Row control report when no row is selected instead of appearing inert.
- Removed the unreliable native confirmation gate from selected-row deletion so the Delete Row button and Delete key complete the edit in the VS Code webview; document undo remains available.
- Made main-table cells and expanded list-item cells select their row on click, sharing the existing row-number selection behavior.
- Added separate main-cell selection with visible highlighting, arrow-key navigation across visible rows/columns, row-number row-only selection, and cell-aware copy/cut/paste with row clipboard fallback.
- Commits the active cell editor before keyboard navigation or clipboard actions so pending text/input changes are not lost.
- Made the Delete key clear only the selected cell while preserving row deletion when no cell is selected; the explicit Delete Row toolbar button remains row-level.
- Removed the top Delete Row button and added right-click context menus: row numbers expose insert/delete/move/copy/cut/paste row actions, while cells expose copy/cut/paste/clear cell actions.
- Added a reusable cell-error registry/API plus automatic duplicate-primary-ID validation that marks only later duplicate cells with an error badge, tooltip, and accessible invalid state; cell edits refresh validation immediately.
- Constrained the webview to the viewport and clipped the content flex area so the dedicated horizontal scrollbar stays directly above the bottom sheet tabs instead of following the table's vertical content.
- Fixed column-modal deletion by removing the unreliable native confirmation gate; deleting a column now removes its schema entry and row values, updates view metadata, and remains undoable through VS Code.
- Added a column-header right-click menu with Move column left, Move column right, and Delete column actions, including boundary disabling for the move actions.
- Added an Add column context-menu action that opens the full column editor; new columns are inserted only after Save and can be discarded without changing the sheet.
- Removed the top Insert Row button; row insertion remains available from the row context menu and Insert keyboard shortcut.
- Added per-section collapse/expand arrows to separator headers; collapsing hides rows until the next separator while preserving collapse state across row insertions and deletions.
- Added Add Separator to the row context menu above the clicked row, plus double-click inline editing for separator names with Enter/blur save and Escape cancel behavior.
- Added a separator-row right-click menu with Remove Separator, cleaning up aligned separator-title metadata and collapse state.
- Copied the reusable `cdb` Haxe model/parser sources and original license/readme into `vendor/castledb`.
- Added `test/fixtures/sample.cdb` from the original repository for manual editor smoke testing.
- Saved project scope, reuse guidance, and validation expectations in `agents.md`.

## Next steps / unfinished pieces

These are intentionally still open for the next milestone:

1. Add automated tests for parsing, type-string handling, defaults, duplicate IDs, formatting, and webview update serialization.
2. Improve schema editing with a dedicated type picker, required/optional conversion rules, and safer type conversions when a column's type changes.
3. Add richer controls for remaining CastleDB values: tile positions, gradients, curves, dynamic values, and file/image pickers.
4. Add reference validation and useful navigation from a reference cell to the target sheet/row.
5. Match CastleDB separator/group behavior from the Haxe model, including separator titles, group materialization, and preserving separator metadata safely.
6. Add VS Code integration tests and package the extension as a `.vsix` once the local Node/npm or VS Code extension test tooling is available.
7. Consider compiling or generating a shared JavaScript CastleDB core from the vendored Haxe model if the direct JavaScript port begins to diverge from CastleDB compatibility.
8. Evaluate the legacy localization export and image-cleanup utilities for VS Code commands; the legacy open/recent/save-as/exit menus are intentionally replaced by VS Code's document and workspace lifecycle.

## Verification notes

- The environment has Haxe available, but no project dependencies or Node/npm executable were available during the initial pass, so a full extension host launch and `.vsix` packaging check remain outstanding.
- `package.json`, `language-configuration.json`, and the sample `.cdb` fixture all pass the available PowerShell JSON parse check. The vendored `cdb` sources match the source repository by SHA-256, and no level-editor files were copied.
- The sample fixture contains three list columns with matching sub-sheet schemas, including the nested `monsters@skills@sub` list schema used to verify recursive expansion paths.
- The search/filter/sort pass passed PowerShell JSON and feature-presence checks. A full JavaScript syntax check and extension-host smoke test remain unavailable because Node/npm are not installed in this environment.
- The refactor passed PowerShell module-existence, script-load-order, bootstrap-size, and JSON checks; Node/npm remain unavailable for a full JavaScript parser or VS Code extension-host test.
- Keep the extension desktop-only and do not bring over the source repository's `src/lvl` or `Level.hx` level editor.
