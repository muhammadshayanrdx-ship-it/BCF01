# Shelf Barcode Finder — iPhone + Android

This version does **not** use a barcode API, API key, or server. Barcode decoding happens in the browser with ZXing. ZXing supports UPC-A, UPC-E, EAN-8, EAN-13 and common 1D/2D formats.

## Important
- Camera pages must be served over **HTTPS** (GitHub Pages works).
- iPhone Safari does not currently expose the native BarcodeDetector API, so this version uses a JavaScript decoder instead.
- The app scans the live camera in **six overlapping regions per cycle**, which allows it to find multiple shelf barcodes in one camera frame.
- White rectangles are drawn around decoded barcodes.
- Enter the desired last 4 digits. An exact last-4 match triggers a beep and is marked MATCH.
- No barcode image or decoded value is sent to a barcode service.
- The ZXing script is loaded from jsDelivr in `index.html`. This is a library download, not a barcode/API service. If you want a completely offline package, replace that script with a locally bundled ZXing UMD build.

## GitHub Pages
1. Upload all files/folders in this project to a GitHub repository.
2. Enable **Settings → Pages → Deploy from branch**.
3. Open the generated HTTPS URL on iPhone Safari.
4. Tap **Start camera** and allow camera permission.

## Files
- `index.html` — UI and local library reference
- `styles.css` — mobile-friendly layout
- `app.js` — camera, multi-region scanning, matching, sound, boxes
- `manifest.webmanifest` — optional install/PWA metadata
- `service-worker.js` — caches the app shell

## License
ZXing is open-source software; see the upstream project for its license and notices.
