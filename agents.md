# CDBVS agent guidance

## Product scope

- This repository builds a desktop-only VS Code extension named `CDBVS`.
- The extension edits CastleDB files with the `.cdb` extension. CastleDB files are structured, human-readable JSON documents containing sheets, columns, rows, and custom types.
- The first milestone is a mostly workable spreadsheet-style editor: open a `.cdb` file in a custom editor, switch sheets, edit schema-aware cells, add/delete rows and columns, add sheets, quick-search/filter/sort rows, and fall back to raw JSON editing.
- Do not implement or port the legacy CastleDB level editor. In particular, `src/lvl`, `Level.hx`, tile palettes, maps, and NW.js level UI are out of scope.
- Only desktop VS Code is in scope; do not add browser, web-only, mobile, or NW.js packaging targets.

## Existing implementation to reuse

- The source editor repository is at `C:\Users\Casey\Documents\Cursemark\.haxelib\castle\git`. The installed folder is named `castle`, even though the user described it as `castledb`.
- The reusable CastleDB model/parser sources have been copied to `vendor/castledb/cdb`.
- The important compatibility source is `vendor/castledb/cdb/Parser.hx`, `Data.hx`, `Database.hx`, `Sheet.hx`, and `Types.hx`. Preserve their type numbering and `.cdb` JSON conventions when extending the JavaScript implementation.
- `src/Parser.js` is the small JavaScript bridge used by the extension host. It follows the original Haxe parser's type strings and validation concepts. Keep it in sync with the vendored Haxe sources.
- The original CastleDB repository is under its own permissive license; retain `vendor/castledb/LICENSE` and the source provenance when porting additional code.

## Implementation conventions

- Keep the extension dependency-light. The current implementation is plain JavaScript and uses VS Code's `CustomTextEditorProvider`; avoid adding a build tool or runtime dependency unless it materially improves the editor.
- Treat the document as the source of truth. Webview edits should serialize with tab indentation and flow through a `WorkspaceEdit`, so VS Code undo/save/file watching continue to work.
- Preserve unknown CastleDB fields when editing. Additive schema work should use `typeStr` values such as `0` (id), `1` (string), `2` (bool), `3` (int), `4` (float), `5:a,b` (enum), `6:sheet` (reference), `8` (list), and `17` (properties).
- Avoid destructive migrations. If a new edit cannot safely preserve data, use the raw JSON fallback or show a validation error.
- Update `plan.md` whenever a milestone is completed or a meaningful limitation is discovered. Record unfinished features explicitly rather than implying the editor is complete.

## Validation expectations

- Validate JSON parsing and the CastleDB root/sheet/schema shape before applying webview edits.
- Keep the extension host and webview resilient to malformed files: a malformed file should still expose raw JSON recovery where possible.
- Before handoff, run whatever syntax/package checks are available in the environment and document unavailable checks in `plan.md`.
