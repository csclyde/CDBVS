# CDBVS implementation plan

## Status

The first working editor baseline is in place. The repository now contains a desktop VS Code extension with a custom `.cdb` editor, a spreadsheet-style webview, schema-aware primitive/reference controls, row/column/sheet editing, quick search, per-column filtering and sorting, and a raw JSON fallback. The reusable CastleDB Haxe `cdb` sources from `Cursemark\.haxelib\castle\git` are vendored under `vendor/castledb/cdb`, while the legacy level-editor sources are intentionally excluded. Marketplace release metadata and packaging exclusions are also prepared; publisher registration, authentication, and final VSIX validation remain external steps.

## TypeScript/build and boundary hardening update (2026-08-18)

- Migrated the extension host, CastleDB parser, document adapter, shared protocol, and webview source tree to TypeScript under `src/`.
- Added strict TypeScript checking for the host/domain layer and a repeatable esbuild pipeline that emits `dist/extension.js` and `media/editor.js`; development source maps are generated automatically and production output is cleaned/minified.
- Updated the custom editor HTML to load one bundled webview script with a cryptographically random CSP nonce instead of a dependency-ordered list of individual scripts.
- Added typed host-to-webview and webview-to-host message contracts with runtime guards, validated document data before sending it to the webview, and added protocol regression tests for malformed messages.
- Updated the test harness to transpile TypeScript webview modules in memory while retaining isolated DOM-module coverage.
- Added build/test/package scripts, VS Code build task integration, package-lock metadata, and development instructions in `README.md`.
- Verification completed: `npm run check-types`, `npm test` (63 tests), `npm run package`, and a VSIX packaging check with `vsce`.
- Limitation recorded: the existing DOM modules retain their global/IIFE composition and are marked as a staged TypeScript migration boundary; the new runtime/bootstrap contract and all extension-host/domain code are type-checked strictly. Converting every DOM function to fully strict typed modules is an independent follow-up and was deliberately kept out of this behavior-preserving migration.

## Refactor pass (2026-08-18)

- Split CastleDB type-string/default logic into `cdb/TypeSystem.ts` and structural/custom-type validation into `cdb/Validation.ts`; `cdb/Parser.ts` now owns JSON parsing/serialization and remains the compatibility façade.
- Split the extension host into `host/CdbEditorProvider.ts`, `host/Commands.ts`, `host/WebviewHtml.ts`, and the reusable `host/DocumentUpdateQueue.ts`; the root extension module now only activates the provider and registers commands.
- Extracted webview state construction into `webview/runtime/EditorState.ts`, custom select-menu behavior into `view/EditorViewSelect.ts`, and row/separator mutations into `model/EditorModelRows.ts`.
- Kept the webview's global runtime contract intact while reducing large mixed-responsibility modules and preserving the existing load order through explicit bundle/test entries.
- Added regression coverage for failed queued updates followed by Save. All 64 tests pass after the refactor.

## Centralized concern hierarchy pass (2026-08-18)

- Added `webview/runtime/EditorStateMaps.ts` as the single registry for per-sheet view state, row/cell selection, nested-list selection, and sheet rename/delete cleanup. Sheet lifecycle code now updates those groups through one boundary.
- Added `webview/runtime/EditorMutation.ts` as the application mutation boundary. It centralizes persist-only, render-only, persist-and-render, debounced cell updates, and no-op/failed mutation handling.
- Migrated structural actions, clipboard edits, row/separator mutations, raw JSON application, modal saves, primitive cells, nested list cells, and view controls to the shared mutation lifecycle.
- Added shared modal action construction and reused the common field primitive across column, row, sheet, filter, confirmation, and custom editors.
- Updated selection and view models to obtain state maps through shared initialization helpers rather than creating or repairing maps independently.
- The resulting webview hierarchy is: runtime services/state registry → domain models and mutation services → feature actions/modals/cell editors → leaf DOM renderers and controls. The global `CDBVS` surface remains the compatibility seam while responsibility is centralized behind these layers.
- Verification completed after this pass: `npm.cmd test` (64 tests), `npm.cmd run check-types`, `npm.cmd run package`, and `git diff --check`.

