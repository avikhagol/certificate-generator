# Certificate Generator

**Turn a CSV into hundreds of certificates — PNG and PDF — without uploading anything.**

[**▶ Open the app**](https://avikhagol.github.io/certificate-generator/) · [Watch the demo](https://www.youtube.com/watch?v=e_CAPwU1Hbw) · MIT licensed

[![Certificate Generator — CSV to certificates in one click](dist/assets/social-preview.png)](https://www.youtube.com/watch?v=e_CAPwU1Hbw)

A fully static, browser-based certificate generator. Upload recipient data, customize text and picture layers on a live certificate canvas, and export individual PNG/PDF files or a ZIP containing the full batch.

## Why this one

| | |
| --- | --- |
| **Zero dependencies** | No npm packages, no CDN scripts, no frameworks. The ZIP writer and the PDF writer are hand-written in plain JavaScript. |
| **Zero build step** | What you see in `dist/` is what ships. Clone it, open `index.html`, done. |
| **Under 100 KB of code** | The whole editor is one HTML file, one stylesheet and a handful of small scripts. |
| **No backend, no signup, no upload** | Recipient data, background artwork and font files never leave your browser. There is no server to send them to. |
| **Works offline** | Once the page has loaded it needs no network. Run it from a USB stick on an air-gapped machine. |
| **Agent-ready** | Registers [WebMCP](https://github.com/webmachinelearning/webmcp) tools, so an AI browser agent can drive the editor and generate a batch for you. |
| **MIT licensed** | Fork it, rebrand it, host it for your own institution. |

Check the claims yourself: there is no `package.json` anywhere in this repository, and `dist/index.html` loads nothing but its own relative `assets/`.

If Certificate Generator is useful to you, [star the repository](https://github.com/avikhagol/certificate-generator) to follow updates and support the project.

## Demo

<p align="center">
  <a href="https://www.youtube.com/watch?v=e_CAPwU1Hbw">
    <img src="dist/assets/social-preview.png" alt="Generate batch certificates online for free — CSV to PNG and PDF" width="640">
  </a>
</p>

GitHub strips `<iframe>` from READMEs, so the image above links to the video. The app page itself has a click-to-play embed.

## Features

- CSV files with any header names; headers become placeholders such as `{{name}}`
- TXT files with one recipient name per line
- PNG, JPEG, or WebP backgrounds that set the certificate's native dimensions
- Multiple independently movable, resizable, replaceable, and croppable picture layers
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

Uploading a background changes the certificate canvas to the image's exact pixel dimensions. Use **Crop background** to choose only the area you need; the certificate then adopts the cropped image's exact dimensions and aspect ratio. Existing text and picture positions are scaled proportionally so the layout stays aligned.

Use **Add picture** to place logos, signatures, portraits, seals, or other artwork above the background. You can add multiple pictures, then crop, move, resize, adjust opacity, replace, or delete each layer independently. The crop editor supports freeform, square, 4:3, 16:9, and current-certificate aspect ratios. Picture layers are included in PNG, PDF, and ZIP exports and never leave the browser.

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
    social-preview.png
.github/workflows/deploy-pages.yml
LICENSE
README.md
```

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. Large batches are generated in memory; for hundreds of high-resolution certificates, split the input into smaller files if the browser becomes memory-constrained.

For best printed results, start with a high-resolution background. Higher export scales make text and picture layers sharper, but cannot restore detail missing from a low-resolution background image.

## License

[MIT](LICENSE) © Avinash Kumar
