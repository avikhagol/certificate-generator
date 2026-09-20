/*
 * Certificate Generator — project save / load / autosave.
 *
 * Self-contained, zero dependency, no network. Loaded BEFORE assets/app.js;
 * app.js calls window.CertificateProjectIO.attach(api) once with a small,
 * clearly scoped bridge into its private `state` and render functions.
 *
 * Project file format (.certproj.json):
 * {
 *   "schema": "certificate-generator.project",
 *   "version": 1,
 *   "app": "Certificate Generator",
 *   "savedAt": "<ISO 8601>",
 *   "design":  { "width": 1200, "height": 848 },
 *   "records": [ { "<key>": "<value>", ... } ],
 *   "currentRecord": 0,
 *   "selectedField": "name" | null,
 *   "exportQuality": "normal" | "high" | "xhigh",
 *   "fields":  [ { id, text, x, y, width, size, weight, font, color, align } ],
 *   "images":  [ { id, name, x, y, width, height, opacity,
 *                  crop: { x, y, width, height } | null,
 *                  sourceSrc: "data:image/...;base64,..." } ],
 *   "background": { name, sourceSrc: "data:..." | null,
 *                   crop: { x, y, width, height } | null },
 *   "fonts":   [ { family, displayName, fileName, data: "<base64 font file>" } ]
 * }
 *
 * Cropped bitmaps are NOT stored twice: only the original source image plus the
 * crop rectangle are written, and the cropped bitmap is re-derived on load.
 */
