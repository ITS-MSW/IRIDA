# Verification

## 2026-11-06 preview appearance and copy

Production extension rebuilt and reloaded in the user's installed Brave. The existing local fixture was served at `http://127.0.0.1:4173` in a separate QA window.

- Rounded and unequal-corner cards visually retain their silhouettes; the source-page corner patches recorded below are absent. The validator now accepts both `round` and its computed equivalent `superellipse(1)`.
- Lavender, Sand, Midnight, and solid backgrounds exercised. Custom `#b7d9c4` visibly produced a green background. A hex field replaces the native color well, which did not open reliably during this overlay QA.
- Padding changes update the preview dimensions (64: 1024 × 1103; 16: 832 × 911; 160: 1408 × 1487). Shadow on/off exercised.
- Copy image reports success from the resolved clipboard write, including after editing. Pasting into another app was not verified: Preview app access timed out.
- Save PNG completed a real download (`showcase-20261106-220950.png`, 1408 × 1487). The downloaded file was opened and visually inspected: complete rounded card, white background, large padding, no presentation shadow, matching the chosen settings.
- Close restores page interaction: the fixture counter increments normally afterward. Grab again captures successfully and resets to Lavender, 64px padding, shadow on, without stale copy feedback.
- Typecheck, production build/manifest checks, and all six existing tests (141 assertions) pass. No new tests were added in this change; the earlier uncommitted tests are included with user approval.

Limits: this pass does not repeat the historical live-site matrix below, exhaustively exercise focus trapping, induce composition/clipboard failures, or verify cross-app paste. Stale-render rejection and resource cleanup were reviewed in the controller; no browser heap profiling was performed. The final production build remains loaded in Brave.

## 2026-10-10 compatibility changes — automated and Brave verification

`bun test tests/target.test.ts` reproduced six rejections through the real `inspectTarget` path before changes: unequal corners, elliptical corners, transparent rounded wrappers, partial opacity, CSS scale, and CSS zoom. The test supplies controlled computed styles and DOM measurements; it does not emulate a browser renderer or prove exported pixels.

After the changes:

- `bun test`: **6 pass, 0 fail, 141 assertions**. Includes expected radii, scaled ancestor clipping, opacity changes, related/unrelated scrolling, and the existing crop/message/worker safeguards.
- `bun run typecheck`: passes.
- `bun run build`: passes; generated MV3 permissions remain `activeTab` + `scripting` only.
- `git diff --check`: passes.
- Added hover-time eligibility guidance and kept invalid confirmation in picking mode instead of opening an error dialog.
- Extended the existing fixture with a Card appearance selector and independently scrolling panel for the remaining browser checks.

### Brave QA result at that time

The production extension was rebuilt and reloaded in installed Brave **154.1.96.60** through Computer Use. Toolbar activation, parent/child navigation, preview, Save PNG, Grab again, Escape, click suppression, and recovery from an invalid selection were exercised. Eleven actual PNGs were saved under `output/brave-qa-2026-10-10/` and their encoded dimensions checked.

**One confirmed visual defect remains:** ordinary rounded cards and dialogs retain rectangular patches of the source page outside their corners. Brave reports the fixture's computed `corner-shape` as `superellipse(1)` for its ordinary 22px radius; `lib/capture/target.ts:29-30` accepts only `round`, so it returns no mask. The defect appears on the local fixture and live ASFAR carousel card. This build is not visually cleared for release; no capture code was changed during this QA run.

| Case | Target tests | Current Brave result |
| --- | --- | --- |
| Unequal or elliptical corners | Accepted, resolved radii asserted | Both export 1024 × 1103; rounded-mask defect remains |
| Transparent rounded wrapper | Accepted as visible rectangle | 1024 × 1103; expected page pixels retained |
| Stable partial opacity | Accepted; changing opacity still aborts | 1024 × 1103; composited appearance retained; corner defect |
| Positive axis-aligned scale | Accepted; nested scale/clipping asserted | 909 × 1018; correct content and bounds; corner defect |
| CSS zoom plus unrelated panel scroll | Zoom accepted; unrelated scroll ignored | 947 × 1014 while unrelated panel scrolls; no false abort; corner defect |
| Clipped, rotated, off-screen targets | Rejected | Hover warning and rejected click keep picker open; visible-child recovery succeeds |
| Removed/moved targets during capture | Rejected in controlled tests | Not repeated in this browser run |
| Native modal | Existing support | 1096 × 726; original modal remains usable; corner defect |
| Live ASFAR | Existing support | Navigation 2560 × 360 and carousel card 861 × 1106 saved; card corner defect reproduced |
| Live DHAD | Historical dashboard evidence below | Dashboard redirects to login; public login form saved at 1056 × 732 |

Local detailed report and evidence: [Brave QA report](output/brave-qa-2026-10-10/report.md), [modal defect](output/brave-qa-2026-10-10/native-modal.png), [ASFAR card defect](output/brave-qa-2026-10-10/asfar-carousel-card.png). These artifacts are Git-ignored. Preview images were visually inspected; downloaded rounded, modal, scaled, and ASFAR card files were also opened directly.

Remaining: fix and visually recheck rounded masking, retest the authenticated DHAD dashboard when a session is available, and broaden site/display coverage. Browser zoom, target removal, active-tab/route changes during capture, and exhaustive console checks were not repeated. The installed extension now uses the rebuilt production files; previous browser-access denial no longer blocks this environment.

## 2026-09-26 browser-verified baseline

## Automated checks