## Completed

- Created the VS Code extension manifest and `.cdb` language registration.
- Added a 256×256 black CDBVS extension icon with transparent rounded corners and connected it through the manifest.
- Updated the icon wordmark so `CDB` is white and `VS` is blue while retaining the transparent corners.
- Added a `CustomTextEditorProvider` named `cdb.editor` for desktop VS Code.
- Added commands to open, validate, and format `.cdb` documents.
- Added a `.vscode/launch.json` configuration for starting an Extension Development Host with `F5`.
- Ported the CastleDB type-string conventions and basic validation into `src/Parser.js`, based on the original `cdb/Parser.hx` and `cdb/Data.hx` sources.
- Added a spreadsheet webview with visible-sheet tabs, search/filtering, schema-aware booleans/enums/references/numbers, generic JSON-backed complex values, and automatic workspace edits.
- Added raw JSON editing for recovery and for CastleDB constructs not yet represented by a specialized control.
- Added the `cdbvs.showHiddenSheets` setting for optionally exposing CastleDB internal/sub-sheets.
- Added expandable, schema-driven list cells using CastleDB's `parentSheet@listColumn` sub-sheet definitions, including nested lists, add/delete list items, and primitive/reference editors inside list rows.
- Fixed nested list-item selection feedback with a persistent highlighted selected row, made the Delete key remove the selected item, and made Delete Item act immediately without a confirmation modal.
- Made nested-list Insert Item update the list cell immediately, added Ctrl/Cmd-click and Shift-click multi-selection, and made delete remove all selected items together.
- Fixed focused-input persistence by synchronizing safe primitive edits before blur, flushing on Ctrl/Cmd+S and webview unload, and awaiting queued updates before the extension host saves the document.
- Optimized nested list-cell edits to refresh only the affected list cell instead of rebuilding the entire sheet, with regression coverage for avoiding a full render.
- List cells now show only the first item's truncated field preview with compact expand/collapse arrows; nested values are summarized as `[...]`, toggling updates only that cell, and document refreshes restore the table's horizontal/vertical scroll position.
- Text (`TString`) fields open a larger multiline modal editor on double-click, with Save/Cancel controls and Ctrl/Cmd+Enter save support.
- Added a full-row edit modal that presents every schema column as a form field, opened by double-clicking the row-number gutter or primary ID (`type 0`) cell, and by the row context menu's Edit action. Modal changes remain in a draft until Save and reuse the existing schema-aware editors.
- Column headers now include a pencil editor for names, type strings, optional/display/kind/scope/documentation settings, advanced JSON properties, and deletion.
- Sheet tabs now include a pencil editor for sheet metadata and advanced properties, with in-modal deletion of a sheet and its sub-sheets; sheet renames update sub-sheet names and direct reference type strings.
- Added row insertion/deletion from the sheet controls, with row ordering handled as a sheet-level non-destructive sort view rather than per-row controls. Separator metadata remains preserved by the model for raw/data edits.
- Replaced row-level delete `x` controls with row-number selection, whole-row highlighting, Insert/Delete Row toolbar actions, and matching selection controls for expanded list items.
- Made row selection immediate through local DOM updates and raised the selected sticky row-number/primary-ID layers so scrolled content cannot show through them.
- Added Ctrl/Cmd-click toggle selection and Shift-click range selection for multiple main-sheet rows, with bulk delete/copy/cut support while retaining an active row for row-level commands.
- Made cleared or blank cell values serialize explicitly as `null`, including optional fields, references, primitive inputs, and empty optional list/property fields; new-row defaults remain unchanged.
- Reduced sheet-switch rendering cost by caching reference option lists per render and indexing separator rows/collapse checks instead of rescanning sheet metadata for every row.
- Added an opaque editor-background layer beneath the selected-state color for pinned cells, covering themes whose selection color is translucent.
- Added Ctrl/Cmd+Up and Ctrl/Cmd+Down keyboard movement for the selected main-sheet row, preserving separator metadata and selection.
- Added selected-row clipboard shortcuts: Ctrl/Cmd+C copies, Ctrl/Cmd+X cuts, and Ctrl/Cmd+V inserts a cloned row below the current selection, with a tagged system-clipboard fallback.
- Kept separator indexes fixed during row reordering so moving across a section boundary places the separator on the appropriate side of the moved row instead of carrying it along.
- Added column and sheet move-left/move-right actions in their edit modals.
- Added schema-driven `TProperties` expansion, a JSON custom-type editor with reference validation, checkbox-based `TFlags`, and a color picker for `TColor`.
- Added quick row search plus a type-aware filter/sort modal covering every column, with non-destructive sorting and a clear-all view reset.
- Refactored the webview from one large script into focused runtime, DOM, model, actions, cell, modal, view, and bootstrap modules loaded in dependency order.
- Added a shared webview utility layer for CastleDB type parsing, value formatting, IDs, cloning, keyed state migration, and persist-then-render mutations; centralized column deletion and host document parsing/replacement so feature modules no longer duplicate those workflows.
- Consolidated sheet rename/delete behavior into a dedicated sheet-structure model pipeline, centralized modal closing/activation, and routed render-only versus persist-and-render paths through shared runtime helpers.
- Standardized sheet/list state transitions and editor-target commits in the shared runtime layer, removing storage-level cleanup and commit boilerplate from structural and context-menu modules.
- Split the webview's cell layer into primitive controls and nested list/property rendering modules.
- Split actions into clipboard operations and structural row/column/sheet mutations.
- Split the model into schema/value helpers and view-state, validation, and structural mutation logic.
- Split modal infrastructure into shared lifecycle/field helpers, confirmation, sheet create/edit/delete, custom-type, filter, row, and column modules.
- Split table rendering into header, cell interaction, row/separator, raw-editor, keyboard, and scrolling/orchestration modules.
- Split cell rendering into primitive, list, and properties modules, and isolate cell-error state from the core view model.
- Split view controls and modal editors into dedicated row/text and column-editor modules, with explicit dependency ordering in the extension host and test harness.
- Organized webview code into feature folders: `runtime`, `model`, `actions`, `cells`, `modals`, `view`, and `bootstrap`; shared CSS and icon assets remain at the media root.
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
- Made cell navigation and cell commits update the existing DOM in place: arrow movement no longer rebuilds the whole sheet, clean editors no longer synthesize repeated change/update events, and dirty edits still commit immediately. The same fix covers clipboard/Delete keyboard paths, flag checkboxes, row/cell selection feedback, viewport reveal, and duplicate-ID error markers.
- Split cell selection from cell activation: the first click or arrow move selects, while a second click or Enter activates the cell editor. Active text controls retain native cursor/delete keys; Enter commits and leaves edit mode, Escape leaves edit mode, and selects/list controls open or expand on activation.
- Added an explicit active-cell exit transition when another cell or row is selected: the prior control blurs, pending edits commit, and its active state is cleared before the new selection is applied.
- Arrow navigation now always performs that active-cell exit before moving, while Delete remains available as a native text-editing key inside an active text control.
- Arrow keys now initialize selection from the current visible/sorted/filtered rows when no cell has been selected yet.
- Arrow navigation is handled before the generic input guard for controls inside table cells, so a focused cell editor cannot swallow the navigation key; non-table inputs such as search remain excluded.
- Active cell editors now keep arrow keys for native in-cell cursor, number, select, and nested-value navigation instead of moving the grid selection.
- Entering a dropdown editor now opens a visible in-webview option list, while Up/Down update the underlying select value without moving the grid.
- Dropdown cells consistently use the in-webview menu for mouse and keyboard activation; native select popup activation is suppressed.
- The custom dropdown menu now commits and closes on option click and includes a text filter for narrowing options and keyboard navigation.
- Dropdown edit state now matches menu state: opening activates the cell, while option selection, Enter, Escape, or clicking the active cell closes the menu and exits editing.
- Arrow keys from either the dropdown control or its filter input are routed to the open custom menu instead of grid navigation.
- Removed the accent-colored ring from selected table cells while preserving selected backgrounds and validation-error styling.
- Restored a consistent fixed blue outline for selected cells and focused cell editors, independent of an orange theme focus color.
- Custom dropdown navigation now scrolls the selected option into view after each vertical move, including filtered results.
- Opening a custom dropdown now focuses its filter input so typing always filters; Up/Down remain reserved for option navigation.
- Active cell text edits now avoid debounced document round-trips until commit, preventing delayed rerenders from ending edit mode.
- Audited every schema editor path: primitive inputs, number/float steppers, booleans, enums, references, colors, IDs, JSON-backed values, flags, and nested list/property editors now defer active-cell commits consistently.
- Vertical arrows remain captured by an open dropdown even after the first option change or when filtering produces no matches.
- Dropdown arrow changes now remain local while the menu is open and commit once on menu close, preventing document rerenders from invalidating repeated navigation.
- Made the Delete key clear only the selected cell while preserving row deletion when no cell is selected; the explicit Delete Row toolbar button remains row-level.
- Removed the top Delete Row button and added right-click context menus: row numbers expose insert/delete/move/copy/cut/paste row actions, while cells expose copy/cut/paste/clear cell actions.
- Added a reusable cell-error registry/API plus automatic duplicate-primary-ID validation that marks only later duplicate cells with an error badge, tooltip, and accessible invalid state; cell edits refresh validation immediately.
- Constrained the webview to the viewport and clipped the content flex area so the dedicated horizontal scrollbar stays directly above the bottom sheet tabs instead of following the table's vertical content.
- Fixed column-modal deletion by removing the unreliable native confirmation gate; deleting a column now removes its schema entry and row values, updates view metadata, and remains undoable through VS Code.
- Fixed stale webview state after adding or deleting sheets, rows, and columns, applying raw JSON, and saving sheet metadata.
- Added structural-shape validation before webview edits, automatic raw JSON fallback for malformed CastleDB documents, and clearer validation errors.
- Hardened schema integrity and editing migrations: malformed type prefixes and separators are rejected, ambiguous sheet/column/custom-type definitions fall back to raw recovery, list/property sub-sheets are created and removed with their parent columns, safe column type conversions are applied transactionally, unsafe conversions are refused before mutation, and separator titles stay aligned when rows are deleted.
- Hardened numeric cell parsing so malformed integer, float, and color input cannot silently become zero; the extension host now refreshes the webview after document changes that arrive during queued edits and reports failed format edits.
- Made Validate and Format resolve the active custom editor document, and report failed workspace edits instead of silently leaving stale state.
- Preserved display-column metadata and reference type strings when renaming or deleting columns and sheets; advanced column properties can no longer overwrite form-controlled fields.
- Removed render-time replacement of malformed rows so raw data is not silently discarded.
- Aligned inserted-row defaults with CastleDB for required references, GUIDs, and nested required property fields.
- Added a column-header right-click menu with Move column left, Move column right, and Delete column actions, including boundary disabling for the move actions.
- Added an Add column context-menu action that opens the full column editor; new columns are inserted only after Save and can be discarded without changing the sheet.
- Removed the top Insert Row button; row insertion remains available from the row context menu and Insert keyboard shortcut.
- Added per-section collapse/expand arrows to separator headers; collapsing hides rows until the next separator while preserving collapse state across row insertions and deletions.
- Added Add Separator to the row context menu above the clicked row, plus double-click inline editing for separator names with Enter/blur save and Escape cancel behavior.
- Added a separator-row right-click menu with Remove Separator, cleaning up aligned separator-title metadata and collapse state.
- Fixed sheet deletion by routing the editor button through a shared mutation, adding an in-webview confirmation dialog, and adding Delete sheet to the sheet-tab context menu.
- Fixed tall sheet, column, and row modals so they stay within the viewport and scroll their form contents instead of clipping the top edge.
- Replaced the unreliable native new-sheet prompt with an in-editor creation modal, and added New sheet to the context menu across the bottom sheet-tab dock.
- Routed Add column through the existing in-editor column modal instead of native prompts, and replaced row/list-item native confirmations with a shared in-editor confirmation dialog.
- Added a dependency-free Node test suite covering parser validation/round-tripping, model/action mutations, sheet and column modal saves, confirmation flows, nested-list deletion, and a native-dialog regression guard.
- Deep-audited and fixed raw-mode recovery, concurrent document-update races, cell-selection loss, column selection drift, stale list state after renames, sheet rename selection migration, sheet-editor cancel mutation, row-only clipboard behavior, and root-sheet block movement.
- Expanded the test suite to 32 cases, including extension-host update serialization, actual view rendering/context-menu behavior, modal filter/custom-type validation, row/separator invariants, reference defaults, selection ranges, clipboard modes, sheet/column rename/delete/move behavior, raw-mode recovery, and compact column-editor metadata preservation.
- Simplified the column editor to name, a type dropdown, contextual type arguments, optional/display controls, and move/delete actions; advanced column metadata is preserved automatically instead of exposed as confusing raw JSON.
- Updated `build.ps1` to install the newly packaged VSIX into the local VS Code installation automatically.
- Copied the reusable `cdb` Haxe model/parser sources and original license/readme into `vendor/castledb`.
- Added `test/fixtures/sample.cdb` from the original repository for manual editor smoke testing.
- Saved project scope, reuse guidance, and validation expectations in `agents.md`.
- Added Marketplace metadata, a root MIT license, a release changelog, and `.vscodeignore` packaging rules.

