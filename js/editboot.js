// Edit mode boot: runs right after data/world.js, before the rest of the game.
// Opening index.html?edit (or editor.html) starts the world editor instead of the game. Unsaved edits
// live in the browser (localStorage) as a draft of the whole world file; in edit mode the draft
// replaces the world file's contents before anything is built. The game itself (no ?edit) only ever
// uses the saved data/world.js.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const EDIT_MODE = /[?&]edit\b/.test(location.search);
const EDIT_KEYS = { draft: "coastline-world-draft", undo: "coastline-world-undo", redo: "coastline-world-redo" };
const WORLD_FILE_JSON = JSON.stringify(WORLD); // the world as saved in data/world.js

// The editor's input handlers (set by editor.js). In edit mode these listeners come first, before any
// of the game's own (the pause menu, sound, the boat's controls…), and keep keys and clicks on the
// 3D view away from the game entirely.
const EDIT_HANDLERS = {};
if (EDIT_MODE) {
  document.documentElement.classList.add("editing");
  for (const t of ["keydown", "keyup", "pointerdown"])
    window.addEventListener(
      t,
      (e) => {
        const inPanel = e.target && e.target.closest && e.target.closest("#ed, #edit-recover");
        if (t === "pointerdown" && inPanel) return; // buttons and fields in the editor's panels work as usual
        e.stopImmediatePropagation(); // (typing in the panels still works: that's the browser's default action)
        if (!inPanel && EDIT_HANDLERS[t]) EDIT_HANDLERS[t](e);
      },
      true
    );
  try {
    const draft = localStorage.getItem(EDIT_KEYS.draft);
    if (draft) {
      const d = JSON.parse(draft);
      for (const k of Object.keys(WORLD)) delete WORLD[k];
      Object.assign(WORLD, d);
    }
  } catch (err) {
    console.warn("Couldn't read the editor draft", err);
  }

  // If an edit stops the world from building, offer a way back
  const showRecovery = (msg) => {
    if (document.getElementById("edit-recover")) return;
    const box = document.createElement("div");
    box.id = "edit-recover";
    box.style.cssText =
      "position:fixed;inset:auto 0 0 0;margin:auto;top:0;width:min(520px,90vw);height:fit-content;z-index:99;background:#1d2329;color:#eef;" +
      "font:14px/1.5 system-ui,sans-serif;padding:20px 22px;border-radius:12px;box-shadow:0 10px 40px #0008";
    box.innerHTML =
      `<b>The world couldn't be built with the last change.</b><div style="opacity:.75;margin:6px 0 14px;word-break:break-word">${msg}</div>` +
      `<button data-r="undo">Undo the last change</button> <button data-r="discard">Discard all unsaved changes</button>`;
    box.addEventListener("click", (e) => {
      const r = e.target.dataset && e.target.dataset.r;
      if (!r) return;
      if (r === "undo") {
        const undo = JSON.parse(localStorage.getItem(EDIT_KEYS.undo) || "[]");
        const prev = undo.pop();
        if (prev) localStorage.setItem(EDIT_KEYS.draft, prev);
        else localStorage.removeItem(EDIT_KEYS.draft);
        localStorage.setItem(EDIT_KEYS.undo, JSON.stringify(undo));
      } else localStorage.removeItem(EDIT_KEYS.draft);
      location.reload();
    });
    for (const b of box.querySelectorAll("button"))
      b.style.cssText = "font:inherit;padding:7px 12px;border-radius:7px;border:0;background:#3d6f9e;color:#fff;cursor:pointer;margin-right:6px";
    (document.body || document.documentElement).appendChild(box);
  };
  window.addEventListener("error", (e) => {
    if (!window.editorReady) showRecovery(e.message || "Unknown error");
  });
}
