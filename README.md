# CDBVS

CDBVS is a desktop VS Code extension for editing CastleDB `.cdb` files.

## Current baseline

Open a `.cdb` file in VS Code and choose **CDBVS Editor** if it does not open automatically. The editor currently supports:

- visible CastleDB sheet tabs;
- bottom-docked sheet tabs that remain available while the table is scrolled;
- a dedicated synchronized horizontal scrollbar immediately above the sheet tabs for wide sheets;
- removable filter/search/sort pills beneath the sheet controls, plus a left-aligned search box with an embedded clear button;
- a filter-only modal opened by a funnel icon, with per-column sort cycle buttons in each header (neutral, descending, ascending);
- uncluttered column headers containing only the sort control, column name, and edit control;
- high-contrast active states for the selected sheet, active view modes, applied view pills, sorting, search, and expanded nested cells;
- compact content-sized columns with usable text-field minimums, controls that fill their columns, truncated headers, and reduced list/nested-table widths;
- schema-aware text, numbers, booleans, enums, and references;
- expandable list cells backed by CastleDB sub-sheet schemas, including nested lists;
- column-header pencil editors for schema properties and deletion;
- explicit primary-ID controls in column and sheet editors; CastleDB stores this as the single column with type `0`;
- primary-ID columns are pinned beside the row numbers while the rest of the sheet scrolls horizontally;
- column move and delete actions immediately refresh the table after updating the document;
- friendly column type dropdowns with separate argument fields for enums, references, custom types, flags, and layers, plus a raw fallback for unsupported types;
- sheet-tab pencil editors for sheet metadata, advanced properties, and deletion;
- row insertion/deletion from the sheet controls, expandable properties, custom-type editing, flags, and colors;
- row-number selection with whole-row highlighting, Insert Row below the selection, and Delete Row controls; expanded list rows use the same selection pattern;
- row selection updates locally without rebuilding the entire webview, with opaque layering for selected pinned columns;
- Ctrl/Cmd+Up and Ctrl/Cmd+Down move the selected main-sheet row while preserving separator positions;
- Ctrl/Cmd+C copies the selected row, Ctrl/Cmd+X cuts it, and Ctrl/Cmd+V inserts a cloned row below the selection;
- full-width separator rows for CastleDB sheet sections, including separator titles when present;
- sticky separator titles that remain visible during horizontal table scrolling;
- generic JSON editing for properties, custom values, and other advanced types without specialized controls;
- adding/deleting rows and columns, adding sheets, quick searching, per-column filtering, and sorting with removable view pills;
- raw JSON recovery/editing;
- CDBVS commands to open, validate, and format the current file.

The legacy level editor is intentionally out of scope.

## Webview structure

The editor webview is split into small browser scripts: runtime/state, DOM helpers, CastleDB model operations, document actions, cell editors, modal editors, table rendering, and the bootstrap entry point. `extension.js` loads them in dependency order without requiring a build step.

## Running locally

1. Open this folder in desktop VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open `test/fixtures/sample.cdb` or another `.cdb` file.

The extension has no npm runtime dependencies. Automated extension tests are still planned; see [plan.md](plan.md).

## Packaging a release

After installing Node.js 20 or newer:

```powershell
npm install --global @vscode/vsce
vsce ls
vsce package
```

Install the generated `.vsix` in a clean desktop VS Code window and smoke-test it before publishing. To publish through the Visual Studio Marketplace, authenticate with `vsce login <publisher-id>` and run `vsce publish`. The publisher ID must match the `publisher` value in `package.json`.

## Source reuse

The original CastleDB core sources are vendored in [vendor/castledb/cdb](vendor/castledb/cdb). The JavaScript compatibility layer in [src/cdbParser.js](src/cdbParser.js) follows the type numbering and JSON conventions from CastleDB's `Parser.hx` and `Data.hx`.
