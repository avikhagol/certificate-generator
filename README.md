# Certificate Generator

Create personalized certificates from CSV or TXT. Export PNG, PDF, or a ZIP of the whole batch. Your files stay on your device.

[Open the app](https://avikhagol.github.io/certificate-generator/) · [Watch the demo](https://www.youtube.com/watch?v=e_CAPwU1Hbw)

## Quick start

1. **Data:** load a CSV or TXT file.
2. **Canvas:** choose a background or start with a blank template.
3. **Layers:** add text, pictures, or shapes. Use placeholders such as `{{name}}`.
4. **Preview:** check a few records using the left/right record buttons.
5. **Download:** choose PNG, PDF, or **Download all (.zip)**.

Use **Hide Data** and **Hide Layers** for more canvas space. The same buttons bring them back.

## Select and edit

| Action | How |
| --- | --- |
| Select one element | Click it on the canvas or in Layers |
| Add/remove an element from selection | Shift-click |
| Select an area | Drag a rectangle from empty canvas space |
| Add an area to selection | Shift-drag from empty space |
| Move the selection | Drag a selected element, or use arrow keys |
| Move faster | Shift + arrow keys moves 10 px |
| Copy / paste / duplicate | Ctrl C / Ctrl V / Ctrl D |
| Delete selected elements | Delete or Backspace |
| Clear selection | Escape |

A selection rectangle includes elements it touches. Copies keep their relative positions and stacking order.

**On Mac:** use Command instead of Ctrl. Keyboard shortcuts leave typing in form fields alone.

### Size, rotation, and stacking

- **Resize:** drag the corner handle of a single selected element.
- **Keep ratio:** hold Shift or Ctrl+Shift when resizing shapes or dynamic pictures.
- **Square or circle:** hold Ctrl alone. Also works when editing Width or Height.
- **Rotate:** drag the round handle. Shift snaps to 15°.
- **Reorder:** use the ↑/↓ buttons, or Ctrl+↑/↓ for one position.
- **Top/bottom:** Ctrl+Shift+↑/↓. The first layer in the list is on top.

Ordinary picture layers always keep their aspect ratio. To edit an element's properties, select it on its own.

### Zoom

Ctrl + scroll zooms around the pointer. **Fit** or Ctrl 0 shows the whole canvas. When zoomed in, scroll or middle-button drag to pan.

## Prepare your data

CSV headers become placeholders:

```csv
name,course,date
Alex Morgan,Discovery Camp,19 September 2026
Sam Rivera,Discovery Camp,19 September 2026
```

Use `{{name}}`, `{{course}}`, or `{{date}}` in a text layer. Any column name works.

For names only, use a TXT file with **one name per line**.

## Pictures and fonts

- **Background:** PNG, JPEG, or WebP. The canvas takes the image's dimensions.
- **Picture layers:** logos, signatures, portraits, and seals. Crop or replace them independently.
- **Custom fonts:** choose **+ Custom** beside Font. Supports TTF, OTF, WOFF, and WOFF2.
- **Shapes:** rectangles, ellipses, triangles, diamonds, polygons, stars, and lines.

### A different picture for each record

1. Add an image filename column to the CSV, such as `photo`.
2. Open **Dynamic pictures** in Data and link the image folder.
3. Add a **+ Dynamic** layer and choose that column.
4. Check the **Match report** for missing images.

Use **Cover** to fill the frame, **Contain** to show the whole image, or **Fill** to stretch it. Link more folders or refresh as needed.

**After reopening a project, relink these folders.** Dynamic image files are not embedded in the project.

## Save your work

**Save project** downloads a `.certproj.json` file. **Load project** restores the design, data, pictures, fonts, and layer order.

The browser also autosaves when storage is available and offers to restore your work on your next visit. Keep a downloaded project as your backup.

## Export

| Quality | Scale | Use |
| --- | --- | --- |
| Normal | 1× | Quick previews |
| High | 2× | General use |
| XHigh | 3× | Sharper output, larger files |

The quality setting applies to PNG, PDF, and ZIP exports. For large batches, split the data into smaller files if memory runs low.

## Run locally

No install or build step. Open `dist/index.html`, or serve the folder:

```bash
python3 -m http.server 4173 --directory dist
```

Then visit `http://localhost:4173`.

For GitHub Pages, choose **Settings → Pages → GitHub Actions**. The included workflow publishes `dist/` when `main` is pushed.

## License

[MIT](LICENSE) · [Source on GitHub](https://github.com/avikhagol/certificate-generator)