- `bun install --frozen-lockfile`: reproducible install from the committed lockfile.
- `bun run typecheck`: strict TypeScript passes.
- `bun test`: **4 passing tests, 0 failures, 120 assertions**. Covers measured pixel scales (1, 1.25, 1.5, 2, 2.5), fractional edge rounding, fractional container clips and scrollbar gutters, translation matrices versus scaling/skew/perspective, invalid dimensions, off-screen bounds, meaningful movement, adaptive output dimensions, the 4096-pixel cap, no upscaling, message validation, stale session/request IDs, SPA sender URLs, and discarding pixels after tab or route changes.
- `bun run build`: production Chrome MV3 build passes; `scripts/check-build.ts` verifies the generated manifest and actual content-script path, and bundles the notices.
- Generated manifest: `activeTab` + `scripting`, no host permissions, no automatic content scripts, no popup, no downloads permission, no web-accessible resources.

## Brave live-dashboard follow-up

Tested the installed production extension in the user's existing Brave **153.1.95.104** on **https://app.dhadhackers.com/student/dashboard**, using native browser actions and the authenticated page. The original document was kept alive across extension reloads; this was not a fresh-load-only test.

Three capture problems and a selection problem were reproduced and fixed:

- The unchanged dashboard repeatedly returned “The active page changed during capture.” A temporary worker probe showed the same tab/window, `status: complete`, and a valid document ID, but the sender's path was `/` while the live tab path was `/student/dashboard`. The worker now pins the live route at capture start and retains document-ID handshakes and all during-capture change guards. The probe was removed. The new background regression test failed with the exact original error before the fix and passes afterward.
- Feed's square inner wrapper and rounded outer card have the same bounds. Parent navigation previously skipped the rounded outer card. It now preserves same-size ancestors when their corner radii differ. The live sequence `h2 → header → square wrapper → rounded card` reaches the intended surface; Down retraces the path.
- The linked course card had a settled `matrix(1, 0, 0, 1, 0, 0)` on a carousel ancestor. This was incorrectly rejected as a transform. Identity matrices are accepted; the ASFAR follow-up below also supports translations.
- The course card then exposed fractional container heights being compared with integer `clientHeight`. Clipping now uses fractional bounds, resolved borders, and measured scrollbar gutters. The previously rejected whole card exports correctly without increasing the containment tolerance or clamping the crop.

| Live check | Result |
| --- | --- |
| Continue watching, whole rounded card | Saved **1136 × 832** PNG. |
| Feed, rounded parent selected with Up | Saved **1136 × 832** PNG; corners now match the actual card. |
| Linked course card, with settled carousel wrapper | Saved **985 × 858** PNG. Confirmation did not follow the underlying link. |
| Repeated captures / Grab again | Successive captures returned valid previews. |
| Parent / child controls | Observed both directions, including same-size rounded parent selection. |
| Close / Escape | Removed active UI; normal page navigation worked afterward. |
| SPA navigation | Navigated to Catalogue and back, reactivated IRIDA, and captured Feed again at **1136 × 832**. |
| Save PNG | Brave's real Save dialog completed all three downloads; PNG files were opened and visually inspected. |

Local, Git-ignored evidence: `output/playwright/dhadhackers-continue-brave.png`, `output/playwright/dhadhackers-feed-brave.png`, and `output/playwright/dhadhackers-course-brave.png`. All three contain readable text, the expected complete subject, clean rounded boundaries, a baked-in backdrop and shadow, and no picker controls. The updated production build is reloaded in Brave; the dashboard was left usable with the picker closed.

The dashboard console also contained its own favicon 404, theme-toggle error, and chart-size warnings. No changes were made to DHADHACKERS. Live-site zoom and mid-capture tab switching were not repeated in this follow-up; prior fixture evidence and the focused worker regression test cover those separate checks.

## Brave ASFAR follow-up

Reproduced “Transformed or clipped elements are not supported” on a fully visible Dakhla card at **https://www.asfarsahraoui.com/**. The card itself had no transform. Its carousel ancestor used `matrix(1, 0, 0, 1, 432.5, 0)`: a translation that does not change the card's shape. Rejecting every nonidentity ancestor transform was the cause.

The shared validator now accepts translation matrices and individual CSS `translate`, including nested ancestors. It uses the browser's already-transformed viewport bounds without adding the offset again. Scaling, rotation, skew, perspective, clipping, and movement checks remain enforced. No hostname-specific rules were added. The existing geometry tests cover translation acceptance and rejection of shape-changing or invalid matrices.

Reloaded the actual production extension in Brave, without refreshing the ASFAR document. The original failing selection generated **861 × 1169** pixels. Saved it through Brave's Save dialog and opened `output/playwright/asfar-carousel-brave.png`: correct complete card, readable text, rounded boundaries, backdrop and shadow, no picker UI. A second carousel card also produced **861 × 1169** pixels. An edge card was correctly rejected as partially off-screen with no PNG offered; Grab again, `h4 → card → h4 → card`, and confirmation recovered to another successful preview. Escape removed the UI. Returned to the existing DHAD dashboard and captured its rounded Feed parent again at **1136 × 832** pixels with this same build.

The floating ASFAR navigation bar also captured successfully at **2560 × 384** pixels; its actual PNG preview showed the complete rounded bar on the backdrop. The updated build remains loaded in Brave, and ASFAR was left with the picker closed.

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

These checks cover the local fixture in Chrome for Testing and the live DHADHACKERS dashboard and ASFAR home page in Brave on macOS, not a compatibility sweep of third-party sites, the stable Chrome release, Windows/Linux, every display scale, or enterprise extension policies. The 4096-pixel cap and non-2× scales beyond the real 125% zoom case are covered by pure geometry tests rather than physical displays. Pinch zoom, dynamic/animated-state fidelity, off-screen capture, iframe internals, and complex silhouettes remain intentionally unsupported.

Before broader use, smoke-test additional sites and display configurations. The live dashboard failures reported in this follow-up were reproduced, corrected, and rechecked in the installed extension.
