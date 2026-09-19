# Certificate generator

A fully static, browser-based certificate generator. Upload recipient data, customize text layers on a live certificate canvas, and export individual PNG/PDF files or a ZIP containing the full batch.

If Certiforge is useful to you, [star the repository on GitHub](https://github.com/avikhagol/certificate-generator) to follow updates and support the project.

No recipient data or uploaded artwork leaves the browser. The app has no backend and no runtime dependencies.

## Features

- CSV files with any header names; headers become placeholders such as `{{name}}`
- TXT files with one recipient name per line
- PNG, JPEG, or WebP backgrounds that set the certificate's native dimensions
- Multiple independently movable, resizable, replaceable picture layers
- Fixed text and variable placeholder fields
- Local custom font uploads (`.ttf`, `.otf`, `.woff`, and `.woff2`)
- Drag, resize, nudge, style, align, add, and delete text and picture layers
- Live preview for every record
- Selectable Normal, High, and XHigh PNG and landscape A4 PDF export quality
- Batch ZIP with high-resolution PNG and PDF folders
- Responsive interface with sample data and a built-in template

## Data format

CSV example:

```csv
name,course,date,organization
Avinash Kumar,Discover Camp,19 September 2026,RAD@home India
Lorem Ipsum,Discover Camp,19 September 2026,RAD@home India
```

Each header is available as a placeholder. For example, `{{course}}` resolves to the course value for the selected recipient.

For a simple list, use a `.txt` file with one name per line. This creates a single `{{name}}` placeholder.

## Custom fonts

Select a text layer, then choose **+ Custom** beside the Font menu. Uploaded TTF, OTF, WOFF, and WOFF2 files are loaded only in the current browser session and are immediately available in the live preview and every export. Font files are never uploaded to a server.

Custom fonts must be reselected after reloading the page. Ensure that the font's license permits use in generated certificates.

## Backgrounds and picture layers

Uploading a background changes the certificate canvas to the image's exact pixel dimensions. Existing text and picture positions are scaled proportionally so the layout stays aligned.

Use **Add picture** to place logos, signatures, portraits, seals, or other artwork above the background. You can add multiple pictures, then move, resize, adjust opacity, replace, or delete each layer independently. Picture layers are included in PNG, PDF, and ZIP exports and never leave the browser.

## Export quality

Choose a quality preset in the top toolbar before downloading:

| Preset | Render scale | Best for |
| --- | --- | --- |
| Normal | Original background dimensions | Quick drafts and screen sharing |
| High | 2× background dimensions | Everyday digital use and smaller prints |
| XHigh | 3× background dimensions | Professional printing |

Higher settings create larger files and use more browser memory. The selected preset applies to PNG, PDF, and batch ZIP exports.

## Run locally

Serve the `dist` folder with any static file server. For example:

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

Opening `dist/index.html` directly also works in modern browsers, but a local server is recommended for consistent behavior.

## Deploy to GitHub Pages

The included workflow deploys `dist/` whenever the `main` branch is pushed.

1. Push this repository to GitHub with `main` as the default branch.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish.

The site will be available at `https://<account>.github.io/<repository>/`. All asset paths are relative, so project Pages URLs work without changes.

You can also run the workflow manually from the Actions tab.

## Project structure

```text
dist/
  index.html
  assets/
    app.js
    styles.css
.github/workflows/deploy-pages.yml
README.md
```

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Large batches are generated in memory; for hundreds of high-resolution certificates, split the input into smaller files if the browser becomes memory-constrained.

For best printed results, start with a high-resolution background. Higher export scales make text and picture layers sharper, but cannot restore detail missing from a low-resolution background image.