## Next steps / unfinished pieces

These are intentionally still open for the next milestone:

1. Expand automated coverage for formatting, reference validation, and additional CastleDB type conversions.
2. Improve schema editing with a dedicated type picker, richer required/optional conversion rules, and broader CastleDB-compatible type conversions when a column's type changes.
3. Add richer controls for remaining CastleDB values: tile positions, gradients, curves, dynamic values, and file/image pickers.
4. Add reference validation and useful navigation from a reference cell to the target sheet/row.
5. Match CastleDB separator/group behavior from the Haxe model, including separator titles, group materialization, and preserving separator metadata safely.
6. Add VS Code integration tests and run an installation smoke test in a desktop Extension Development Host.
7. Consider compiling or generating a shared JavaScript CastleDB core from the vendored Haxe model if the direct JavaScript port begins to diverge from CastleDB compatibility.
8. Evaluate the legacy localization export and image-cleanup utilities for VS Code commands; the legacy open/recent/save-as/exit menus are intentionally replaced by VS Code's document and workspace lifecycle.

## Verification notes

- Current audit checks: all JavaScript files pass `node --check`; both fixtures parse and round-trip through the JavaScript parser; headless model/action checks cover row, column, and sheet mutations; and `vsce.cmd package --out cdbvs-0.1.0.vsix` succeeds with the icon included.
- The row-edit-modal change passes `node --check`, `git diff --check`, and both fixture parse/round-trip checks. `vsce.cmd` was unavailable in this environment, so a new VSIX package smoke test was not run.
- `package.json`, `language-configuration.json`, and the sample `.cdb` fixture all pass the available PowerShell JSON parse check. The vendored `cdb` sources match the source repository by SHA-256, and no level-editor files were copied.
- The sample fixture contains three list columns with matching sub-sheet schemas, including the nested `monsters@skills@sub` list schema used to verify recursive expansion paths.
- The search/filter/sort pass passed PowerShell JSON and feature-presence checks. A real VS Code extension-host smoke test remains outstanding.
- The sheet-deletion pass passes JavaScript syntax, diff-whitespace, and a headless model/action mutation check; a real VS Code extension-host smoke test remains outstanding.
- The modal viewport fix passes JavaScript syntax and diff-whitespace checks; visual verification in a real VS Code extension host remains outstanding.
- The native-dialog replacement and regression-suite pass 12 Node tests, all JavaScript syntax checks, JSON fixture checks, and diff-whitespace checks; visual verification in a real VS Code extension host remains outstanding.
- The hardening pass passes 51 Node tests, recursive JavaScript syntax checks, fixture parse/round-trip checks, and `git diff --check`; `vsce.cmd ls` confirms the current runtime, parser, vendor license, and media files are included; a real packaged VS Code Extension Development Host smoke test remains outstanding.
- The deep audit, compact column-editor, nested-list selection/insertion/deletion, focused-input persistence, and local list-cell refresh pass passes 39 Node tests, all JavaScript syntax checks, JSON fixture checks, and diff-whitespace checks; a real packaged VS Code Extension Development Host smoke test remains outstanding.
- The explicit-null clearing pass adds coverage for Delete/cut clearing and blank text, reference, and numeric editors; a real packaged VS Code Extension Development Host smoke test remains outstanding.
- The sheet-switch rendering optimization passes all 40 Node tests, JavaScript syntax checks, and diff-whitespace checks; real-world timing on a desktop VS Code Extension Development Host remains outstanding.
- The multi-row selection pass passes a headless selection-model check, `node --check`, and `git diff --check`; visual verification in a real VS Code extension host remains outstanding.
- The in-place cell-navigation pass passes all 42 Node tests, JavaScript syntax checks, and `git diff --check`; timing and visual verification in a real VS Code extension host remain outstanding.
- The selection/activation pass passes all 43 Node tests, JavaScript syntax checks, and `git diff --check`; visual verification of native dropdown opening remains outstanding in a real VS Code extension host.
- The initial arrow-selection fix passes all 44 Node tests, JavaScript syntax checks, and `git diff --check`.
- The focused-cell arrow-routing fix also passes all 44 Node tests, JavaScript syntax checks, and `git diff --check`.
- The active-cell arrow-key behavior now preserves native editor navigation while keeping pre-activation grid movement; all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Dropdown activation now shows a reliable in-webview option list and preserves Up/Down option navigation; all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Dropdown mouse and keyboard activation now suppresses the native popup and routes through the in-webview menu; all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Custom dropdown option clicks now select and close, with filtered option rendering and navigation covered by the regression suite; all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Dropdown menu/edit-mode transitions are now unified and covered for selection, Enter, Escape, and active-cell clicks; all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Open-menu arrow routing now covers the control and filter-input focus paths; all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Repeated vertical-arrow routing remains inside the open dropdown after option changes; all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Repeated multi-option navigation now preserves the live editor and commits its final value on exit; all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Selected-cell styling no longer draws the accent ring; all 51 Node tests and `git diff --check` pass.
- Selected and editing cells now share the fixed blue outline style; all 51 Node tests and `git diff --check` pass.
- Focused cell edits now remain active through the debounce interval and commit through existing exit/save paths; all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- The all-cell-type commit audit passes 51 Node tests, recursive JavaScript syntax checks, and `git diff --check`; active specialized editors no longer trigger mid-edit document rerenders.
- Dropdown selected-option scrolling is covered and all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Dropdown filter focus and vertical-navigation behavior are covered; all 51 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Expanded list cells now support keyboard entry into the first nested item, Up/Down traversal with the active item kept selected, and Up from the first item returning to the parent cell; all 52 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Expanded list cells now track nested row-and-column cell selection, with blue cell highlighting and Left/Right/Up/Down navigation matching the main grid; all 52 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Nested item cells now use the shared table-cell interaction binder for mouse selection, activation, focus, context menus, Enter/Escape, editor commits, Delete, and cell clipboard actions; nested dropdown closing and text-editor commits preserve nested focus, and all 53 Node tests, recursive JavaScript syntax checks, and `git diff --check` pass.
- Custom dropdowns now reposition from the live control rectangle on nested list-editor/table/document scrolling and window resizing; direct nested-scroll coverage is included in the 53-test suite.
- List-cell edit transitions now use one toggle contract: selected-cell click/Enter opens and activates the expanded list, while active-cell click/Enter/Escape and nested navigation exit collapse it; repeated open/close behavior is covered by 54 passing tests.
- List expansion now uses an explicit cell toggle callback during keyboard activation and exit, avoiding native button event bubbling/rerender races that could cancel the opening; all 54 Node tests pass.
- Nested list editors now own their descendant mouse events: parent list cells ignore events from expanded editors, nested cells share the normal interaction binder without collapsing their ancestors, and direct list-toggle clicks keep selection, activation, and expansion state synchronized; all 54 Node tests pass.
- Insert now routes to the selected list cell’s item insertion action instead of the parent sheet row insertion command; the 55-test suite verifies the top-level row count is unchanged.
- Boolean grid cells are now read-only visual controls owned by cell selection: first click/arrow navigation selects, and second click or Enter toggles the value without activating an editor; the 56-test suite covers this behavior.
- List expansion is no longer coupled to global cell selection: moving to another cell exits the prior editor while preserving its expanded list, allowing multiple list editors to remain open simultaneously; the 57-test suite covers two open lists.
- Vertical navigation now crosses open-list boundaries: the bottom nested item moves to the next top-level list cell, the next Down enters its first item, and the mirrored Up path enters the bottom item of an open list above; closed neighboring lists remain cell selections; all 58 tests pass.
- The module-refactor pass passes all 44 Node tests, JavaScript syntax checks for the new modules, and `git diff --check`; visual verification in a real VS Code Extension Development Host remains outstanding.
- The deeper module-refactor pass keeps all 44 Node tests passing, adds reusable table/modal/cell subcomponents, and reduces the largest remaining webview files to focused logical responsibilities; visual verification in a real VS Code Extension Development Host remains outstanding.
- The first-load arrow-navigation fix makes keyboard-handler installation idempotent and independent of script order, with document and window event routing; all 44 regression tests and recursive syntax checks pass.
- The cell-click navigation regression now preserves the first click as selection-only even when the click lands directly on an embedded input, and handles arrow keys during capture; the focused-input click/arrow test passes.
- The feature-folder organization passes all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check`.
- The shared-utility refactor reduces repeated plumbing in the feature modules while keeping all 44 Node tests passing; recursive JavaScript syntax checks and `git diff --check` pass. A real VS Code Extension Development Host smoke test remains outstanding.
- The second refactor pass keeps all 44 Node tests passing after extracting sheet lifecycle logic into `EditorModelSheets.js` and removing repeated modal/render plumbing; recursive syntax checks and `git diff --check` pass, while a real packaged Extension Development Host smoke test remains outstanding.
- The centralization pass keeps all 44 Node tests passing, with recursive JavaScript syntax checks and `git diff --check` passing; a real packaged Extension Development Host smoke test remains outstanding.
- Renamed the source, webview, stylesheet, test, and generated package filenames to remove the unnecessary `cdb` filename prefix, and updated all loader, packaging, and documentation references.
- Removed forwarding-wrapper aliases from webview modules and replaced them with direct `CDBVS` calls, preserving late-bound runtime hooks while eliminating redundant boilerplate; all 44 Node tests, recursive syntax checks, and `git diff --check` pass.
- Centralized modal shell construction in `EditorModalShared.js`, so individual modals now own only their content and actions; also moved the webview script/style manifest into `src/WebviewFiles.js` for one shared host/test load order.
- Newly selected table cells now receive programmatic keyboard focus, keeping arrow navigation reliable immediately after a click; regression coverage verifies the first-click focus path.
- Enter now exits an active cell through the shared blur/commit transition, returning focus to the selected cell; regression coverage verifies Enter toggles activation in both directions.
- The build-script update passes PowerShell parsing; the build/install flow itself was not run during this change to avoid bumping the project version and installing a new extension instance.
- Release packaging includes the current README, manifest, runtime files, and `media/icon.png`; the publisher ID is still configured as `cdbvs` and must be created or confirmed in the Marketplace publisher account before publishing.
- The modal and shared webview-manifest refactor passes all 44 Node tests, recursive JavaScript syntax checks, and `git diff --check`; a real packaged Extension Development Host smoke test remains outstanding.
- Keep the extension desktop-only and do not bring over the source repository's `src/lvl` or `Level.hx` level editor.
- Tab and Shift+Tab now move through visible grid cells while exiting the prior editor and immediately activating the destination editor; the regression suite passes 59 tests.
- Focused numeric drafts now avoid debounced rerenders even if active-cell state is stale, and Enter commits/exits that editor; rapid numeric-input regression coverage passes.
- Ctrl/Cmd+Up and Down now reorder selected expanded-list items without moving their parent sheet row; regression coverage preserves nested selection and parent order.
