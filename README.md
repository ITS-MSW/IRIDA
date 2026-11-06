# IRIDA — UI Showcase Grab

`ui-showcase-poc` is a Chrome Manifest V3 extension built with WXT, React, strict TypeScript, and Canvas 2D.

Click the extension action, hover a live element, choose the desired ancestor, and click to receive a finished PNG. The exported bitmap contains the selected UI, a bundled off-white/lavender backdrop, and a presentation shadow. No upload, cropping step, or editor tab.

## Run it

Use Bun 1.4+ and Node 22+ (WXT's tooling requires Node). Dependencies are pinned and `bun.lock` is included.

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun run fixture
```

1. Open `chrome://extensions` in Chrome desktop and enable **Developer mode**.
2. Choose **Load unpacked**, then select this workspace's **`.output/chrome-mv3`** directory.
3. Open **http://127.0.0.1:4173** or your own HTTP/HTTPS project.
4. Click **IRIDA — UI Showcase Grab** in Chrome's extension menu (pinning is optional).
5. Hover the card heading, press **↑** to select the whole card, and click without moving the pointer away.
6. Choose **Save PNG** in the preview. The filename is `showcase-YYYYMMDD-HHMMSS.png`.

The fixture includes nested text/icons/buttons, a click counter, a wide square section, a native modal dialog, and a card below the fold. Its Card appearance selector exercises unequal/elliptical corners, transparency, opacity, scaled ancestors, CSS zoom, clipping, and rotation. The separate scrolling panel checks that unrelated activity does not cancel a capture. Grabbing the button must not increment its counter; normal clicking after Close or Escape must increment it.

For development:

```sh
bun run dev
```

WXT serves the development extension from `.output/chrome-mv3-dev` and normally launches Chrome. The production directory above is the build used for permission and capture verification. After rebuilding, reload the extension in `chrome://extensions`, refresh the target page, and click IRIDA again to renew `activeTab` access.

## Controls

| Action | Result |
| --- | --- |
| Toolbar action | Start picking; toggle an existing session closed |
| Pointer movement | Target useful elements through React Grab's hit testing |
| ↑ | Next useful composed-tree ancestor, skipping roots and same-bounds wrappers |
| ↓ | Retrace the parent-selection path toward the original target |
| Click | Confirm exactly the highlighted element; suppress the page's click |
| Escape | Cancel and remove the active UI |
| Save PNG | Download the actual PNG shown in the preview |
| Copy image | Copy the current PNG to the clipboard |
| Grab again | Release the previous result and return to picking |
| Close | Release the preview and restore page interaction |

Moving at least four CSS pixels starts a new hover selection. Layout updates alone do not reset ancestor navigation. Same-size ancestors with different corner radii remain selectable, so a rounded card is not skipped in favor of its square inner wrapper. The violet outline and label follow layout without rerendering React each frame. Unsupported selections show a dashed amber outline and an explanation while hovering; clicking them keeps the picker open so you can choose a parent or another target.

## How it works

- **Content entrypoint/controller:** a minimal idle activation listener, a WXT shadow-root UI, React controls, composed-tree parent navigation, event suppression, and a small explicit `idle → picking → capturing → composing → preview` state model with error/cancel paths.
- **Background worker:** handles the toolbar action, injects `/content-scripts/picker.js` into the top frame's isolated world, validates typed requests and their originating document, and calls `browser.tabs.captureVisibleTab(windowId, { format: 'png' })`. It pins the live URL at capture start rather than comparing it with the sender's potentially older document URL, allowing SPA navigation before selection while rejecting navigation during capture.
- **Capture/geometry:** records fresh viewport bounds, viewport and scroll dimensions, location, and supported corner radius; hides every extension visual and waits two animation frames; rechecks geometry before/after capture. Request-local listeners latch scrolling of the page or selected element’s ancestors/descendants, resizing, navigation, visibility, and active-tab changes. Scrolling an unrelated panel does not cancel the job. Changes to the selection’s scale, opacity, and corner geometry also invalidate the capture. Session/request IDs reject stale responses; only one capture runs at a time, with a 600 ms capture interval and no automatic retries.
- **Compositor:** accepts an already cropped subject canvas, its measured pixel scales, and a small preset. It decodes and cover-fills the bundled SVG into the output canvas, centers the subject with 64 CSS-equivalent pixels per side, adds a silhouette shadow, and produces a PNG Blob. The entire composition is reduced if its longest side exceeds 4096 pixels; the subject is never upscaled.

The CSS-to-bitmap mapping uses the actual screenshot dimensions divided by `innerWidth`/`innerHeight`, including scrollbar space. Containment is checked against the viewport's content area. Rectangle edges are rounded independently; scroll offsets and `devicePixelRatio` are never multiplied into the crop again. Nested container clipping retains fractional bounds and accounts for borders and scrollbar gutters instead of treating integer `clientWidth`/`clientHeight` as exact edges. A 0.05 CSS-pixel containment tolerance accommodates rounding; off-screen elements are rejected rather than chopped.

Change `lib/compositor/default-preset.ts` or `assets/default-backdrop.svg` to replace the backdrop. Keep replacement SVGs self-contained. The preview offers Lavender, Sand, Midnight, and a custom hex color, padding from 0 to 160 CSS-equivalent pixels, and a shadow toggle. Changes recompose the retained crop without recapturing the page. Copy and Save remain unavailable until the current settings finish rendering. Settings reset on Grab again or Close.

## React Grab reuse

The installed **react-grab 0.2.0** exports `react-grab/primitives` with the requested `getElementAtPoint`, `getElementBounds`, and `isElementGrabbable` functions. IRIDA imports those functions directly behind `lib/picker/react-grab-adapter.ts`. The adapter normalizes the installed `{ x, y, width, height, borderRadius }` shape, filters out other documents/frames, and excludes our host across shadow/slot boundaries. The host also uses the supported `data-react-grab-ignore` attribute.

Upstream supplies deep hit testing, ignored-subtree and overlay filtering, and highlight bounds. IRIDA adds its own activation, stable parent/child navigation, confirmation, cancellation, and capture checks. Capture uses fresh native bounds because upstream's highlight bounds are briefly cached. No source files are vendored, and the visited page needs no React dependency.

The primitives were first built and run in the installed extension's isolated world. No React Grab interface, frozen styles, or page-global hooks appeared in that smoke check. The adapter is imported inside runtime initialization, avoiding build-time DOM access. The auto-start entry point, `freeze()`, source-context actions, framework/editor integrations, and agent workflows are unused. The exact study commit and applicable notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Permissions and temporary data

The production manifest contains only **`activeTab`** and **`scripting`**. It has no toolbar popup, registered content scripts, persistent host permissions, downloads permission, web-accessible resources, telemetry, storage, or remote services.

WXT 0.21.4 adds host permissions for a runtime entrypoint's `matches`. Accordingly, the picker uses `registration: 'runtime'` with `matches: []`. Styles are imported with `?inline` and passed to `createShadowRootUi` with `cssInjectionMode: 'manual'`, so neither CSS nor the backdrop needs site access or external fetches. `bun run build` checks the generated manifest and script path and copies third-party notices into the unpacked extension.

Viewport screenshots travel only through extension messaging and transient memory. The full viewport bitmap is closed immediately after cropping. Closing or grabbing again revokes the preview URL, drops its Blob, and releases the retained crop canvas. Downloads use a separate temporary Blob URL retained for 60 seconds so closing the preview cannot interrupt them. Pending frames/listeners and cancelled requests are cleaned up; only the activation listener remains while idle. Shadow DOM isolates styles, **not confidential data from the host page**.

## Supported scope and limitations

- Chrome desktop, ordinary HTTP/HTTPS pages (including localhost), static, fully visible top-level DOM elements. Open shadow-root hit testing is supported; iframe contents and closed shadow-root internals are outside scope.
- Rectangular sections, rounded cards, CSS translations, positive axis-aligned scaling, and CSS zoom. Unequal and elliptical corners are supported, with percentage resolution and CSS overlap reduction. Bounds, borders, and scrollbar gutters account for ancestor scale. Ordinary browser zoom is supported; pinch zoom is rejected.
- Rounded masks are applied to solid surfaces, replaced image/video/canvas elements, and rounded overflow clips. A transparent wrapper without a reliable rounded silhouette is captured as its visible rectangle, retaining the page background. Unsupported radius expressions or non-round corner shapes also retain the rectangle. Partial opacity is captured as visibly composited; its background is not extracted.
- Rotation, mirroring, skew, perspective, custom masks/clip paths, and partially clipped/off-screen targets remain rejected.
- Capture preserves **pixels as visibly rendered**, including occlusion and background-dependent effects. It cannot recover transparent layers from glassmorphism, blend modes, or overlapping decoration. The presentation shadow replaces original shadows outside the element's border box.
- No full-page capture, stitching, off-screen rendering, multiple selections, hover-state freezing, or animated-state guarantees. Layout monitoring is best effort, not an atomic page freeze; an animation entirely inside unchanged bounds can still advance during capture.
- Chrome's restricted pages and the Chrome Web Store cannot be injected. A `!` action badge and explanatory action title report failure. A page reload or revoked access requires clicking the toolbar action again.
- Browser/platform screenshot size limits still apply. Very large or inconsistent captured dimensions are rejected before composition.

## Verification

`bun test` runs six focused tests with 141 assertions: capture/composition geometry across density, zoom, fractional edges and scrollbars; axis-aligned transforms and corner resolution; actual target-validation branches supplied with controlled DOM measurements/styles; related versus unrelated scroll events; invalid/clipped/moved/stale-request rejection; capture after SPA navigation with an older sender URL; and discarding pixels after tab or route changes. No additional test framework is installed.

The October 10 compatibility changes pass unit tests, strict type checking, and the production build. The rebuilt extension was reloaded and tested through Computer Use in installed Brave 154.1.96.60 on the fixture, ASFAR, and DHAD's public login form. That run found a rounded-mask defect leaving source-page pixels outside rounded corners: Brave serializes ordinary `corner-shape` as `superellipse(1)`, while the validator then accepted only `round`. The November 6 update accepts the equivalent `superellipse(1)` serialization and visually rechecks rounded masking in Brave (see `VERIFICATION.md`). Eleven PNGs and a detailed report are saved locally under `output/brave-qa-2026-10-10/`. The authenticated DHAD dashboard redirected to login and was not retested.

The September baseline was exercised in Chrome for Testing on the local fixture and in the user's installed Brave on the live DHADHACKERS student dashboard and ASFAR home page, using actual toolbar activation and real `captureVisibleTab` pixels. Downloaded PNGs and browser-check evidence are kept locally under `output/playwright/` (ignored by Git). See [VERIFICATION.md](VERIFICATION.md) for the recorded results and remaining coverage limits.

References: [React Grab](https://github.com/aidenybai/react-grab), [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints), [WXT content scripts](https://wxt.dev/guide/essentials/content-scripts), [WXT React](https://wxt.dev/guide/essentials/frontend-frameworks), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [action](https://developer.chrome.com/docs/extensions/reference/api/action), [tabs capture](https://developer.chrome.com/docs/extensions/reference/api/tabs), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