(() => {
  "use strict";

  const SCHEMA = "certificate-generator.project";
  const VERSION = 1;
  const FILE_SUFFIX = ".certproj.json";
  const LARGE_FILE_BYTES = 12 * 1024 * 1024;   // warn the user above this
  const AUTOSAVE_MAX_BYTES = 80 * 1024 * 1024; // refuse to autosave beyond this
  const AUTOSAVE_INTERVAL_MS = 4000;
  const DB_NAME = "certificate-generator";
  const DB_VERSION = 1;
  const STORE = "autosave";
  const AUTOSAVE_KEY = "current";

  let api = null;              // bridge supplied by app.js
  let autosaveTimer = null;
  let autosaveEnabled = false;
  let lastSignature = null;
  let restoreDecisionPending = false;

  /* ------------------------------------------------------------------ utils */

  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

  function bytesToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(String(base64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function toast(message, isError = false) {
    if (api && typeof api.showToast === "function") api.showToast(message, isError);
    else if (isError) console.error(message);
  }

  function normalizeCropRect(crop) {
    if (!isObject(crop)) return null;
    const rect = { x: num(crop.x), y: num(crop.y), width: num(crop.width), height: num(crop.height) };
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    return rect;
  }

  /** Re-derive a cropped bitmap (data URL) from a source image + crop rect. */
  function croppedDataUrl(image, crop) {
    const width = Math.max(1, Math.round(crop.width));
    const height = Math.max(1, Math.round(crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  }

  /* -------------------------------------------------------------- serialize */

  function serializeFonts(customFonts) {
    return (customFonts || []).map((font) => {
      let data = null;
      if (typeof font.data === "string") data = font.data;
      else if (font.data instanceof ArrayBuffer) data = bytesToBase64(font.data);
      else if (ArrayBuffer.isView(font.data)) data = bytesToBase64(font.data.buffer);
      return {
        family: String(font.family || ""),
        displayName: String(font.displayName || font.family || "Custom font"),
        fileName: String(font.fileName || ""),
        data
      };
    }).filter((font) => font.family && font.data);
  }

  /** Build the plain, JSON-safe project object from the live editor state. */
  function serializeProject() {
    if (!api) throw new Error("Project IO is not attached to the editor yet.");
    const { state, DESIGN } = api;
    return {
      schema: SCHEMA,
      version: VERSION,
      app: "Certificate Generator",
      savedAt: new Date().toISOString(),
      design: { width: DESIGN.width, height: DESIGN.height },
      records: JSON.parse(JSON.stringify(state.records || [])),
      currentRecord: num(state.currentRecord, 0),
      selectedField: state.selectedField ?? null,
      exportQuality: state.exportQuality || "xhigh",
      fields: (state.fields || []).map((item) => ({
        id: item.id, text: item.text, x: item.x, y: item.y, width: item.width,
        size: item.size, weight: item.weight, font: item.font, color: item.color, align: item.align
      })),
      images: (state.images || []).map((item) => ({
        id: item.id,
        name: item.name,
        x: item.x, y: item.y, width: item.width, height: item.height,
        opacity: item.opacity,
        crop: normalizeCropRect(item.crop),
        sourceSrc: item.sourceSrc || item.src || null
      })).filter((item) => item.sourceSrc),
      background: {
        name: state.backgroundName || "Sample template",
        sourceSrc: state.backgroundSourceSrc || null,
        crop: normalizeCropRect(state.backgroundCrop)
      },
      fonts: serializeFonts(state.customFonts)
    };
  }

  /* ---------------------------------------------------------------- validate */

  /** Throws Error with a human readable message when `data` is not a project. */
  function validateProject(data) {
    if (!isObject(data)) throw new Error("That file is not a Certificate Generator project.");
    if (data.schema !== SCHEMA) throw new Error("That file is not a Certificate Generator project.");
    const version = Number(data.version);
    if (!Number.isInteger(version) || version < 1) throw new Error("This project file has an invalid version number.");
    if (version > VERSION) throw new Error(`This project was saved by a newer version (v${version}). Update the app to open it.`);
    if (!Array.isArray(data.fields) || data.fields.length === 0) throw new Error("This project file has no text fields.");
    if (!Array.isArray(data.records) || data.records.length === 0) throw new Error("This project file has no recipient records.");
    if (data.images && !Array.isArray(data.images)) throw new Error("This project file has a damaged picture layer list.");
    if (data.fonts && !Array.isArray(data.fonts)) throw new Error("This project file has a damaged font list.");
    if (!isObject(data.design) || !(num(data.design.width) > 0) || !(num(data.design.height) > 0)) {
      throw new Error("This project file has invalid canvas dimensions.");
    }
    data.fields.forEach((item, index) => {
      if (!isObject(item) || typeof item.id !== "string" || typeof item.text !== "string") {
        throw new Error(`Text field ${index + 1} in this project file is damaged.`);
      }
    });
    data.records.forEach((record, index) => {
      if (!isObject(record)) throw new Error(`Record ${index + 1} in this project file is damaged.`);
    });
    return true;
  }

  function sanitizeField(item) {
    return {
      id: String(item.id),
      text: String(item.text),
      x: num(item.x), y: num(item.y),
      width: Math.max(1, num(item.width, 200)),
      size: Math.max(1, num(item.size, 32)),
      weight: num(item.weight, 400),
      font: String(item.font || "Georgia"),
      color: /^#[0-9a-f]{6}$/i.test(String(item.color)) ? String(item.color) : "#17223b",
      align: ["left", "center", "right"].includes(item.align) ? item.align : "center"
    };
  }

  /* ------------------------------------------------------------------- fonts */

  async function restoreFonts(fonts) {
    if (!api) return [];
    const { state, els } = api;
    const restored = [];
    for (const entry of fonts || []) {
      if (!isObject(entry) || !entry.family || !entry.data) continue;
      try {
        const bytes = base64ToBytes(entry.data);
        const fontFace = new FontFace(entry.family, bytes.buffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        restored.push({
          family: entry.family,
          displayName: entry.displayName || entry.family,
          fileName: entry.fileName || "",
          fontFace,
          data: entry.data
        });
      } catch (error) {
        console.warn("Custom font could not be restored", entry.family, error);
      }
    }
    state.customFonts = restored;
    // Rebuild the custom entries of the font <select> without touching built-ins.
    els.fieldFont.querySelectorAll("option[data-custom-font]").forEach((option) => option.remove());
    restored.forEach((font) => {
      const option = document.createElement("option");
      option.value = font.family;
      option.textContent = `${font.displayName} · custom`;
      option.dataset.customFont = "1";
      els.fieldFont.append(option);
    });
    return restored;
  }

  /* ---------------------------------------------------------------- apply */

  /** Restore a validated project object into the live editor. */
  async function applyProject(data) {
    validateProject(data);
    const { state, els, setDesignSize, renderAll, loadImage } = api;

    const fonts = Array.isArray(data.fonts) ? data.fonts : [];
    const missingFonts = await restoreFonts(fonts);

    // Background ------------------------------------------------------------
    let backgroundSourceImage = null;
    let backgroundImage = null;
    let backgroundCrop = null;
    const background = isObject(data.background) ? data.background : {};
    if (background.sourceSrc) {
      backgroundSourceImage = await loadImage(background.sourceSrc);
      backgroundCrop = normalizeCropRect(background.crop);
      backgroundImage = backgroundCrop
        ? await loadImage(croppedDataUrl(backgroundSourceImage, backgroundCrop))
        : backgroundSourceImage;
    }

    // Picture layers --------------------------------------------------------
    const images = [];
    for (const entry of Array.isArray(data.images) ? data.images : []) {
      if (!isObject(entry) || !entry.sourceSrc) continue;
      try {
        const sourceImage = await loadImage(entry.sourceSrc);
        const crop = normalizeCropRect(entry.crop);
        const src = crop ? croppedDataUrl(sourceImage, crop) : entry.sourceSrc;
        const image = crop ? await loadImage(src) : sourceImage;
        images.push({
          id: String(entry.id || `image-${Date.now()}-${images.length}`),
          name: String(entry.name || "Picture"),
          src, image, sourceSrc: entry.sourceSrc, sourceImage,
          x: num(entry.x), y: num(entry.y),
          width: Math.max(1, num(entry.width, 100)),
          height: Math.max(1, num(entry.height, 100)),
          opacity: Math.min(1, Math.max(0, num(entry.opacity, 1))),
          crop
        });
      } catch (error) {
        console.warn("Picture layer could not be restored", entry.id, error);
      }
    }

    // Canvas size: clear layers first so setDesignSize does not rescale them,
    // because saved coordinates are already in the saved design space.
    state.fields = [];
    state.images = [];
    setDesignSize(num(data.design.width, 1200), num(data.design.height, 848));

    state.fields = data.fields.map(sanitizeField);
    state.images = images;
    state.records = JSON.parse(JSON.stringify(data.records));
    state.currentRecord = Math.min(Math.max(0, num(data.currentRecord, 0)), state.records.length - 1);
    state.backgroundImage = backgroundImage;
    state.backgroundSourceImage = backgroundSourceImage;
    state.backgroundSourceSrc = background.sourceSrc || null;
    state.backgroundCrop = backgroundCrop;
    state.backgroundName = String(background.name || (backgroundSourceImage ? "Project background" : "Sample template"));
    state.exportQuality = ["normal", "high", "xhigh"].includes(data.exportQuality) ? data.exportQuality : "xhigh";
    state.interaction = null;
    state.cropSession = null;
    const allIds = [...state.fields, ...state.images].map((item) => item.id);
    state.selectedField = allIds.includes(data.selectedField) ? data.selectedField : (state.fields[0]?.id ?? null);

    if (els.exportQuality) els.exportQuality.value = state.exportQuality;
    renderAll();
    lastSignature = signature();
    return { fields: state.fields.length, images: state.images.length, records: state.records.length, fonts: missingFonts.length };
  }

  /* ------------------------------------------------------------------- save */

  function suggestedFilename() {
    const base = (api?.state.backgroundName || "certificate-project")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "certificate-project";
    const stamp = new Date().toISOString().slice(0, 10);
    return `${base}-${stamp}${FILE_SUFFIX}`;
  }

  function saveProjectFile() {
    try {
      const data = serializeProject();
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: "application/json" });
      if (blob.size > LARGE_FILE_BYTES) {
        toast(`Saving a large project (${formatBytes(blob.size)}) — nothing is truncated, but it may take a moment.`);
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedFilename();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (blob.size <= LARGE_FILE_BYTES) toast(`Project saved · ${formatBytes(blob.size)}`);
      return blob.size;
    } catch (error) {
      console.error("Project save failed", error);
      toast("The project could not be saved.", true);
      return 0;
    }
  }

  async function loadProjectFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text.replace(/^\uFEFF/, ""));
      } catch (error) {
        throw new Error("That file is not valid JSON.");
      }
      const summary = await applyProject(data);
      toast(`Project loaded · ${summary.fields} text, ${summary.images} picture, ${summary.records} records`);
      scheduleAutosave(true);
    } catch (error) {
      console.error("Project load failed", error);
      toast(error.message || "That project file could not be opened.", true);
    }
  }

  /* --------------------------------------------------------------- IndexedDB */

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window) || !window.indexedDB) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened"));
      request.onblocked = () => reject(new Error("IndexedDB is blocked"));
    });
  }

  function dbRequest(mode, work) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        const request = work(store);
        if (request) request.onsuccess = () => { result = request.result; };
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("IndexedDB transaction failed")); };
    }));
  }

  const readAutosave = () => dbRequest("readonly", (store) => store.get(AUTOSAVE_KEY));
  const writeAutosave = (record) => dbRequest("readwrite", (store) => store.put(record, AUTOSAVE_KEY));
  const deleteAutosave = () => dbRequest("readwrite", (store) => store.delete(AUTOSAVE_KEY));

  /* ---------------------------------------------------------------- autosave */

  /** Cheap change detector: skips the multi-megabyte data URLs. */
  function signature() {
    const { state, DESIGN } = api;
    return JSON.stringify([
      DESIGN.width, DESIGN.height,
      state.records, state.currentRecord, state.selectedField, state.exportQuality,
      state.fields,
      state.images.map((item) => [item.id, item.name, item.x, item.y, item.width, item.height, item.opacity, item.crop, (item.sourceSrc || "").length]),
      state.backgroundName, (state.backgroundSourceSrc || "").length, state.backgroundCrop,
      state.customFonts.map((font) => font.family)
    ]);
  }

  async function runAutosave(force = false) {
    if (!api || (!autosaveEnabled && !force)) return;
    let current;
    try {
      current = signature();
    } catch (error) {
      return;
    }
    if (!force && current === lastSignature) return;
    try {
      const data = serializeProject();
      const approximate = JSON.stringify(data).length;
      if (approximate > AUTOSAVE_MAX_BYTES) {
        lastSignature = current;
        console.warn("Autosave skipped: project too large", approximate);
        return;
      }
      await writeAutosave({ savedAt: Date.now(), bytes: approximate, project: data });
      lastSignature = current;
    } catch (error) {
      console.warn("Autosave unavailable", error);
      autosaveEnabled = false;      // quota exceeded / private mode / blocked
      if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
    }
  }

  function scheduleAutosave(immediate = false) {
    autosaveEnabled = true;
    if (!autosaveTimer) autosaveTimer = setInterval(() => { runAutosave(); }, AUTOSAVE_INTERVAL_MS);
    if (immediate) runAutosave(true);
  }

  /* ------------------------------------------------------------ restore UI */

  function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "moments ago";
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
    return `${Math.round(seconds / 86400)} days ago`;
  }

  function hideBanner(banner) {
    banner.hidden = true;
    restoreDecisionPending = false;
  }

  async function offerRestore() {
    const banner = document.getElementById("restoreBanner");
    const meta = document.getElementById("restoreBannerMeta");
    const applyButton = document.getElementById("restoreApplyButton");
    const dismissButton = document.getElementById("restoreDismissButton");
    const discardButton = document.getElementById("restoreDiscardButton");
    if (!banner || !applyButton) { scheduleAutosave(); return; }

    let record = null;
    try {
      record = await readAutosave();
    } catch (error) {
      console.warn("Autosave restore point unavailable", error);
      return; // IndexedDB unusable: no autosave, app keeps working
    }
    if (!record || !isObject(record.project)) { scheduleAutosave(); return; }

    try {
      validateProject(record.project);
    } catch (error) {
      console.warn("Discarding damaged restore point", error);
      deleteAutosave().catch(() => {});
      scheduleAutosave();
      return;
    }

    restoreDecisionPending = true;
    const size = record.bytes ? ` · ${formatBytes(record.bytes)}` : "";
    if (meta) meta.textContent = `Autosaved ${relativeTime(record.savedAt || Date.now())}${size}`;
    banner.hidden = false;

    applyButton.addEventListener("click", async () => {
      hideBanner(banner);
      try {
        const summary = await applyProject(record.project);
        toast(`Last design restored · ${summary.fields} text, ${summary.images} picture layers`);
      } catch (error) {
        console.error("Restore failed", error);
        toast("The autosaved design could not be restored.", true);
      }
      scheduleAutosave(true);
    }, { once: true });

    dismissButton?.addEventListener("click", () => {
      hideBanner(banner);
      toast("Restore point kept — it stays available until you save over it.");
      // Deliberately do NOT start autosaving: keep the restore point intact
      // for this session unless the user changes something later.
      scheduleAutosave();
    }, { once: true });

    discardButton?.addEventListener("click", async () => {
      hideBanner(banner);
      try {
        await deleteAutosave();
        toast("Restore point discarded");
      } catch (error) {
        toast("The restore point could not be discarded.", true);
      }
      scheduleAutosave();
    }, { once: true });
  }

  /* ------------------------------------------------------------------ attach */

  function attach(bridge) {
    api = bridge;
    const saveButton = document.getElementById("saveProjectButton");
    const loadInput = document.getElementById("loadProjectInput");
    saveButton?.addEventListener("click", () => saveProjectFile());
    loadInput?.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      await loadProjectFile(file);
      event.target.value = "";
    });
    try { lastSignature = signature(); } catch (error) { lastSignature = null; }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && autosaveEnabled && !restoreDecisionPending) runAutosave();
    });
    window.addEventListener("pagehide", () => {
      if (autosaveEnabled && !restoreDecisionPending) runAutosave();
    });
    offerRestore().catch((error) => console.warn("Restore prompt failed", error));
  }

  window.CertificateProjectIO = {
    SCHEMA, VERSION, FILE_SUFFIX,
    attach,
    serializeProject,
    validateProject,
    applyProject,
    saveProjectFile,
    loadProjectFile,
    autosaveNow: () => runAutosave(true),
    readAutosave,
    discardAutosave: deleteAutosave
  };
})();
