# CDBVS

CDBVS is a desktop VS Code extension for editing CastleDB `.cdb` files in a spreadsheet-style interface.

## Features

- Switch between CastleDB sheets with persistent sheet tabs.
- Edit text, numbers, booleans, enums, references, lists, and JSON-backed values.
- Add, edit, move, and delete rows and columns.
- Add sheets and edit sheet and column metadata.
- Search, filter, and sort rows.
- Use keyboard shortcuts to select, copy, cut, paste, and move rows.
- Edit raw JSON when a value is not represented by a specialized control.
- Validate and format the current CastleDB file.

## Usage

1. Open a `.cdb` file in desktop VS Code.
2. CDBVS Editor should open automatically. If it does not, right-click the file and choose **Open With > CDBVS Editor**.
3. Use the sheet tabs and table controls to edit the database.

The extension is for desktop VS Code only; web and mobile VS Code are not supported.

Click a cell to select it; click again or press **Enter/F2** to edit. Arrow keys move the selection, and native caret and clipboard shortcuts work inside an active editor. **Enter** applies an edit, **Escape** cancels it, and **Tab/Shift+Tab** applies and moves to the adjacent cell. Tab selects list/properties cells without opening them; press Enter to open. Booleans toggle with Enter or Space.

Select rows using their row numbers. Shift-click selects a visible range; Ctrl/Cmd-click adds or removes a row. The mode hint shows whether you are selecting or editing. Invalid drafts stay open with a correction message. In a list dialog, Escape cancels the active cell first; press it again to request closing the dialog. Changed dialogs offer **Keep editing** or **Discard changes**. Double-clicking text selects a word; use **Edit text in dialog** in the cell's context menu for the larger editor.

Dialog **Save** applies changes to the document; Ctrl/Cmd+Enter does the same. Ctrl/Cmd+S applies and saves the file. A nested list applies to its parent dialog draft first; apply the parent dialog to update the document. Clicking outside a dialog leaves it open, and Tab stays inside the dialog.

Deletion and discard confirmations require an explicit action button; Save shortcuts never confirm them. Canceling a sheet or column deletion restores its settings draft. **Move left/right** applies the order change immediately and keeps the settings dialog open; Save applies its remaining settings. Sheet moves keep the same sheet active. Table and schema actions are disabled in Raw JSON mode and for malformed files; repair malformed files through Raw JSON first.

Nested column changes update embedded list/properties objects and their stored defaults. Changes that would overwrite preserved fields, collide with another schema, or drop list items are rejected before changing the document. Nested sheets keep their name, kind and visibility tied to the owning column; rename, convert or delete that column to change them. The sheet settings primary-ID picker offers text and existing ID columns; use the column editor for other type conversions.

Use **+ Row** to append a row, including the first row in an empty sheet. A visible new row is selected and brought into view; hidden new rows have an explanation in the status area. When no rows match, **Clear search and filters** restores the view and focuses the first visible row. Numeric filters reject invalid values and reversed ranges. Reference filters match exact IDs. Filters affect only the view: Ctrl/Cmd+Enter or Ctrl/Cmd+S in the filter dialog applies filters without changing or saving document data.

Context menus support Up/Down, Home/End, Enter, and Escape; closing a menu returns focus to its launch control. Reference dropdowns refresh their choices when reopened after an ID edit. If another pane or external editor changes the file before a queued edit applies, CDBVS loads the current file and preserves the rejected edit for recovery. A save for a different document snapshot stops with a review message.

Raw JSON drafts survive switching views. **Apply JSON** validates the JSON and CastleDB structure before updating the document; Ctrl/Cmd+S applies and saves. If table edits change the document while a JSON draft is retained, applying that stale draft is blocked. Copy anything you need before choosing **Discard JSON draft**. Failed document updates are preserved in the recovery panel instead of disappearing when VS Code reloads the document. Drafts and recovery copies currently last for the open editor session.

If the file changes externally during an edit, the updated file is loaded and unfinished edits appear in a recovery panel for copying. Copy any edits you want to keep before dismissing that panel or closing the editor.

## Development

Install dependencies with `npm install`, then run `npm run build` to type-check the TypeScript host/domain code and bundle the extension and webview. `npm test` builds first and runs the parser, protocol, extension-host, and webview tests. `npm run package` creates the production bundles used by VSIX packaging.

Run `npm run vsix` to bump the patch version in `package.json` and `package-lock.json`, build the production bundles, and create `cdbvs-<version>.vsix` in the project root. This requires the `vsce` CLI (`npm install --global @vscode/vsce`). It does not create a Git commit/tag or install the extension. Each run increments the patch version; `vsce package` packages the current version without a bump. The earlier `npm run build:vsix` command remains an alias.

`npm run test:browser` exercises trusted mouse/keyboard events in a local headless Chromium browser without adding test dependencies. It uses installed Chrome/Edge on Windows; set `CDBVS_BROWSER` to a Chromium executable elsewhere. The browser test reports a skip when no executable is available.

## Install from a VSIX

1. Open the Extensions view in VS Code.
2. Select the **...** menu.
3. Choose **Install from VSIX...** and select the downloaded `.vsix` file.
