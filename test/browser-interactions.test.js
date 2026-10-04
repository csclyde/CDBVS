// Real Chromium events cover browser capture/bubble ordering and native input
// behavior that the dependency-free fake DOM intentionally does not emulate.
// Set CDBVS_BROWSER to a Chromium executable on other desktop environments.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const browserPath = [process.env.CDBVS_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));
const root = path.resolve(__dirname, "..");
const fixture = { customTypes: [], sheets: [
  { name: "People", columns: [
    { name: "name", typeStr: "1" }, { name: "score", typeStr: "3" },
    { name: "kind", typeStr: "5:First,Second,Third" }, { name: "enabled", typeStr: "2" },
    { name: "items", typeStr: "8" }, { name: "details", typeStr: "17" }
  ], lines: [{ name: "Ada", score: 42, kind: 0, enabled: false, items: [{ amount: 1, note: "old", details: { a: "nested" } }], details: { a: "one", b: "two" } },
    { name: "Grace", score: 7, kind: 1, enabled: true, items: [] }], separators: [], props: {} },
  { name: "People@items", columns: [{ name: "amount", typeStr: "3" }, { name: "note", typeStr: "1" }, { name: "details", typeStr: "17" }], lines: [], props: { hide: true } },
  { name: "People@items@details", columns: [{ name: "a", typeStr: "1" }], lines: [], props: { hide: true } },
  { name: "People@details", columns: [{ name: "a", typeStr: "1" }, { name: "b", typeStr: "1" }], lines: [], props: { hide: true } },
  { name: "Other", columns: [{ name: "name", typeStr: "1" }], lines: [{ name: "Elsewhere" }], props: {} }
] };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("real Chromium cell interaction contract", { skip: !browserPath && "Set CDBVS_BROWSER to a Chromium executable", timeout: 90000 }, async (t) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cdbvs-browser-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/editor.js" || req.url === "/Editor.css") {
      res.setHeader("Content-Type", req.url.endsWith(".js") ? "application/javascript" : "text/css");
      res.end(fs.readFileSync(path.join(root, "media", req.url.slice(1))));
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/Editor.css"></head><body><div id="app"></div>
      <script>window.posted=[]; window.acquireVsCodeApi=()=>({postMessage:m=>posted.push(m)});</script>
      <script src="/editor.js"></script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1280,900", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  let send;
  t.after(async () => {
    if (send) await send("Browser.close").catch(() => {});
    if (socket) socket.close();
    for (let i = 0; browser.exitCode === null && i < 40; i++) await delay(50);
    if (browser.exitCode === null) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    // Remove only the unique profile created by this test, within OS temp.
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("cdbvs-browser-")) throw new Error("Unexpected browser profile path");
    await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; !fs.existsSync(portFile) && i < 200; i++) await delay(50);
  assert.ok(fs.existsSync(portFile), "Chromium must start its debugging endpoint");
  const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.result.description);
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(25); }
    throw new Error(`Browser condition not met: ${expression}`);
  };
  const click = async (expression, clickCount = 1) => {
    const point = await evaluate(`(()=>{const el=${expression}; el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+Math.min(12,r.width/2),y:r.y+r.height/2}})()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount, ...point });
  };
  const key = async (key, modifiers = 0, text) => {
    const codes = { Enter: 13, Escape: 27, Tab: 9, F2: 113, ArrowDown: 40, ArrowLeft: 37, Delete: 46 };
    const params = { key, modifiers, windowsVirtualKeyCode: codes[key] || key.toUpperCase().charCodeAt(0), ...(text ? { text } : {}) };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...params, text: undefined });
  };
  const insert = (text) => send("Input.insertText", { text });
  await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  await waitFor("!!window.CDBVS && !!document.querySelector('.toolbar')");
  let resetCount = 0;
  const reset = async () => {
    await evaluate(`CDBVS.state.sheetIndex=0; window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:${JSON.stringify(JSON.stringify(fixture) + "\n" + " ".repeat(++resetCount))},data:${JSON.stringify(fixture)},issues:[],rawMode:false,showHiddenSheets:false}})); window.cell=(r,c)=>CDBVS.findRenderedCell(r,c); window.sheet=()=>CDBVS.currentSheet();`);
    await waitFor("!!cell(1,5)");
  };
  await reset();
  await t.test("select first, edit second, keep caret gestures, cancel without changing the file", async () => {
    await click("cell(0,0).querySelector('input')");
    assert.equal(await evaluate("CDBVS.activeCell(sheet())"), null);
    assert.equal(await evaluate("document.activeElement === cell(0,0)"), true);
    await click("cell(0,0).querySelector('input')");
    assert.equal(await evaluate("cell(0,0).classList.contains('cell-active')"), true);
    await click("cell(0,0).querySelector('input')");
    assert.ok(await evaluate("CDBVS.activeCell(sheet())"));
    await click("cell(0,0).querySelector('input')", 2);
    assert.equal(await evaluate("document.querySelector('.text-modal-overlay')"), null);
    assert.equal(await evaluate("document.activeElement.selectionEnd > document.activeElement.selectionStart"), true);
    await key("a", 2);
    await insert("Changed");
    await key("Escape");
    assert.equal(await evaluate("sheet().lines[0].name"), "Ada");
    assert.equal(await evaluate("document.activeElement === cell(0,0)"), true);
    assert.match(await evaluate("document.querySelector('.cell-mode-hint').textContent"), /Selected/);
  });
  await t.test("native text cut does not cut the grid cell", async () => {
    await key("F2");
    await evaluate("cell(0,0).querySelector('input').setSelectionRange(1,2)");
    await key("x", 2);
    assert.equal(await evaluate("cell(0,0).querySelector('input').value"), "Aa");
    assert.equal(await evaluate("CDBVS.state.cellClipboard"), null);
    await key("Escape");
  });
  await t.test("invalid numeric draft blocks view changes and Escape provides an exit", async () => {
    await click("cell(0,1)"); await key("Enter"); await key("a", 2); await insert("-");
    assert.equal(await evaluate("cell(0,1).querySelector('input').validity.badInput"), true);
    await key("Tab");
    assert.equal(await evaluate("CDBVS.activeCell(sheet()).columnIndex"), 1);
    await click("document.querySelectorAll('.sheet')[1]");
    assert.equal(await evaluate("sheet().name"), "People");
    assert.match(await evaluate("document.querySelector('.status').textContent"), /Escape to cancel/);
    await key("Escape");
    assert.equal(await evaluate("sheet().lines[0].score"), 42);
    await click("document.querySelectorAll('.sheet')[1]");
    await waitFor("sheet().name === 'Other' && !!cell(0,0)");
  });
  await reset();
  await t.test("list cells select first, open once, and Escape cancels a cell before the modal", async () => {
    await click("cell(0,4).querySelector('button')");
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 0);
    await click("cell(0,4).querySelector('button')");
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 1);
    await key("Enter"); await key("a", 2); await insert("-"); await key("Tab");
    assert.equal(await evaluate("document.activeElement.validity.badInput"), true);
    await key("Escape");
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 1);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27, autoRepeat: true });
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 1);
    await key("Escape");
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 0);
    assert.equal(await evaluate("document.activeElement === cell(0,4) || cell(0,4).contains(document.activeElement)"), true);
  });
  await t.test("Tab selects a list without opening a modal and properties commit every child", async () => {
    await click("cell(0,3)"); await key("Tab");
    assert.equal(await evaluate("document.querySelectorAll('.text-modal-overlay').length"), 0);
    assert.equal(await evaluate("CDBVS.selectedCell(sheet()).columnIndex"), 4);
    await click("cell(0,5)"); await key("Enter");
    const controls = "cell(0,5).querySelectorAll('input')";
    await click(`${controls}[0]`); await key("a", 2); await insert("A");
    await click(`${controls}[1]`); await key("a", 2); await insert("B");
    await click("cell(1,0)");
    assert.deepEqual(await evaluate("sheet().lines[0].details"), { a: "A", b: "B" });
    const update = await evaluate("posted.filter(m=>m.type==='update').at(-1).text");
    assert.deepEqual(JSON.parse(update).sheets[0].lines[0].details, { a: "A", b: "B" });
  });
  await t.test("expanded properties re-enter editing on focus after Escape", async () => {
    await click("cell(0,5).querySelector('input')");
    assert.equal(await evaluate("CDBVS.activeCell(sheet()).columnIndex"), 5);
    await key("a", 2); await insert("cancel me"); await key("Escape");
    assert.equal(await evaluate("sheet().lines[0].details.a"), "A");
    await click("cell(0,5).querySelector('input')");
    await key("a", 2); await insert("Applied"); await key("Enter");
    assert.equal(await evaluate("sheet().lines[0].details.a"), "Applied");
    assert.equal(await evaluate("CDBVS.activeCell(sheet())"), null);
    await click("cell(1,0)");
  });
  await t.test("external document changes preserve unfinished input without overwriting new data", async () => {
    await key("Enter"); await key("a", 2); await insert("Unsaved");
    const changed = structuredClone(fixture); changed.sheets[0].lines[1].name = "External";
    await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:${JSON.stringify(JSON.stringify(changed))},data:${JSON.stringify(changed)},issues:[],rawMode:false,showHiddenSheets:false}}))`);
    await waitFor("!!cell(1,0)");
    assert.equal(await evaluate("sheet().lines[1].name"), "External");
    assert.equal(await evaluate("document.querySelector('.recovered-draft textarea').value"), "Unsaved");
    assert.equal(await evaluate("CDBVS.activeCell(sheet())"), null);
  });
  await reset();
  await t.test("dropdown Escape cancels, Tab commits, and held Enter cannot repeatedly toggle booleans", async () => {
    await click("cell(0,2)"); await key("Enter"); await key("ArrowDown"); await key("Escape");
    assert.equal(await evaluate("sheet().lines[0].kind"), 0);
    assert.equal(await evaluate("document.querySelector('.cell-select-menu')"), null);
    await key("Enter"); await key("ArrowDown"); await key("Tab");
    assert.equal(await evaluate("sheet().lines[0].kind"), 1);
    assert.equal(await evaluate("CDBVS.selectedCell(sheet()).columnIndex"), 3);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", windowsVirtualKeyCode: 13, autoRepeat: true });
    assert.equal(await evaluate("sheet().lines[0].enabled"), false);
    await key("Enter");
    assert.equal(await evaluate("sheet().lines[0].enabled"), true);
  });
  await t.test("properties inside list modals open, re-enter editing and apply atomically on list Save", async () => {
    await click("cell(0,4)"); await key("Enter");
    const prop = "document.querySelector('.list-modal-table td[data-column-index=\"2\"]')";
    await click(prop); await key("Enter");
    await click(`${prop}.querySelector('input')`); await key("a", 2); await insert("discard"); await key("Escape");
    assert.equal(await evaluate(`${prop}.querySelector('input').value`), "nested");
    await click(`${prop}.querySelector('input')`); await key("a", 2); await insert("Nested applied"); await key("Enter");
    assert.equal(await evaluate("sheet().lines[0].items[0].details.a"), "nested");
    await click("Array.from(document.querySelector('.list-modal').querySelectorAll('button')).find(b=>b.textContent==='Save')");
    assert.equal(await evaluate("sheet().lines[0].items[0].details.a"), "Nested applied");
    assert.equal(await evaluate("document.querySelector('.text-modal-overlay')"), null);
  });
  await reset();
  await t.test("row dialogs protect dirty cancellation, ignore backdrop dismissal, trap focus and apply on Ctrl+S", async () => {
    await evaluate("CDBVS.openRowEditor(sheet(),0)");
    await click("document.querySelector('.row-modal input[type=text]')");
    assert.equal(await evaluate("document.activeElement === document.querySelector('.row-modal input[type=text]')"), true);
    await key("a", 2); await insert("Row draft");
    assert.equal(await evaluate("document.querySelector('.row-modal input[type=text]').value"), "Row draft");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: 2, y: 2 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: 2, y: 2 });
    assert.equal(await evaluate("!!document.querySelector('.row-modal')"), true);
    await click("document.querySelector('.text-modal-close')");
    assert.equal(await evaluate("!!document.querySelector('.modal-discard-prompt')"), true);
    assert.equal(await evaluate("sheet().lines[0].name"), "Ada");
    await key("Tab", 8);
    assert.equal(await evaluate("document.activeElement.textContent"), "Discard changes");
    await key("Tab");
    assert.equal(await evaluate("document.activeElement.textContent"), "Keep editing");
    await key("Escape");
    assert.equal(await evaluate("document.querySelector('.modal-discard-prompt')"), null);
    await click("document.querySelector('.row-modal input[type=text]')");
    assert.equal(await evaluate("document.activeElement.value"), "Row draft");
    const saves = await evaluate("posted.filter(m=>m.type==='save').length");
    await key("s", 2);
    assert.equal(await evaluate("sheet().lines[0].name"), "Row draft");
    assert.equal(await evaluate("document.querySelector('.row-modal')"), null);
    assert.equal(await evaluate("posted.filter(m=>m.type==='save').length"), saves + 1);
  });
  await reset();
  await t.test("row dialog Tab, boolean and nested list controls update only the row draft until applied", async () => {
    await evaluate("CDBVS.openRowEditor(sheet(),0)");
    await key("Tab");
    assert.equal(await evaluate("document.activeElement.type"), "number");
    await click("document.querySelector('.row-modal input[type=checkbox]')");
    assert.equal(await evaluate("document.querySelector('.row-modal input[type=checkbox]').checked"), true);
    assert.equal(await evaluate("sheet().lines[0].enabled"), false);
    await click("document.querySelector('.row-modal .list-toggle')");
    assert.equal(await evaluate("!!document.querySelector('.list-modal')"), true);
    const nested = "document.querySelector('.list-modal-table td[data-column-index=\"1\"]')";
    await click(nested); await key("Enter"); await key("a", 2); await insert("Child draft"); await key("Enter", 2);
    assert.equal(await evaluate("!!document.querySelector('.row-modal')"), true);
    assert.equal(await evaluate("!!document.activeElement.closest('.row-modal')"), true);
    assert.equal(await evaluate("sheet().lines[0].items[0].note"), "old");
    await key("Enter", 2);
    assert.equal(await evaluate("sheet().lines[0].enabled"), true);
    assert.equal(await evaluate("sheet().lines[0].items[0].note"), "Child draft");
    assert.equal(await evaluate("document.querySelector('.text-modal-overlay')"), null);
  });
  await reset();
  await t.test("raw drafts survive view switches, validate before saving, and preserve a rejected document update", async () => {
    const rawButton = "Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Raw JSON')";
    const tableButton = "Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Table')";
    await click(rawButton);
    await click("document.querySelector('.raw-editor')"); await key("a", 2); await insert("{}");
    await click(tableButton); await waitFor("!!cell(0,0)");
    assert.equal(await evaluate("CDBVS.state.rawDraft.text"), "{}");
    await click(rawButton);
    assert.equal(await evaluate("document.querySelector('.raw-editor').value"), "{}");
    await click("document.querySelector('.raw-editor')");
    const saves = await evaluate("posted.filter(m=>m.type==='save').length");
    await key("s", 2);
    assert.equal(await evaluate("posted.filter(m=>m.type==='save').length"), saves);
    assert.match(await evaluate("document.getElementById('status').textContent"), /Invalid CastleDB structure/);
    const next = structuredClone(fixture); next.sheets[0].lines[0].name = "Raw applied";
    await key("a", 2); await insert(JSON.stringify(next)); await key("s", 2);
    assert.equal(await evaluate("sheet().lines[0].name"), "Raw applied");
    assert.equal(await evaluate("CDBVS.state.rawDraft"), null);
    assert.equal(await evaluate("posted.filter(m=>m.type==='save').length"), saves + 1);
    await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{type:'error',message:'Could not apply update',rejectedText:${JSON.stringify(JSON.stringify(next))}}})); window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:${JSON.stringify(JSON.stringify(fixture))},data:${JSON.stringify(fixture)},issues:[],rawMode:false,showHiddenSheets:false}}))`);
    await waitFor("!!cell(0,0)");
    assert.equal(await evaluate("sheet().lines[0].name"), "Ada");
    assert.equal(await evaluate("JSON.parse(CDBVS.state.recoveredDrafts.find(d=>d.label==='Unapplied document update').text).sheets[0].lines[0].name"), "Raw applied");
    assert.equal(await evaluate("document.getElementById('status').textContent"), "Could not apply update");
  });
  await reset();
  await t.test("a retained raw draft cannot overwrite table edits; discard requires an explicit choice", async () => {
    await evaluate("CDBVS.state.rawMode=true; CDBVS.renderNow()");
    await click("document.querySelector('.raw-editor')"); await key("a", 2); await insert(JSON.stringify(fixture));
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Table')");
    await waitFor("!!cell(0,0)"); await click("cell(0,0)"); await key("Enter"); await key("a", 2); await insert("Newer table edit"); await key("Enter");
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Raw JSON')");
    await click("document.querySelector('.raw-apply')");
    assert.equal(await evaluate("sheet().lines[0].name"), "Newer table edit");
    assert.match(await evaluate("document.getElementById('status').textContent"), /document changed/);
    await click("document.querySelector('.raw-discard')");
    await key("Escape");
    assert.equal(await evaluate("!!CDBVS.state.rawDraft"), true);
    await click("document.querySelector('.raw-discard')");
    await click("Array.from(document.querySelector('.confirm-modal').querySelectorAll('button')).find(b=>b.textContent==='Discard draft')");
    assert.equal(await evaluate("CDBVS.state.rawDraft"), null);
    assert.equal(await evaluate("JSON.parse(document.querySelector('.raw-editor').value).sheets[0].lines[0].name"), "Newer table edit");
  });
  await reset();
  await t.test("schema dialogs close cleanly after a field is reverted and context menus keep keyboard focus", async () => {
    await evaluate("CDBVS.openColumnEditor(sheet(),sheet().columns[0],0,false)");
    const name = "document.querySelector('.column-modal input')";
    await click(name); await key("a", 2); await insert("temporary");
    await key("a", 2); await insert("name"); await key("Escape");
    assert.equal(await evaluate("document.querySelector('.text-modal-overlay')"), null);
    await click("cell(0,0)");
    await evaluate("CDBVS.showCellContextMenu({clientX:20,clientY:200},sheet())");
    assert.equal(await evaluate("document.activeElement.textContent"), "Edit text in dialog");
    await key("ArrowDown");
    assert.equal(await evaluate("document.activeElement.textContent"), "Copy cell");
    await key("End");
    assert.equal(await evaluate("document.activeElement.textContent"), "Clear cell");
    await key("Escape");
    assert.equal(await evaluate("document.activeElement === cell(0,0)"), true);
    assert.equal(await evaluate("sheet().lines[0].name"), "Ada");
    await click("cell(0,4)"); await key("Enter");
    const listCell = "document.querySelector('.list-modal-table td[data-column-index=\"0\"]')";
    await evaluate("window.menuLaunchControl=document.activeElement");
    await evaluate("CDBVS.showContextMenu({clientX:20,clientY:200},[{label:'Unavailable',disabled:true,action:()=>{}},{label:'First',action:()=>{}},{label:'Second',action:()=>{}}])");
    assert.equal(await evaluate("document.activeElement.textContent"), "First");
    await key("ArrowDown");
    assert.equal(await evaluate("document.activeElement.textContent"), "Second");
    await key("Escape");
    assert.equal(await evaluate("document.activeElement === window.menuLaunchControl"), true,
      await evaluate("document.activeElement.outerHTML.slice(0,250) + ' / ' + window.menuLaunchControl.outerHTML.slice(0,250)"));
    assert.equal(await evaluate("!!document.querySelector('.list-modal')"), true);
    await key("Escape");
  });
  await t.test("already opened reference controls refresh choices after an inline ID edit", async () => {
    const data = { customTypes: [], sheets: [{ name: "Refs", columns: [{ name: "id", typeStr: "0" }, { name: "ref", typeStr: "6:Refs" }], lines: [{ id: "old", ref: "old" }, { id: "other", ref: "old" }] }] };
    await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:${JSON.stringify(JSON.stringify(data))},data:${JSON.stringify(data)},issues:[],rawMode:false,showHiddenSheets:false}}))`);
    await waitFor("!!cell(1,1)");
    await click("cell(1,1)"); await key("Enter"); await key("Escape");
    await click("cell(0,0)"); await key("Enter"); await key("a", 2); await insert("renamed"); await key("Enter");
    await click("cell(1,1)"); await key("Enter");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.cell-select-option')).some(b=>b.textContent==='renamed')"), true);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.cell-select-option')).some(b=>b.textContent==='Missing value: old')"), true);
    await key("Escape");
    assert.equal(await evaluate("sheet().lines[1].ref"), "old");
    const last = await evaluate("posted.filter(m=>m.type==='update').at(-1)");
    assert.equal(JSON.parse(last.baseText).sheets[0].lines[0].id, "old");
    assert.equal(JSON.parse(last.text).sheets[0].lines[0].id, "renamed");
  });
  await reset();
  await t.test("filter drafts validate native numeric input and ranges before applying to the view", async () => {
    await click("document.querySelector('.filter-button')");
    const min = "document.querySelector('.filter-modal input[aria-label=\"score: Minimum\"]')";
    const max = "document.querySelector('.filter-modal input[aria-label=\"score: Maximum\"]')";
    await click(min); await insert("-"); await key("Enter", 2);
    assert.equal(await evaluate("!!document.querySelector('.filter-modal')"), true);
    assert.equal(await evaluate(`${min}.getAttribute('aria-invalid')`), "true");
    assert.match(await evaluate("document.querySelector('.modal-status').textContent"), /whole number/);
    await key("a", 2); await insert("30");
    await click(max); await insert("10"); await key("Enter", 2);
    assert.match(await evaluate("document.querySelector('.modal-status').textContent"), /Minimum cannot exceed Maximum/);
    await click(min); await key("a", 2); await insert("7");
    await click(max); await key("a", 2); await insert("42");
    const saves = await evaluate("posted.filter(m=>m.type==='save').length");
    await key("s", 2);
    await waitFor("!!cell(1,0)");
    assert.equal(await evaluate("document.querySelector('.filter-modal')"), null);
    assert.equal(await evaluate("posted.filter(m=>m.type==='save').length"), saves);
    assert.match(await evaluate("document.getElementById('status').textContent"), /document data is unchanged/);
    assert.equal(await evaluate("CDBVS.state.columnFilters.People.score.min"), "7");
    await evaluate("CDBVS.sheetState.view.setFilters('People',{})");
  });
  await reset();
  await t.test("failed-update recovery appears immediately without rebuilding the grid or interrupting editing", async () => {
    await evaluate("CDBVS.state.recoveredDrafts=[];CDBVS.refreshDraftRecovery();window.savedBody=document.querySelector('.table-wrap tbody')");
    await click("cell(0,0)"); await key("Enter"); await key("a", 2); await insert("Keep typing");
    const updates = await evaluate("posted.filter(m=>m.type==='update').length");
    await evaluate("window.dispatchEvent(new MessageEvent('message',{data:{type:'error',message:'Update failed',rejectedText:'Submitted work'}})); window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:CDBVS.documentText(),data:JSON.parse(CDBVS.documentText()),issues:[],rawMode:false,showHiddenSheets:false}}))");
    assert.equal(await evaluate("document.querySelector('.recovered-draft textarea').value"), "Submitted work");
    assert.equal(await evaluate("document.querySelector('.table-wrap tbody') === window.savedBody"), true);
    assert.equal(await evaluate("document.activeElement === cell(0,0).querySelector('input')"), true);
    assert.equal(await evaluate("document.activeElement.value"), "Keep typing");
    assert.equal(await evaluate("posted.filter(m=>m.type==='update').length"), updates);
    await evaluate("window.dispatchEvent(new MessageEvent('message',{data:{type:'error',message:'Update failed',rejectedText:'Submitted work'}}))");
    assert.equal(await evaluate("document.querySelectorAll('.recovered-draft').length"), 1);
    await key("Escape");
  });
  await t.test("empty sheets offer row creation and filtered-empty views explain and reset hidden rows", async () => {
    const data = { customTypes: [], sheets: [{ name: "Empty", columns: [{ name: "name", typeStr: "1" }], lines: [] }] };
    await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:${JSON.stringify(JSON.stringify(data))},data:${JSON.stringify(data)},issues:[],rawMode:false,showHiddenSheets:false}}))`);
    await waitFor("!!document.querySelector('.empty')");
    assert.match(await evaluate("document.querySelector('.empty').textContent"), /first row/);
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='+ Row')");
    await waitFor("!!cell(0,0)");
    assert.equal(await evaluate("document.activeElement === cell(0,0)"), true);
    assert.equal(await evaluate("sheet().lines.length"), 1);
    await click("document.querySelector('.search')"); await insert("no match");
    await waitFor("!!document.querySelector('.empty-view-reset')");
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='+ Row')");
    await waitFor("sheet().lines.length===2 && !CDBVS.isGridUpdating() && !!document.querySelector('.empty-view-reset')");
    assert.match(await evaluate("document.getElementById('status').textContent"), /hidden by the current search/);
    await click("document.querySelector('.empty-view-reset')");
    await waitFor("!!cell(1,0)");
    assert.equal(await evaluate("document.querySelector('.search').value"), "");
    assert.equal(await evaluate("document.activeElement === cell(0,0)"), true);
    assert.equal(await evaluate("sheet().lines.length"), 2);
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Raw JSON')");
    assert.equal(await evaluate("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='+ Row').disabled"), true);
  });
  await reset();
  const modalButton = (label) => `Array.from(CDBVS.modalState.active.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})`;
  await t.test("destructive confirmations require an explicit button choice and column deletion persists", async () => {
    await evaluate("CDBVS.services.application.documentActions.deleteRow(sheet(),0)");
    const saves = await evaluate("posted.filter(m=>m.type==='save').length");
    await key("s", 2); await key("Enter", 2);
    assert.equal(await evaluate("sheet().lines.length"), 2);
    assert.equal(await evaluate("posted.filter(m=>m.type==='save').length"), saves);
    assert.match(await evaluate("document.querySelector('.modal-status').textContent"), /do not confirm/);
    await key("Enter", 0, "\r"); // Cancel initially owns focus; include the native Enter character event.
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    await evaluate("CDBVS.showColumnContextMenu({clientX:20,clientY:200},sheet(),1)");
    await click("Array.from(document.querySelector('.context-menu').querySelectorAll('button')).find(b=>b.textContent==='Delete column')");
    assert.equal(await evaluate("sheet().columns.length"), 6);
    await click(modalButton("Delete column"));
    await waitFor("!!cell(0,4)");
    assert.equal(await evaluate("sheet().columns.some(c=>c.name==='score')"), false);
    const last = await evaluate("posted.filter(m=>m.type==='update').at(-1)");
    assert.equal(JSON.parse(last.text).sheets[0].columns.some(c=>c.name==='score'), false);
    assert.equal(Object.hasOwn(JSON.parse(last.text).sheets[0].lines[0], "score"), false);
  });
  await reset();
  await t.test("column settings survive moves and canceled deletion, then save the correct column", async () => {
    await evaluate("CDBVS.openColumnEditor(sheet(),sheet().columns[0],0)");
    await key("a", 2); await insert("renamed");
    await click(modalButton("Move right"));
    assert.equal(await evaluate("document.querySelector('.column-modal input').value"), "renamed");
    assert.equal(await evaluate("sheet().columns[1].name"), "name");
    await click(modalButton("Delete column"));
    await key("s", 2); await key("Escape");
    assert.equal(await evaluate("document.querySelector('.column-modal input').value"), "renamed");
    await click(modalButton("Move left"));
    assert.equal(await evaluate(`${modalButton("Move left")}.disabled`), true);
    await click(modalButton("Save"));
    await waitFor("!!cell(0,0)");
    assert.equal(await evaluate("sheet().columns[0].name"), "renamed");
    assert.equal(await evaluate("sheet().lines[0].renamed"), "Ada");
    assert.equal(await evaluate("sheet().columns[1].name"), "score");
  });
  await reset();
  await t.test("sheet settings survive moves and deletion cancellation and follow the active sheet", async () => {
    await evaluate("CDBVS.state.showHiddenSheets=true; CDBVS.renderNow(); CDBVS.openSheetEditor(sheet())");
    await key("a", 2); await insert("RenamedPeople");
    await click(modalButton("Move right"));
    assert.equal(await evaluate("sheet().name"), "People");
    assert.equal(await evaluate(`${modalButton("Move right")}.disabled`), true);
    assert.equal(await evaluate("document.querySelector('.column-modal input').value"), "RenamedPeople");
    await click(modalButton("Delete sheet"));
    await key("Enter", 2); await key("Escape");
    assert.equal(await evaluate("document.querySelector('.column-modal input').value"), "RenamedPeople");
    await click(modalButton("Move left"));
    assert.equal(await evaluate(`${modalButton("Move left")}.disabled`), true);
    await click(modalButton("Save"));
    await waitFor("!!cell(0,0)");
    assert.equal(await evaluate("sheet().name"), "RenamedPeople");
    assert.equal(await evaluate("CDBVS.state.data.sheets[1].name"), "RenamedPeople@items");
    await evaluate("CDBVS.openSheetEditor(CDBVS.state.data.sheets[1])");
    assert.equal(await evaluate(`${modalButton("Move left")}.disabled && ${modalButton("Move right")}.disabled`), true);
    await key("Escape");
  });
  await reset();
  await t.test("new sheet buttons validate names and IME or held Enter cannot create a sheet", async () => {
    await click("Array.from(document.querySelector('.toolbar button').parentNode.querySelectorAll('button')).find(b=>b.textContent==='+ Sheet')");
    await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true})); document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,repeat:true}))");
    assert.equal(await evaluate("CDBVS.state.data.sheets.length"), 5);
    await key("a", 2); await insert("People"); await click(modalButton("Create sheet"));
    assert.match(await evaluate("document.querySelector('.column-form-error').textContent"), /already exists/);
    await key("a", 2); await insert("Created"); await key("Enter");
    await waitFor("sheet().name==='Created'");
    assert.equal(await evaluate("CDBVS.state.data.sheets.length"), 6);
    assert.equal(await evaluate("document.querySelector('.text-modal-overlay')"), null);
  });
  await reset();
  await t.test("schema toolbar actions cannot bypass an invalid cell draft", async () => {
    await click("cell(0,1)"); await key("Enter"); await key("a", 2); await insert("-");
    for (const label of ["+ Sheet", "+ Column", "Types"]) {
      await click(`Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})`);
      assert.equal(await evaluate("CDBVS.modalState.active"), null);
      assert.equal(await evaluate("document.activeElement === cell(0,1).querySelector('input')"), true);
    }
    await click("document.querySelector('.sheet-edit-button')");
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    assert.equal(await evaluate("sheet().lines[0].score"), 42);
    await key("Escape");
  });
  await reset();
  await t.test("add-column and Types buttons validate drafts and apply valid changes", async () => {
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='+ Column')");
    await key("a", 2); await insert("name"); await click(modalButton("Save"));
    assert.equal(await evaluate("!!document.querySelector('.column-editor-modal')"), true);
    assert.match(await evaluate("document.querySelector('.column-form-error').textContent"), /already exists/);
    await click("document.querySelector('.column-editor-modal input')"); await key("a", 2); await insert("notes");
    await click(modalButton("Save"));
    await waitFor("!!cell(0,6)");
    assert.equal(await evaluate("sheet().columns[6].name"), "notes");
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Types')");
    await key("a", 2); await insert("{}"); await click(modalButton("Save"));
    assert.equal(await evaluate("!!document.querySelector('.types-modal')"), true);
    assert.match(await evaluate("document.querySelector('.column-form-error').textContent"), /JSON array/);
    await click("document.querySelector('.types-editor')"); await key("a", 2); await insert('[{"name":"Choice","cases":[{"name":"Only","args":[]}]}]');
    await click(modalButton("Save"));
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    assert.equal(await evaluate("CDBVS.state.data.customTypes[0].name"), "Choice");
    assert.equal(JSON.parse(await evaluate("posted.filter(m=>m.type==='update').at(-1).text")).customTypes[0].name, "Choice");
  });
  await reset();
  await t.test("confirmed sheet deletion removes the full nested block and closes its settings", async () => {
    await click("document.querySelector('.sheet-edit-button')");
    await key("a", 2); await insert("Unapplied name");
    await click(modalButton("Delete sheet"));
    await click(modalButton("Delete sheet"));
    await waitFor("sheet().name==='Other' && !!cell(0,0)");
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    assert.equal(await evaluate("document.getElementById('app').inert"), false);
    assert.deepEqual(await evaluate("CDBVS.state.data.sheets.map(s=>s.name)"), ["Other"]);
    assert.deepEqual(JSON.parse(await evaluate("posted.filter(m=>m.type==='update').at(-1).text")).sheets.map(s=>s.name), ["Other"]);
  });
  await reset();
  await t.test("nested schema column edits update embedded values and remain usable in list dialogs", async () => {
    await evaluate("window.childSchema=CDBVS.state.data.sheets.find(s=>s.name==='People@items'); CDBVS.openColumnEditor(childSchema,childSchema.columns[0],0)");
    await key("a", 2); await insert("count"); await click(modalButton("Save"));
    await waitFor("!!cell(0,4)");
    assert.equal(await evaluate("sheet().lines[0].items[0].count"), 1);
    assert.equal(await evaluate("Object.hasOwn(sheet().lines[0].items[0],'amount')"), false);
    const last = JSON.parse(await evaluate("posted.filter(m=>m.type==='update').at(-1).text"));
    assert.equal(last.sheets[0].lines[0].items[0].count, 1);
    await click("cell(0,4)"); await key("Enter");
    await waitFor("!!document.querySelector('.list-modal')");
    assert.match(await evaluate("document.querySelector('.list-modal-table thead').textContent"), /count/);
    assert.equal(await evaluate("document.querySelector('.list-modal-table td[data-column-index=\"0\"] input').value"), "1");
    await key("Escape");
  });
  await reset();
  await t.test("lossy schema conversion stays open with an error and preserves every list item", async () => {
    await evaluate("sheet().lines[0].items.push({amount:2,note:'second'}); window.schemaBefore=JSON.stringify(CDBVS.state.data); CDBVS.openColumnEditor(sheet(),sheet().columns[4],4)");
    await evaluate("{ const select=document.querySelector('.column-editor-modal select'); select.value='17'; select.dispatchEvent(new Event('change',{bubbles:true})); }");
    const updates = await evaluate("posted.filter(m=>m.type==='update').length");
    await click(modalButton("Save"));
    assert.equal(await evaluate("JSON.stringify(CDBVS.state.data)===window.schemaBefore"), true);
    assert.equal(await evaluate("posted.filter(m=>m.type==='update').length"), updates);
    assert.match(await evaluate("document.querySelector('.column-form-error').textContent"), /Cannot safely convert/);
    await evaluate("{ const select=document.querySelector('.column-editor-modal select'); select.value='8'; select.dispatchEvent(new Event('change',{bubbles:true})); }");
    await key("Escape");
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
  });
  await reset();
  await t.test("sheet settings explain ownership and prevent incompatible primary-ID choices", async () => {
    await click("document.querySelector('.sheet-edit-button')");
    assert.equal(await evaluate("Array.from(document.querySelector('.column-modal select').options).some(o=>o.value==='items'||o.value==='score')"), false);
    await key("Escape");
    await evaluate("CDBVS.openSheetEditor(CDBVS.state.data.sheets.find(s=>s.name==='People@items'))");
    assert.equal(await evaluate("document.querySelector('.column-modal input').readOnly"), true);
    assert.equal(await evaluate(`${modalButton("Delete sheet")}.disabled`), true);
    assert.match(await evaluate("document.querySelector('.column-modal').textContent"), /parent column/);
    await click(modalButton("Save"));
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    assert.equal(await evaluate("CDBVS.state.data.sheets.find(s=>s.name==='People@items').props.hide"), true);
  });
  await reset();
  await t.test("raw mode and malformed files disable table actions while retaining JSON recovery", async () => {
    await click("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).find(b=>b.textContent==='Raw JSON')");
    assert.equal(await evaluate("Array.from(document.querySelector('.toolbar').querySelectorAll('button')).filter(b=>['+ Sheet','+ Row','+ Column','Types'].includes(b.textContent)).every(b=>b.disabled)"), true);
    assert.equal(await evaluate("document.querySelector('.filter-button').disabled && document.querySelector('.search').disabled"), true);
    await evaluate("window.dispatchEvent(new MessageEvent('message',{data:{type:'document',text:'{broken',data:null,issues:['Invalid JSON'],rawMode:true,showHiddenSheets:false}}))");
    assert.equal(await evaluate("document.querySelector('.raw-editor').value"), "{broken");
    await evaluate("CDBVS.openNewSheetEditor()");
    assert.equal(await evaluate("CDBVS.modalState.active"), null);
    assert.equal(await evaluate("document.querySelector('.raw-editor').value"), "{broken");
  });
  assert.deepEqual(errors, [], "No uncaught browser errors");
});
