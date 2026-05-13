# Heisig Kanji Review

A static HTML/CSS/JS port of `heisig-kanji-review.py`, designed to run on GitHub Pages.

## Files

- `index.html` is the app shell.
- `styles.css` contains the responsive layout and visual design.
- `app.js` contains CSV loading, review-session logic, keyboard controls, persistence, and scratchpad drawing.
- `heisig-kanjis.csv` is the data file loaded by the browser.

## GitHub Pages

Publish this directory as the Pages source, or copy the directory contents to the root of a Pages branch. No build step is required.

## Local Preview

Run a static server from this directory, then open the printed local URL:

```powershell
python -m http.server 8000
```

Opening `index.html` directly from disk may block CSV loading in some browsers, so a local static server is the better preview path.
