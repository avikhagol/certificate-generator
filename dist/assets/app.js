(() => {
  "use strict";

  const DESIGN = { width: 1200, height: 848 };
  const QUALITY_PRESETS = {
    normal: { label: "Normal", scale: 1, jpegQuality: 0.92 },
    high: { label: "High", scale: 2, jpegQuality: 0.97 },
    xhigh: { label: "XHigh", scale: 3, jpegQuality: 1 }
  };
  const sampleRecords = [
    { name: "Avinash Kumar", course: "Discovery Camp", date: "19 September 2026", organization: "RAD@home India" },
    { name: "Lorem Ipsum", course: "Discovery Camp", date: "19 September 2026", organization: "RAD@home India" },
    { name: "Name Surname", course: "Discovery Camp", date: "19 September 2026", organization: "RAD@home India" }
  ];

  const sampleFields = [
    field("organization", "{{organization}}", 160, 85, 880, 22, 600, "Arial", "#9a702c", "center"),
    field("title", "CERTIFICATE\nOF ACHIEVEMENT", 160, 170, 880, 66, 700, "Georgia", "#17223b", "center"),
    field("intro", "PROUDLY PRESENTED TO", 250, 337, 700, 20, 600, "Arial", "#8d7245", "center"),
    field("name", "{{name}}", 140, 395, 920, 72, 400, "Georgia", "#b57d25", "center"),
    field("body", "For successfully completing {{course}}", 220, 515, 760, 27, 400, "Georgia", "#2a354d", "center"),
    field("date", "Awarded on {{date}}", 280, 576, 640, 21, 400, "Arial", "#657087", "center")
  ];

  function field(id, text, x, y, width, size, weight, font, color, align, rotation = 0) {
    return { id, text, x, y, width, size, weight, font, color, align, rotation: normalizeRotation(rotation) };
  }

  const state = {
    records: structuredClone(sampleRecords),
    fields: structuredClone(sampleFields),
    images: [],
    currentRecord: 0,
    selectedField: "name",
    backgroundImage: null,
    backgroundSourceImage: null,
    backgroundSourceSrc: null,
    backgroundCrop: null,
    backgroundName: "Sample template",
    exportQuality: "xhigh",
    customFonts: [],
    scale: 1,
    interaction: null,
    cropSession: null
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    stage: $("certificateStage"), stageViewport: $("stageViewport"), shell: $("canvasShell"), background: $("backgroundCanvas"), fieldLayer: $("fieldLayer"),
    dataUpload: $("dataUpload"), backgroundUpload: $("backgroundUpload"), imageElementUpload: $("imageElementUpload"), replaceImageUpload: $("replaceImageUpload"), fontUpload: $("fontUpload"), clearBackground: $("clearBackgroundButton"), cropBackground: $("cropBackgroundButton"), cropImage: $("cropImageButton"),
    recordCount: $("recordCount"), recordPosition: $("recordPosition"), recordSelect: $("recordSelect"), recordDetails: $("recordDetails"), chips: $("placeholderChips"),
    previousRecord: $("previousRecord"), nextRecord: $("nextRecord"), sampleData: $("sampleDataButton"),
    fieldList: $("fieldList"), addField: $("addFieldButton"), deleteField: $("deleteFieldButton"), selectedLayerLabel: $("selectedLayerLabel"),
    fieldForm: $("fieldForm"), fieldText: $("fieldText"), fieldFont: $("fieldFont"), fontStatus: $("fontStatus"), fieldSize: $("fieldSize"), fieldWeight: $("fieldWeight"), fieldColor: $("fieldColor"), fieldColorText: $("fieldColorText"),
    fieldX: $("fieldX"), fieldY: $("fieldY"), fieldWidth: $("fieldWidth"), fieldRotation: $("fieldRotation"), alignment: $("alignmentControl"),
    imageForm: $("imageForm"), imageLayerPreview: $("imageLayerPreview"), imageX: $("imageX"), imageY: $("imageY"), imageWidth: $("imageWidth"), imageRotation: $("imageRotation"), imageOpacity: $("imageOpacity"), imageOpacityValue: $("imageOpacityValue"),
    zoomLabel: $("zoomLabel"), exportQuality: $("exportQuality"), exportSummary: $("exportSummary"), reset: $("resetButton"), downloadPng: $("downloadPngButton"), downloadPdf: $("downloadPdfButton"), batch: $("batchButton"),
    toast: $("toast"), progress: $("progressOverlay"), progressTitle: $("progressTitle"), progressText: $("progressText"), progressBar: $("progressBar"),
    cropDialog: $("cropDialog"), cropDialogTitle: $("cropDialogTitle"), cropCanvas: $("cropCanvas"), cropAspect: $("cropAspect"), cropX: $("cropX"), cropY: $("cropY"), cropWidth: $("cropWidth"), cropHeight: $("cropHeight"), cropReset: $("cropResetButton"), cropApply: $("cropApplyButton")
  };

  const bgCtx = els.background.getContext("2d");
  const cropCtx = els.cropCanvas.getContext("2d");
  // Offscreen context used only to measure text, so the pivot a rotated text
  // layer turns around is identical in the DOM preview and the canvas export.
  const measureCtx = document.createElement("canvas").getContext("2d");
  const ROTATE_HANDLE_GAP = 30; // px the rotate handle needs above a layer
  let toastTimer;

  /** Fold any angle into [-180, 180) so the number input never runs away. */
  function normalizeRotation(value) {
    const degrees = Number(value);
    if (!Number.isFinite(degrees)) return 0;
    return Math.round((((degrees % 360) + 540) % 360 - 180) * 10) / 10;
  }

  /** Height of the wrapped text block, using the same wrap as the export. */
  function textBlockHeight(item, text) {
    measureCtx.font = `${item.weight} ${item.size}px "${item.font}"`;
    const lines = wrapText(measureCtx, text, item.width);
    return Math.max(1, lines.length) * item.size * 1.12;
  }

  /** Half-height of a layer: the vertical offset of its rotation pivot. */
  function pivotOffsetY(item, isImage, text) {
    if (isImage) return item.height / 2;
    const record = state.records[state.currentRecord] || {};
    return textBlockHeight(item, text ?? resolveText(item.text, record)) / 2;
  }

  /** Design-space point a layer rotates around: the centre of its own box. */
  function itemPivot(item, isImage) {
    return { x: item.x + item.width / 2, y: item.y + pivotOffsetY(item, isImage) };
  }

  /** Inline CSS that turns the preview node around the very same pivot. */
  function rotationStyle(item, offsetY) {
    const rotation = normalizeRotation(item.rotation);
    if (!rotation) return "";
    return `transform:rotate(${rotation}deg);transform-origin:${item.width / 2}px ${offsetY}px;`;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function drawDefaultTemplate(ctx) {
    const { width: w, height: h } = DESIGN;
    ctx.save();
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, "#fffdf7");
    wash.addColorStop(0.55, "#fffaf0");
    wash.addColorStop(1, "#f7eedc");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(234,191,112,.10)";
    for (let y = 0; y < h; y += 24) {
      for (let x = (y / 24) % 2 ? 12 : 0; x < w; x += 24) ctx.fillRect(x, y, 1.2, 1.2);
    }

    ctx.strokeStyle = "#17223b";
    ctx.lineWidth = 5;
    ctx.strokeRect(35, 35, w - 70, h - 70);
    ctx.strokeStyle = "#d4a34f";
    ctx.lineWidth = 2;
    ctx.strokeRect(49, 49, w - 98, h - 98);
    ctx.strokeStyle = "rgba(23,34,59,.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(59, 59, w - 118, h - 118);

    drawCorner(ctx, 61, 61, 1, 1);
    drawCorner(ctx, w - 61, 61, -1, 1);
    drawCorner(ctx, 61, h - 61, 1, -1);
    drawCorner(ctx, w - 61, h - 61, -1, -1);

    ctx.strokeStyle = "#d4a34f";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(395, 655); ctx.lineTo(515, 655); ctx.moveTo(685, 655); ctx.lineTo(805, 655); ctx.stroke();
    ctx.fillStyle = "#59657b";
    ctx.font = "15px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PROGRAM DIRECTOR", 455, 682);
    ctx.fillText("COURSE LEAD", 745, 682);

    ctx.beginPath();
    ctx.arc(600, 708, 42, 0, Math.PI * 2);
    ctx.strokeStyle = "#d4a34f";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(600, 708, 33, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#17223b";
    ctx.font = "bold 24px Georgia";
    ctx.fillText("N", 600, 716);
    ctx.restore();
  }

  function drawCorner(ctx, x, y, sx, sy) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    ctx.strokeStyle = "#d4a34f"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 72); ctx.quadraticCurveTo(8, 25, 72, 0); ctx.stroke();
    ctx.strokeStyle = "rgba(23,34,59,.45)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 47); ctx.quadraticCurveTo(12, 15, 47, 0); ctx.stroke();
    ctx.restore();
  }

  function drawBackground(ctx) {
    ctx.clearRect(0, 0, DESIGN.width, DESIGN.height);
    if (state.backgroundImage) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, DESIGN.width, DESIGN.height);
      ctx.drawImage(state.backgroundImage, 0, 0, DESIGN.width, DESIGN.height);
    } else {
      drawDefaultTemplate(ctx);
    }
  }

  function resolveText(template, record) {
    return String(template).replace(/{{\s*([^}]+?)\s*}}/g, (_, key) => record[key] ?? "");
  }

  function setDesignSize(width, height) {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    const ratioX = nextWidth / DESIGN.width;
    const ratioY = nextHeight / DESIGN.height;
    const sizeRatio = Math.min(ratioX, ratioY);
    [...state.fields, ...state.images].forEach((item) => {
      item.x *= ratioX;
      item.y *= ratioY;
      item.width *= ratioX;
      if ("height" in item) item.height *= ratioY;
      if ("size" in item) item.size *= sizeRatio;
    });
    DESIGN.width = nextWidth;
    DESIGN.height = nextHeight;
    els.background.width = nextWidth;
    els.background.height = nextHeight;
    els.stage.style.width = `${nextWidth}px`;
    els.stage.style.height = `${nextHeight}px`;
    els.fieldX.max = nextWidth;
    els.fieldY.max = nextHeight;
    els.fieldWidth.max = nextWidth;
    els.imageX.max = nextWidth;
    els.imageY.max = nextHeight;
    els.imageWidth.max = nextWidth;
  }

  function getSelectedField() { return state.fields.find((item) => item.id === state.selectedField); }
  function getSelectedImage() { return state.images.find((item) => item.id === state.selectedField); }
  function getSelectedItem() { return getSelectedField() || getSelectedImage(); }

  function renderAll() {
    els.cropBackground.disabled = !state.backgroundSourceImage;
    drawBackground(bgCtx);
    renderData();
    renderFields();
    renderFieldList();
    populateForm();
    fitStage();
  }

  function renderData() {
    state.currentRecord = Math.max(0, Math.min(state.currentRecord, state.records.length - 1));
    const count = state.records.length;
    els.recordCount.textContent = `${count} ${count === 1 ? "record" : "records"}`;
    els.recordPosition.textContent = `${state.currentRecord + 1} / ${count}`;
    const preset = currentQualityPreset();
    const dimensions = `${DESIGN.width * preset.scale} × ${DESIGN.height * preset.scale}`;
    els.exportSummary.textContent = `${count} ${count === 1 ? "certificate" : "certificates"} · ${preset.label} · ${dimensions}`;
    els.recordSelect.replaceChildren(...state.records.map((record, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = record.name || record[Object.keys(record)[0]] || `Record ${index + 1}`;
      option.selected = index === state.currentRecord;
      return option;
    }));
    const record = state.records[state.currentRecord] || {};
    els.recordDetails.replaceChildren(...Object.entries(record).map(([key, value]) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      const cell = document.createElement("td");
      heading.scope = "row"; heading.textContent = key; cell.textContent = value;
      row.append(heading, cell); return row;
    }));
    const keys = uniqueKeys();
    els.chips.replaceChildren(...keys.map((key) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "chip"; button.textContent = `{{${key}}}`;
      button.addEventListener("click", () => insertPlaceholder(key));
      return button;
    }));
  }

  function uniqueKeys() {
    return [...new Set(state.records.flatMap((record) => Object.keys(record)))];
  }

  function renderFields() {
    const record = state.records[state.currentRecord] || {};
    const fragment = document.createDocumentFragment();
    state.images.forEach((item) => {
      const node = document.createElement("div");
      node.className = `canvas-field image-field${item.id === state.selectedField ? " selected" : ""}`;
      node.dataset.id = item.id;
      node.style.cssText = `left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px;opacity:${item.opacity};${rotationStyle(item, item.height / 2)}`;
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = "";
      node.append(image, resizeHandle(), rotateHandle(item));
      node.addEventListener("pointerdown", startFieldInteraction);
      fragment.append(node);
    });
    state.fields.forEach((item) => {
      const node = document.createElement("div");
      node.className = `canvas-field${item.id === state.selectedField ? " selected" : ""}`;
      node.dataset.id = item.id;
      const resolved = resolveText(item.text, record);
      node.style.cssText = `left:${item.x}px;top:${item.y}px;width:${item.width}px;font:${item.weight} ${item.size}px/${1.12} "${item.font}";color:${item.color};text-align:${item.align};justify-content:${alignToFlex(item.align)};${rotationStyle(item, pivotOffsetY(item, false, resolved))}`;
      const text = document.createElement("span");
      text.style.width = "100%";
      text.textContent = resolved;
      node.append(text, resizeHandle(), rotateHandle(item));
      node.addEventListener("pointerdown", startFieldInteraction);
      fragment.append(node);
    });
    els.fieldLayer.replaceChildren(fragment);
  }

  function resizeHandle() {
    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.setAttribute("aria-hidden", "true");
    return handle;
  }

  /**
   * The stage clips overflow, so a handle sitting above a layer near the top
   * edge would be unreachable. Flip it under the layer in that case.
   */
  function rotateHandle(item) {
    const handle = document.createElement("span");
    handle.className = item.y < ROTATE_HANDLE_GAP ? "rotate-handle below" : "rotate-handle";
    handle.title = "Drag to rotate · hold Shift to snap to 15°";
    handle.setAttribute("aria-hidden", "true");
    return handle;
  }

  function alignToFlex(align) { return align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"; }

  function renderFieldList() {
    const imageButtons = state.images.map((item, index) => createLayerButton(item, "image", index));
    const textButtons = state.fields.map((item, index) => createLayerButton(item, "text", index));
    els.fieldList.replaceChildren(...imageButtons, ...textButtons);
  }

  function createLayerButton(item, type, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `layer-button${item.id === state.selectedField ? " selected" : ""}`;
      button.dataset.id = item.id;
      const icon = document.createElement("span"); icon.className = "layer-icon"; icon.textContent = type === "image" ? "▧" : "T";
      const copy = document.createElement("span"); copy.className = "layer-copy";
      const title = document.createElement("strong"); title.textContent = type === "image" ? item.name : displayFieldName(item, index);
      const base = type === "image" ? `${Math.round(item.width)} × ${Math.round(item.height)} px` : item.text.replace(/\n/g, " ");
      const angle = normalizeRotation(item.rotation);
      const subtitle = document.createElement("span"); subtitle.textContent = angle ? `${base} · ${angle}°` : base;
      copy.append(title, subtitle); button.append(icon, copy);
      button.addEventListener("click", () => selectField(item.id));
      return button;
  }

  function displayFieldName(item, index) {
    const match = item.text.match(/{{\s*([^}]+)\s*}}/);
    if (match) return match[1].replace(/\b\w/g, (char) => char.toUpperCase());
    const plain = item.text.replace(/\n/g, " ").trim();
    return plain.slice(0, 28) || `Text ${index + 1}`;
  }

  function populateForm() {
    const textItem = getSelectedField();
    const imageItem = getSelectedImage();
    els.fieldForm.toggleAttribute("hidden", !textItem);
    els.imageForm.toggleAttribute("hidden", !imageItem);
    els.deleteField.disabled = !textItem && !imageItem;
    els.selectedLayerLabel.textContent = imageItem ? "Selected picture" : "Selected text";
    if (textItem) {
      els.fieldText.value = textItem.text;
      els.fieldFont.value = textItem.font;
      els.fieldSize.value = textItem.size;
      els.fieldWeight.value = textItem.weight;
      els.fieldColor.value = textItem.color;
      els.fieldColorText.value = textItem.color;
      els.fieldX.value = Math.round(textItem.x);
      els.fieldY.value = Math.round(textItem.y);
      els.fieldWidth.value = Math.round(textItem.width);
      els.fieldRotation.value = normalizeRotation(textItem.rotation);
      els.alignment.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.align === textItem.align));
    }
    if (imageItem) {
      els.imageLayerPreview.src = imageItem.src;
      els.imageX.value = Math.round(imageItem.x);
      els.imageY.value = Math.round(imageItem.y);
      els.imageWidth.value = Math.round(imageItem.width);
      els.imageRotation.value = normalizeRotation(imageItem.rotation);
      els.imageOpacity.value = Math.round(imageItem.opacity * 100);
      els.imageOpacityValue.textContent = `${Math.round(imageItem.opacity * 100)}%`;
    }
  }

  function selectField(id) {
    state.selectedField = id;
    renderFields(); renderFieldList(); populateForm();
  }

  function updateSelected(key, value) {
    const item = getSelectedItem();
    if (!item) return;
    item[key] = value;
    renderFields(); renderFieldList();
  }

  function insertPlaceholder(key) {
    const item = getSelectedField();
    if (!item) { showToast("Select a text field first"); return; }
    const token = `{{${key}}}`;
    const start = els.fieldText.selectionStart ?? item.text.length;
    const end = els.fieldText.selectionEnd ?? start;
    item.text = item.text.slice(0, start) + token + item.text.slice(end);
    renderFields(); renderFieldList(); populateForm();
    els.fieldText.focus();
    els.fieldText.setSelectionRange(start + token.length, start + token.length);
  }

  function fitStage() {
    const availableWidth = Math.max(260, els.shell.clientWidth - 68);
    const availableHeight = Math.max(220, els.shell.clientHeight - 68);
    state.scale = Math.min(1, availableWidth / DESIGN.width, availableHeight / DESIGN.height);
    els.stage.style.transform = `scale(${state.scale})`;
    els.stageViewport.style.width = `${DESIGN.width * state.scale}px`;
    els.stageViewport.style.height = `${DESIGN.height * state.scale}px`;
    els.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function startFieldInteraction(event) {
    const id = event.currentTarget.dataset.id;
    if (state.selectedField !== id) {
      state.selectedField = id;
      els.fieldLayer.querySelectorAll(".canvas-field").forEach((node) => node.classList.toggle("selected", node.dataset.id === id));
      renderFieldList(); populateForm();
    }
    const item = getSelectedItem();
    const isImage = Boolean(getSelectedImage());
    const resizing = event.target.classList.contains("resize-handle");
    const rotating = event.target.classList.contains("rotate-handle");
    state.interaction = {
      id, isImage, resizing, rotating, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: item.x, y: item.y, width: item.width, height: item.height, size: item.size,
      rotation: normalizeRotation(item.rotation)
    };
    if (rotating) {
      // Anchor the drag to the layer's own pivot, in client coordinates, so the
      // angle follows the pointer no matter how the stage is zoomed.
      const pivot = itemPivot(item, isImage);
      const stageRect = els.stage.getBoundingClientRect();
      const pivotX = stageRect.left + pivot.x * state.scale;
      const pivotY = stageRect.top + pivot.y * state.scale;
      state.interaction.pivotX = pivotX;
      state.interaction.pivotY = pivotY;
      state.interaction.startAngle = Math.atan2(event.clientY - pivotY, event.clientX - pivotX);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveFieldInteraction(event) {
    const action = state.interaction;
    if (!action || action.pointerId !== event.pointerId) return;
    const item = state.fields.find((candidate) => candidate.id === action.id) || state.images.find((candidate) => candidate.id === action.id);
    const dx = (event.clientX - action.startX) / state.scale;
    const dy = (event.clientY - action.startY) / state.scale;
    if (action.rotating) {
      const angle = Math.atan2(event.clientY - action.pivotY, event.clientX - action.pivotX);
      const degrees = action.rotation + (angle - action.startAngle) * 180 / Math.PI;
      item.rotation = normalizeRotation(event.shiftKey ? Math.round(degrees / 15) * 15 : degrees);
    } else if (action.resizing) {
      // Resize along the layer's own axes, so a rotated layer grows the way it
      // looks like it should rather than along the screen axes.
      const radians = action.rotation * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      if (action.isImage) {
        const aspect = action.width / action.height;
        const maxWidth = Math.min(DESIGN.width - item.x, (DESIGN.height - item.y) * aspect);
        item.width = clamp(action.width + localDx, 40, maxWidth);
        item.height = item.width / aspect;
      } else {
        item.width = clamp(action.width + localDx, 80, DESIGN.width - item.x);
        item.size = clamp(action.size + localDy * 0.18, 12, 180);
      }
    } else {
      item.x = clamp(action.x + dx, 0, DESIGN.width - item.width);
      const itemHeight = action.isImage ? item.height : item.size * 1.3;
      item.y = clamp(action.y + dy, 0, DESIGN.height - itemHeight);
    }
    renderFields(); populateForm();
  }

  function endFieldInteraction(event) {
    if (state.interaction?.pointerId === event.pointerId) state.interaction = null;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function handleStageKeydown(event) {
    const item = getSelectedItem();
    if (!item || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const amount = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") item.x = clamp(item.x - amount, 0, DESIGN.width - item.width);
    if (event.key === "ArrowRight") item.x = clamp(item.x + amount, 0, DESIGN.width - item.width);
    if (event.key === "ArrowUp") item.y = clamp(item.y - amount, 0, DESIGN.height);
    if (event.key === "ArrowDown") item.y = clamp(item.y + amount, 0, DESIGN.height);
    event.preventDefault(); renderFields(); populateForm();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], value = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(value.trim()); value = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
      } else value += char;
    }
    row.push(value.trim()); if (row.some((cell) => cell !== "")) rows.push(row);
    if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
    const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
    return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
  }

  function parseTxt(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("The text file does not contain any names.");
    return lines.map((name) => ({ name }));
  }

  async function handleDataUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const records = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : parseTxt(text);
      if (!records.length) throw new Error("No records were found.");
      state.records = records; state.currentRecord = 0;
      renderData(); renderFields();
      showToast(`${records.length} records loaded from ${file.name}`);
    } catch (error) { showToast(error.message, true); }
    event.target.value = "";
  }

  async function handleBackgroundUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Choose a PNG, JPEG, or WebP image.", true); return; }
    try {
      const src = await readFileAsDataUrl(file);
      const image = await loadImage(src);
      if (image.naturalWidth * image.naturalHeight > 50000000) throw new Error("Background images must be smaller than 50 megapixels.");
      state.backgroundImage = image; state.backgroundSourceImage = image; state.backgroundSourceSrc = src; state.backgroundCrop = null; state.backgroundName = file.name;
      setDesignSize(image.naturalWidth, image.naturalHeight);
      renderAll();
      showToast(`Canvas resized to ${image.naturalWidth} × ${image.naturalHeight}`);
    } catch (error) { console.error("Background upload failed", error); showToast(error.message || "That background image could not be opened.", true); }
    event.target.value = "";
  }

  async function handleImageElementUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const src = await readFileAsDataUrl(file);
      const image = await loadImage(src);
      const maxWidth = DESIGN.width * 0.28;
      const maxHeight = DESIGN.height * 0.28;
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const width = Math.max(40, image.naturalWidth * scale);
      const height = Math.max(40, image.naturalHeight * scale);
      const item = {
        id: `image-${Date.now()}-${state.images.length}`,
        name: file.name.replace(/\.[^.]+$/, "") || `Picture ${state.images.length + 1}`,
        src, image, sourceSrc: src, sourceImage: image, x: (DESIGN.width - width) / 2, y: (DESIGN.height - height) / 2,
        width, height, opacity: 1, rotation: 0, crop: null
      };
      state.images.push(item);
      selectField(item.id);
      showToast(`${file.name} added as a picture layer`);
    } catch (error) { console.error("Picture upload failed", error); showToast("That picture could not be opened.", true); }
    event.target.value = "";
  }

  async function handleReplaceImage(event) {
    const file = event.target.files[0];
    const item = getSelectedImage();
    if (!file || !item) return;
    try {
      const src = await readFileAsDataUrl(file);
      const image = await loadImage(src);
      const area = item.width * item.height;
      const ratio = image.naturalWidth / image.naturalHeight;
      item.width = Math.sqrt(area * ratio);
      item.height = item.width / ratio;
      item.name = file.name.replace(/\.[^.]+$/, "") || item.name;
      item.src = src;
      item.image = image;
      item.sourceSrc = src;
      item.sourceImage = image;
      item.crop = null;
      renderFields(); renderFieldList(); populateForm();
      showToast("Picture layer replaced");
    } catch (error) { console.error("Picture replacement failed", error); showToast("That picture could not be opened.", true); }
    event.target.value = "";
  }

  async function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["ttf", "otf", "woff", "woff2"].includes(extension)) {
      setFontStatus("Choose a TTF, OTF, WOFF or WOFF2 font.", "error");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFontStatus("That font is larger than the 10 MB limit.", "error");
      event.target.value = "";
      return;
    }
    try {
      const displayName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom font";
      const baseFamily = `Certificate generator ${displayName}`;
      let family = baseFamily;
      let suffix = 2;
      while (state.customFonts.some((item) => item.family === family)) family = `${baseFamily} ${suffix++}`;
      const fontFace = new FontFace(family, await file.arrayBuffer());
      await fontFace.load();
      document.fonts.add(fontFace);
      state.customFonts.push({ family, displayName, fileName: file.name, fontFace, data: await fontFileBase64(file) });
      const option = document.createElement("option");
      option.value = family;
      option.dataset.customFont = "1";
      option.textContent = `${displayName} · custom`;
      els.fieldFont.append(option);
      els.fieldFont.value = family;
      updateSelected("font", family);
      setFontStatus(`${displayName} loaded for this session`, "loaded");
      showToast(`${displayName} is ready to use`);
    } catch (error) {
      console.error(error);
      setFontStatus("This font could not be loaded. It may be damaged or unsupported.", "error");
    }
    event.target.value = "";
  }

  function setFontStatus(message, status = "") {
    els.fontStatus.textContent = message;
    els.fontStatus.className = `font-hint${status ? ` ${status}` : ""}`;
  }

  // project-io hook: keep the raw font bytes so fonts survive save/restore.
  async function fontFileBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    });
  }

  function fullImageCrop(image) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  function openCropEditor(kind) {
    const item = kind === "image" ? getSelectedImage() : null;
    const image = kind === "background" ? state.backgroundSourceImage : item?.sourceImage;
    if (!image) { showToast(`Upload a ${kind === "background" ? "background" : "picture"} first.`, true); return; }
    const savedCrop = kind === "background" ? state.backgroundCrop : item.crop;
    state.cropSession = {
      kind,
      targetId: item?.id || null,
      image,
      crop: savedCrop ? { ...savedCrop } : fullImageCrop(image),
      drag: null,
      view: null
    };
    els.cropDialogTitle.textContent = kind === "background" ? "Crop background" : `Crop ${item.name}`;
    els.cropAspect.value = "free";
    syncCropInputs();
    els.cropDialog.showModal();
    requestAnimationFrame(drawCropEditor);
  }

  function cropRatio() {
    const value = els.cropAspect.value;
    if (value === "free") return null;
    if (value === "certificate") return DESIGN.width / DESIGN.height;
    return Number(value) || null;
  }

  function fitCropToRatio(ratio) {
    const session = state.cropSession;
    if (!session || !ratio) return;
    const { naturalWidth: width, naturalHeight: height } = session.image;
    let cropWidth = width;
    let cropHeight = cropWidth / ratio;
    if (cropHeight > height) { cropHeight = height; cropWidth = cropHeight * ratio; }
    session.crop = { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
    syncCropInputs(); drawCropEditor();
  }

  function normalizeCrop(crop, image, changed = "") {
    const ratio = cropRatio();
    const maxWidth = image.naturalWidth;
    const maxHeight = image.naturalHeight;
    crop.x = clamp(Number(crop.x) || 0, 0, Math.max(0, maxWidth - 1));
    crop.y = clamp(Number(crop.y) || 0, 0, Math.max(0, maxHeight - 1));
    crop.width = clamp(Number(crop.width) || 1, 1, maxWidth - crop.x);
    crop.height = clamp(Number(crop.height) || 1, 1, maxHeight - crop.y);
    if (ratio) {
      if (changed === "height") crop.width = crop.height * ratio;
      else crop.height = crop.width / ratio;
      if (crop.width > maxWidth - crop.x) { crop.width = maxWidth - crop.x; crop.height = crop.width / ratio; }
      if (crop.height > maxHeight - crop.y) { crop.height = maxHeight - crop.y; crop.width = crop.height * ratio; }
    }
    return crop;
  }

  function syncCropInputs() {
    const crop = state.cropSession?.crop;
    if (!crop) return;
    els.cropX.value = Math.round(crop.x);
    els.cropY.value = Math.round(crop.y);
    els.cropWidth.value = Math.round(crop.width);
    els.cropHeight.value = Math.round(crop.height);
  }

  function updateCropFromInputs(changed) {
    const session = state.cropSession;
    if (!session) return;
    session.crop = normalizeCrop({
      x: Number(els.cropX.value), y: Number(els.cropY.value),
      width: Number(els.cropWidth.value), height: Number(els.cropHeight.value)
    }, session.image, changed);
    syncCropInputs(); drawCropEditor();
  }

  function drawCropEditor() {
    const session = state.cropSession;
    if (!session || !els.cropDialog.open) return;
    const canvas = els.cropCanvas;
    const image = session.image;
    const padding = 24;
    const scale = Math.min((canvas.width - padding * 2) / image.naturalWidth, (canvas.height - padding * 2) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const left = (canvas.width - width) / 2;
    const top = (canvas.height - height) / 2;
    session.view = { scale, left, top, width, height };
    cropCtx.clearRect(0, 0, canvas.width, canvas.height);
    cropCtx.fillStyle = "#111827"; cropCtx.fillRect(0, 0, canvas.width, canvas.height);
    cropCtx.drawImage(image, left, top, width, height);
    const c = session.crop;
    const x = left + c.x * scale, y = top + c.y * scale, w = c.width * scale, h = c.height * scale;
    cropCtx.fillStyle = "rgba(4, 10, 22, .66)";
    cropCtx.fillRect(left, top, width, Math.max(0, y - top));
    cropCtx.fillRect(left, y + h, width, Math.max(0, top + height - y - h));
    cropCtx.fillRect(left, y, Math.max(0, x - left), h);
    cropCtx.fillRect(x + w, y, Math.max(0, left + width - x - w), h);
    cropCtx.strokeStyle = "#f2bf64"; cropCtx.lineWidth = 3; cropCtx.strokeRect(x, y, w, h);
    cropCtx.strokeStyle = "rgba(255,255,255,.55)"; cropCtx.lineWidth = 1;
    cropCtx.beginPath();
    cropCtx.moveTo(x + w / 3, y); cropCtx.lineTo(x + w / 3, y + h);
    cropCtx.moveTo(x + w * 2 / 3, y); cropCtx.lineTo(x + w * 2 / 3, y + h);
    cropCtx.moveTo(x, y + h / 3); cropCtx.lineTo(x + w, y + h / 3);
    cropCtx.moveTo(x, y + h * 2 / 3); cropCtx.lineTo(x + w, y + h * 2 / 3); cropCtx.stroke();
    cropCtx.fillStyle = "#f2bf64"; cropCtx.fillRect(x + w - 9, y + h - 9, 18, 18);
  }

  function cropCanvasPoint(event) {
    const rect = els.cropCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * els.cropCanvas.width / rect.width, y: (event.clientY - rect.top) * els.cropCanvas.height / rect.height };
  }

  function startCropInteraction(event) {
    const session = state.cropSession;
    if (!session?.view) return;
    const point = cropCanvasPoint(event);
    const { scale, left, top } = session.view;
    const c = session.crop;
    const box = { x: left + c.x * scale, y: top + c.y * scale, width: c.width * scale, height: c.height * scale };
    const nearHandle = Math.abs(point.x - (box.x + box.width)) < 24 && Math.abs(point.y - (box.y + box.height)) < 24;
    const inside = point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    if (!nearHandle && !inside) return;
    session.drag = { mode: nearHandle ? "resize" : "move", pointerId: event.pointerId, point, crop: { ...c } };
    els.cropCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveCropInteraction(event) {
    const session = state.cropSession;
    const drag = session?.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = cropCanvasPoint(event);
    const dx = (point.x - drag.point.x) / session.view.scale;
    const dy = (point.y - drag.point.y) / session.view.scale;
    const crop = { ...drag.crop };
    if (drag.mode === "move") {
      crop.x = clamp(drag.crop.x + dx, 0, session.image.naturalWidth - crop.width);
      crop.y = clamp(drag.crop.y + dy, 0, session.image.naturalHeight - crop.height);
    } else {
      crop.width = Math.max(1, drag.crop.width + dx);
      crop.height = Math.max(1, drag.crop.height + dy);
      normalizeCrop(crop, session.image, Math.abs(dx) >= Math.abs(dy) ? "width" : "height");
    }
    session.crop = crop; syncCropInputs(); drawCropEditor();
  }

  function endCropInteraction(event) {
    if (state.cropSession?.drag?.pointerId === event.pointerId) state.cropSession.drag = null;
  }

  async function applyCrop() {
    const session = state.cropSession;
    if (!session) return;
    const crop = normalizeCrop({ ...session.crop }, session.image);
    const width = Math.max(1, Math.round(crop.width));
    const height = Math.max(1, Math.round(crop.height));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(session.image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    const src = canvas.toDataURL("image/png");
    const image = await loadImage(src);
    if (session.kind === "background") {
      state.backgroundImage = image;
      state.backgroundCrop = crop;
      setDesignSize(width, height);
      renderAll();
      showToast(`Background cropped · canvas is now ${width} × ${height}`);
    } else {
      const item = state.images.find((candidate) => candidate.id === session.targetId);
      if (!item) return;
      item.image = image; item.src = src; item.crop = crop;
      item.height = item.width * height / width;
      if (item.height > DESIGN.height) { item.height = DESIGN.height; item.width = item.height * width / height; }
      item.x = clamp(item.x, 0, Math.max(0, DESIGN.width - item.width));
      item.y = clamp(item.y, 0, Math.max(0, DESIGN.height - item.height));
      renderFields(); renderFieldList(); populateForm();
      showToast(`Picture cropped to ${width} × ${height}`);
    }
    els.cropDialog.close(); state.cropSession = null;
  }

  function addField() {
    const id = `text-${Date.now()}`;
    state.fields.push(field(id, "New text", 300, 300, 600, 32, 400, "Georgia", "#17223b", "center"));
    selectField(id); els.fieldText.focus(); els.fieldText.select();
  }

  function deleteField() {
    const imageIndex = state.images.findIndex((item) => item.id === state.selectedField);
    if (imageIndex >= 0) {
      state.images.splice(imageIndex, 1);
      state.selectedField = state.fields[0]?.id || state.images[0]?.id || null;
      renderFields(); renderFieldList(); populateForm();
      return;
    }
    if (state.fields.length === 1) { showToast("Keep at least one text field.", true); return; }
    const index = state.fields.findIndex((item) => item.id === state.selectedField);
    if (index < 0) return;
    state.fields.splice(index, 1);
    state.selectedField = state.fields[Math.min(index, state.fields.length - 1)].id;
    renderFields(); renderFieldList(); populateForm();
  }

  function renderCertificate(record, scale = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(DESIGN.width * scale);
    canvas.height = Math.round(DESIGN.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawBackground(ctx);
    state.images.forEach((item) => {
      ctx.save();
      ctx.globalAlpha = item.opacity;
      applyRotation(ctx, item, item.x + item.width / 2, item.y + item.height / 2);
      ctx.drawImage(item.image, item.x, item.y, item.width, item.height);
      ctx.restore();
    });
    ctx.textBaseline = "top";
    state.fields.forEach((item) => drawTextField(ctx, item, resolveText(item.text, record)));
    return canvas;
  }

  function drawTextField(ctx, item, text) {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = `${item.weight} ${item.size}px "${item.font}"`;
    ctx.textAlign = item.align;
    const anchorX = item.align === "left" ? item.x : item.align === "right" ? item.x + item.width : item.x + item.width / 2;
    const lines = wrapText(ctx, text, item.width);
    const lineHeight = item.size * 1.12;
    applyRotation(ctx, item, item.x + item.width / 2, item.y + (lines.length * lineHeight) / 2);
    lines.forEach((line, index) => ctx.fillText(line, anchorX, item.y + index * lineHeight));
    ctx.restore();
  }

  /** Turn the context around a design-space pivot. Caller owns save/restore. */
  function applyRotation(ctx, item, pivotX, pivotY) {
    const rotation = normalizeRotation(item.rotation);
    if (!rotation) return;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-pivotX, -pivotY);
  }

  function wrapText(ctx, text, maxWidth) {
    const output = [];
    String(text).split("\n").forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { output.push(""); return; }
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = `${line} ${words[i]}`;
        if (ctx.measureText(test).width > maxWidth) { output.push(line); line = words[i]; }
        else line = test;
      }
      output.push(line);
    });
    return output;
  }

  function canvasToBlob(canvas, type = "image/png", quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render image")), type, quality));
  }

  function safeFilename(record, index) {
    const source = record.name || record[Object.keys(record)[0]] || `certificate-${index + 1}`;
    const cleaned = String(source).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return cleaned || `certificate-${index + 1}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadCurrentPng() {
    await ensureFontsReady();
    const record = state.records[state.currentRecord];
    const preset = currentQualityPreset();
    const blob = await canvasToBlob(renderCertificate(record, preset.scale));
    downloadBlob(blob, `${safeFilename(record, state.currentRecord)}.png`);
    showToast("PNG downloaded");
  }

  async function downloadCurrentPdf() {
    await ensureFontsReady();
    const record = state.records[state.currentRecord];
    const preset = currentQualityPreset();
    const bytes = await makePdf(renderCertificate(record, preset.scale), preset.jpegQuality);
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${safeFilename(record, state.currentRecord)}.pdf`);
    showToast("PDF downloaded");
  }

  async function makePdf(canvas, jpegQuality = 1) {
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", jpegQuality);
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const pushText = (text) => { const bytes = encoder.encode(text); chunks.push(bytes); length += bytes.length; };
    const pushBytes = (bytes) => { chunks.push(bytes); length += bytes.length; };
    pushText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const object = (number, body, stream) => {
      offsets[number] = length; pushText(`${number} 0 obj\n${body}`);
      if (stream) { pushText("\nstream\n"); pushBytes(stream); pushText("\nendstream"); }
      pushText("\nendobj\n");
    };
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    const landscape = canvas.width >= canvas.height;
    const pageWidth = landscape ? 842 : Math.round(842 * canvas.width / canvas.height);
    const pageHeight = landscape ? Math.round(842 * canvas.height / canvas.width) : 842;
    object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`);
    const content = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ`);
    object(4, `<< /Length ${content.length} >>`, content);
    object(5, `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    const xref = length;
    pushText("xref\n0 6\n0000000000 65535 f \n");
    for (let i = 1; i <= 5; i++) pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return concatBytes(chunks, length);
  }

  async function downloadBatch() {
    setBusy(true);
    try {
      await ensureFontsReady();
      const preset = currentQualityPreset();
      const files = [];
      for (let i = 0; i < state.records.length; i++) {
        const record = state.records[i];
        const canvas = renderCertificate(record, preset.scale);
        const base = `${String(i + 1).padStart(3, "0")}-${safeFilename(record, i)}`;
        setProgress(i, state.records.length, `Rendering ${base}`);
        const png = new Uint8Array(await (await canvasToBlob(canvas)).arrayBuffer());
        const pdf = await makePdf(canvas, preset.jpegQuality);
        files.push({ name: `png/${base}.png`, data: png }, { name: `pdf/${base}.pdf`, data: pdf });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      els.progressTitle.textContent = "Packaging your downloads";
      els.progressText.textContent = "Creating ZIP file…";
      els.progressBar.style.width = "100%";
      const zip = makeZip(files);
      downloadBlob(new Blob([zip], { type: "application/zip" }), "certificates.zip");
      showToast(`${state.records.length} certificates downloaded`);
    } catch (error) { console.error(error); showToast("The batch export could not be completed.", true); }
    finally { setBusy(false); }
  }

  async function ensureFontsReady() {
    await document.fonts.ready;
    await Promise.all(state.fields.map((item) => document.fonts.load(`${item.weight} ${item.size}px "${item.font}"`)));
  }

  function currentQualityPreset() {
    return QUALITY_PRESETS[state.exportQuality] || QUALITY_PRESETS.xhigh;
  }

  function setBusy(busy) {
    els.progress.hidden = !busy;
    [els.downloadPng, els.downloadPdf, els.batch].forEach((button) => button.disabled = busy);
    if (busy) { els.progressTitle.textContent = "Preparing certificates"; els.progressBar.style.width = "0"; }
  }

  function setProgress(index, total, label) {
    els.progressText.textContent = `${index + 1} of ${total} · ${label}`;
    els.progressBar.style.width = `${(index / total) * 100}%`;
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const local = [], central = [];
    let offset = 0;
    const { date, time } = dosDateTime(new Date());
    files.forEach(({ name, data }) => {
      const nameBytes = encoder.encode(name);
      const checksum = crc32(data);
      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true); view.setUint16(8, 0, true);
      view.setUint16(10, time, true); view.setUint16(12, date, true); view.setUint32(14, checksum, true);
      view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true);
      header.set(nameBytes, 30); local.push(header, data);
      const c = new Uint8Array(46 + nameBytes.length); const cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true); cv.setUint32(42, offset, true); c.set(nameBytes, 46); central.push(c);
      offset += header.length + data.length;
    });
    const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    return concatBytes([...local, ...central, end]);
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    return table;
  })();

  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

  function dosDateTime(value) {
    const year = Math.max(1980, value.getFullYear());
    return { date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(), time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2) };
  }

  function concatBytes(chunks, providedLength) {
    const length = providedLength ?? chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length); let offset = 0;
    chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
    return result;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer); els.toast.textContent = message; els.toast.style.background = isError ? "#8f2930" : "#101b34"; els.toast.classList.add("visible");
    toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2600);
  }

  function resetApp() {
    state.backgroundImage = null; state.backgroundSourceImage = null; state.backgroundSourceSrc = null; state.backgroundCrop = null; state.backgroundName = "Sample template";
    setDesignSize(1200, 848);
    state.records = clone(sampleRecords); state.fields = clone(sampleFields); state.images = []; state.currentRecord = 0; state.selectedField = "name";
    renderAll(); showToast("Sample certificate restored");
  }

  els.dataUpload.addEventListener("change", handleDataUpload);
  els.backgroundUpload.addEventListener("change", handleBackgroundUpload);
  els.cropBackground.addEventListener("click", () => openCropEditor("background"));
  els.imageElementUpload.addEventListener("change", handleImageElementUpload);
  els.replaceImageUpload.addEventListener("change", handleReplaceImage);
  els.cropImage.addEventListener("click", () => openCropEditor("image"));
  els.fontUpload.addEventListener("change", handleFontUpload);
  els.exportQuality.addEventListener("change", (event) => {
    state.exportQuality = event.target.value;
    const preset = currentQualityPreset();
    renderData();
    showToast(`${preset.label} export selected · ${preset.scale}× resolution`);
  });
  els.clearBackground.addEventListener("click", () => { state.backgroundImage = null; state.backgroundSourceImage = null; state.backgroundSourceSrc = null; state.backgroundCrop = null; state.backgroundName = "Sample template"; setDesignSize(1200, 848); renderAll(); showToast("Sample template restored"); });
  els.recordSelect.addEventListener("change", () => { state.currentRecord = Number(els.recordSelect.value); renderData(); renderFields(); });
  els.previousRecord.addEventListener("click", () => { state.currentRecord = (state.currentRecord - 1 + state.records.length) % state.records.length; renderData(); renderFields(); });
  els.nextRecord.addEventListener("click", () => { state.currentRecord = (state.currentRecord + 1) % state.records.length; renderData(); renderFields(); });
  els.sampleData.addEventListener("click", () => { state.records = clone(sampleRecords); state.currentRecord = 0; renderData(); renderFields(); showToast("Sample data restored"); });
  els.addField.addEventListener("click", addField);
  els.deleteField.addEventListener("click", deleteField);
  els.fieldText.addEventListener("input", (event) => updateSelected("text", event.target.value));
  els.fieldFont.addEventListener("change", (event) => updateSelected("font", event.target.value));
  els.fieldSize.addEventListener("input", (event) => updateSelected("size", clamp(Number(event.target.value) || 12, 12, 180)));
  els.fieldWeight.addEventListener("change", (event) => updateSelected("weight", Number(event.target.value)));
  els.fieldColor.addEventListener("input", (event) => { els.fieldColorText.value = event.target.value; updateSelected("color", event.target.value); });
  els.fieldColorText.addEventListener("change", (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) { els.fieldColor.value = event.target.value; updateSelected("color", event.target.value); } else populateForm(); });
  els.fieldX.addEventListener("input", (event) => updateSelected("x", clamp(Number(event.target.value) || 0, 0, DESIGN.width)));
  els.fieldY.addEventListener("input", (event) => updateSelected("y", clamp(Number(event.target.value) || 0, 0, DESIGN.height)));
  els.fieldWidth.addEventListener("input", (event) => updateSelected("width", clamp(Number(event.target.value) || 80, 80, DESIGN.width)));
  els.fieldRotation.addEventListener("input", (event) => updateSelected("rotation", normalizeRotation(event.target.value)));
  els.imageX.addEventListener("input", (event) => updateSelected("x", clamp(Number(event.target.value) || 0, 0, DESIGN.width)));
  els.imageY.addEventListener("input", (event) => updateSelected("y", clamp(Number(event.target.value) || 0, 0, DESIGN.height)));
  els.imageWidth.addEventListener("input", (event) => {
    const item = getSelectedImage();
    if (!item) return;
    const ratio = item.height / item.width;
    const maxWidth = Math.min(DESIGN.width - item.x, (DESIGN.height - item.y) / ratio);
    item.width = clamp(Number(event.target.value) || 20, Math.min(20, maxWidth), maxWidth);
    item.height = item.width * ratio;
    renderFields(); renderFieldList(); populateForm();
  });
  els.imageRotation.addEventListener("input", (event) => updateSelected("rotation", normalizeRotation(event.target.value)));
  els.imageOpacity.addEventListener("input", (event) => {
    const value = clamp(Number(event.target.value) || 100, 10, 100);
    els.imageOpacityValue.textContent = `${value}%`;
    updateSelected("opacity", value / 100);
  });
  els.alignment.addEventListener("click", (event) => { const button = event.target.closest("button[data-align]"); if (button) { updateSelected("align", button.dataset.align); populateForm(); } });
  els.stage.addEventListener("pointermove", moveFieldInteraction);
  els.stage.addEventListener("pointerup", endFieldInteraction);
  els.stage.addEventListener("pointercancel", endFieldInteraction);
  els.stage.addEventListener("keydown", handleStageKeydown);
  els.cropAspect.addEventListener("change", () => {
    const ratio = cropRatio();
    if (ratio) fitCropToRatio(ratio);
    else { syncCropInputs(); drawCropEditor(); }
  });
  [[els.cropX, "x"], [els.cropY, "y"], [els.cropWidth, "width"], [els.cropHeight, "height"]].forEach(([input, key]) => input.addEventListener("change", () => updateCropFromInputs(key)));
  els.cropReset.addEventListener("click", () => { if (!state.cropSession) return; state.cropSession.crop = fullImageCrop(state.cropSession.image); els.cropAspect.value = "free"; syncCropInputs(); drawCropEditor(); });
  els.cropApply.addEventListener("click", () => applyCrop().catch((error) => { console.error("Crop failed", error); showToast("The crop could not be applied.", true); }));
  els.cropCanvas.addEventListener("pointerdown", startCropInteraction);
  els.cropCanvas.addEventListener("pointermove", moveCropInteraction);
  els.cropCanvas.addEventListener("pointerup", endCropInteraction);
  els.cropCanvas.addEventListener("pointercancel", endCropInteraction);
  els.cropDialog.addEventListener("close", () => { state.cropSession = null; });
  els.reset.addEventListener("click", resetApp);
  els.downloadPng.addEventListener("click", () => downloadCurrentPng().catch(() => showToast("PNG export failed.", true)));
  els.downloadPdf.addEventListener("click", () => downloadCurrentPdf().catch(() => showToast("PDF export failed.", true)));
  els.batch.addEventListener("click", downloadBatch);
  new ResizeObserver(fitStage).observe(els.shell);
  registerWebMcpTools();
  renderAll();

  // project-io hook: expose a minimal bridge for save / load / autosave.
  window.CertificateProjectIO?.attach({ state, DESIGN, els, setDesignSize, renderAll, loadImage, showToast });

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = (tool) => {
      try { Promise.resolve(context.registerTool(tool)).catch((error) => console.warn("WebMCP registration failed", error)); }
      catch (error) { console.warn("WebMCP registration failed", error); }
    };
    register({
      name: "set_certificate_records",
      title: "Set certificate records",
      description: "Replace the visible certificate recipient data with a batch of records. Record keys become {{placeholder}} names.",
      inputSchema: {
        type: "object",
        properties: { records: { type: "array", minItems: 1, items: { type: "object", minProperties: 1, additionalProperties: { type: ["string", "number"] } } } },
        required: ["records"], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || !Array.isArray(input.records) || input.records.length === 0 || input.records.some((record) => !record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).length === 0)) throw new Error("records must be a non-empty array of non-empty objects");
        state.records = input.records.map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value)])));
        state.currentRecord = 0; renderData(); renderFields();
        return { recordCount: state.records.length, placeholders: uniqueKeys() };
      }
    });
    register({
      name: "add_certificate_text_field",
      title: "Add certificate text field",
      description: "Add and select a visible text field on the certificate canvas. The text may contain placeholders such as {{name}}.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1 }, x: { type: "number", minimum: 0, maximum: 1120 }, y: { type: "number", minimum: 0, maximum: 820 },
          width: { type: "number", minimum: 80, maximum: 1200 }, size: { type: "number", minimum: 12, maximum: 180 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          align: { type: "string", enum: ["left", "center", "right"] },
          rotation: { type: "number", minimum: -180, maximum: 180 }
        },
        required: ["text"], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input.text !== "string" || !input.text.trim()) throw new Error("text is required");
        const id = `agent-text-${Date.now()}`;
        state.fields.push(field(id, input.text, input.x ?? 300, input.y ?? 300, input.width ?? 600, input.size ?? 32, 400, "Georgia", input.color ?? "#17223b", input.align ?? "center", input.rotation ?? 0));
        selectField(id);
        return { id, fieldCount: state.fields.length };
      }
    });
  }
})();
