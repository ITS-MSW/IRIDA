# Verification — 2026-09-26

## Automated checks

- `bun install --frozen-lockfile`: reproducible install from the committed lockfile.
- `bun run typecheck`: strict TypeScript passes.
- `bun test`: **2 passing tests, 0 failures, 80 assertions**. Covers measured pixel scales (1, 1.25, 1.5, 2, 2.5), fractional edge rounding, scrollbar containment, invalid dimensions, off-screen bounds, meaningful movement, adaptive output dimensions, the 4096-pixel cap, no upscaling, message validation, and stale session/request IDs.
- `bun run build`: production Chrome MV3 build passes; `scripts/check-build.ts` verifies the generated manifest and actual content-script path, and bundles the notices.
- Generated manifest: `activeTab` + `scripting`, no host permissions, no automatic content scripts, no popup, no downloads permission, no web-accessible resources.

## Installed-extension browser checks

Environment: macOS ARM64, Chrome for Testing **154.0.8037.0**, a separate temporary Chrome profile, 1280 × 900 CSS viewport at 100% zoom, 2× pixel density. The actual production directory `.output/chrome-mv3` was loaded. Native Chrome extension-menu actions verified toolbar activation and restricted-page handling; Playwright drove the fixture and inspected results. Follow-up activations used the extension's production message channel after the toolbar had granted `activeTab` access.

| Check | Observed result |
| --- | --- |
| Published primitives smoke check | The installed `react-grab/primitives` bundled and executed in an isolated WXT content script on plain HTML. Hit testing and bounds returned valid targets; no React Grab UI or frozen styles appeared. |
| Toolbar activation | The hint appeared on the current page, without a popup or editor tab. |
| Parent/child navigation | `h2 → article → h2 → article`; outline bounds matched the card's actual bounds. A 1-pixel pointer movement preserved ancestor selection. |
| Click suppression | Capturing the nested button left its counter at 0. Closing IRIDA and clicking normally changed the counter to 1. |
| Save PNG | A real browser download completed with a timestamped `showcase-…png` filename. |
| Grab again, Close, Escape | Returned to picking or removed the UI as appropriate; normal page interaction resumed. |
| Repeated activation | Three consecutive activation messages toggled the controller and left exactly one host. Escape removed it. |
| Rounded card, 100% zoom | Generated and downloaded **1024 × 1103** PNG. |
| Scrolled capture | At `scrollY = 973.5`, the below-fold card produced **1024 × 718** PNG with the correct subject. |
| Browser zoom | `chrome.tabs.setZoom(..., 1.25)` produced a 1024 × 720 CSS viewport and a measured 2.5× pixel scale. The same card exported at **1280 × 1376**, without double scaling. Zoom was restored to 100%. |
| Wide square section | Exported **2176 × 609** PNG with square corners and adaptive proportions. |
| Native modal | Captured the 420 × 235 CSS-pixel dialog into **1096 × 726** PNG. The original dialog remained open after closing the preview; its Done button still worked. |
| Partially off-screen target | Card at `y = -91.609375` was rejected with “Bring the entire element into view…”; no PNG offered. |
| Removed target | Removing the target as the extension hid itself produced “This element was removed…”; no PNG offered. Close released the UI and page interactions worked. |
| Active-tab change during capture | After the real capture API started, switching tabs caused the result to be discarded with an active-page-change error. No Save PNG button appeared; Close left no host. |
| Capture rate limit | Very rapid successive captures produced the expected recoverable wait message. Grab again succeeded after the interval. No automatic retries. |
| Restricted page | Actual toolbar activation on `chrome://extensions` set badge `!` and title `IRIDA — Open an HTTP or HTTPS page to grab UI.` |
| Browser console | No warnings or errors during the completed fixture checks. |

The tab-change check temporarily delayed delivery of the **real** `captureVisibleTab` response by 400 ms in the test worker to make the race reproducible. It did not fabricate a screenshot or change the shipped code; the original API function was restored afterward. PNG capture in all success cases used the unmodified Chrome API.

## Visual evidence

Downloaded artifacts are local and Git-ignored:

- `output/playwright/showcase-rounded-2x.png`
- `output/playwright/showcase-scrolled-2x.png`
- `output/playwright/showcase-zoom125-2x.png`
- `output/playwright/showcase-wide-2x.png`

The rounded, zoomed, and wide PNGs were opened and visually inspected: readable text, correct subjects and boundaries, baked-in backdrop and silhouette shadow, and no IRIDA highlight, hint, or preview controls. The zoomed fixture includes its own button focus ring; that is part of the page's rendered UI, not a picker artifact. The preview was also inspected and shows the exported PNG.

## Coverage limits

These checks cover the local fixture and Chrome for Testing on macOS, not a compatibility sweep of third-party sites, the stable Chrome release, Windows/Linux, every display scale, or enterprise extension policies. The 4096-pixel cap and non-2× scales beyond the real 125% zoom case are covered by pure geometry tests rather than physical displays. Pinch zoom, dynamic/animated-state fidelity, off-screen capture, iframe internals, and complex silhouettes remain intentionally unsupported.

Before broader use, smoke-test the installed extension on the intended project's static cards in the Chrome version and display configuration used by its developers. No core implementation blocker remains from the recorded checks.
