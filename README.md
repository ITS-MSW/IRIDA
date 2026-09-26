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

The fixture includes nested text/icons/buttons, a click counter, a wide square section, a native modal dialog, and a card below the fold. Grabbing the button must not increment its counter; normal clicking after Close or Escape must increment it.

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
| Grab again | Release the previous result and return to picking |
| Close | Release the preview and restore page interaction |

Moving at least four CSS pixels starts a new hover selection. Layout updates alone do not reset ancestor navigation. The violet outline and label follow layout without rerendering React each frame.

## How it works

- **Content entrypoint/controller:** a minimal idle activation listener, a WXT shadow-root UI, React controls, composed-tree parent navigation, event suppression, and a small explicit `idle → picking → capturing → composing → preview` state model with error/cancel paths.
- **Background worker:** handles the toolbar action, injects `/content-scripts/picker.js` into the top frame's isolated world, validates typed requests and their originating document, and calls `browser.tabs.captureVisibleTab(windowId, { format: 'png' })`.
- **Capture/geometry:** records fresh viewport bounds, viewport and scroll dimensions, location, and supported corner radius; hides every extension visual and waits two animation frames; rechecks geometry before/after capture. Request-local listeners latch scrolling, resizing, navigation, visibility, and active-tab changes. Session/request IDs reject stale responses; only one capture runs at a time, with a 600 ms capture interval and no automatic retries.
- **Compositor:** accepts an already cropped subject canvas, its measured pixel scales, and a small preset. It decodes and cover-fills the bundled SVG into the output canvas, centers the subject with 64 CSS-equivalent pixels per side, adds a silhouette shadow, and produces a PNG Blob. The entire composition is reduced if its longest side exceeds 4096 pixels; the subject is never upscaled.

The CSS-to-bitmap mapping uses the actual screenshot dimensions divided by `innerWidth`/`innerHeight`, including scrollbar space. Containment is checked against the viewport's content area. Rectangle edges are rounded independently; scroll offsets and `devicePixelRatio` are never multiplied into the crop again. A 0.05 CSS-pixel containment tolerance accommodates rounding; off-screen elements are rejected rather than chopped.

Change `lib/compositor/default-preset.ts` or `assets/default-backdrop.svg` to replace the backdrop. Keep replacement SVGs self-contained. There is intentionally no customization interface.

## React Grab reuse

The installed **react-grab 0.2.0** exports `react-grab/primitives` with the requested `getElementAtPoint`, `getElementBounds`, and `isElementGrabbable` functions. IRIDA imports those functions directly behind `lib/picker/react-grab-adapter.ts`. The adapter normalizes the installed `{ x, y, width, height, borderRadius }` shape, filters out other documents/frames, and excludes our host across shadow/slot boundaries. The host also uses the supported `data-react-grab-ignore` attribute.

Upstream supplies deep hit testing, ignored-subtree and overlay filtering, and highlight bounds. IRIDA adds its own activation, stable parent/child navigation, confirmation, cancellation, and capture checks. Capture uses fresh native bounds because upstream's highlight bounds are briefly cached. No source files are vendored, and the visited page needs no React dependency.

The primitives were first built and run in the installed extension's isolated world. No React Grab interface, frozen styles, or page-global hooks appeared in that smoke check. The adapter is imported inside runtime initialization, avoiding build-time DOM access. The auto-start entry point, `freeze()`, source-context actions, framework/editor integrations, and agent workflows are unused. The exact study commit and applicable notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Permissions and temporary data

The production manifest contains only **`activeTab`** and **`scripting`**. It has no toolbar popup, registered content scripts, persistent host permissions, downloads permission, web-accessible resources, telemetry, storage, or remote services.

WXT 0.21.4 adds host permissions for a runtime entrypoint's `matches`. Accordingly, the picker uses `registration: 'runtime'` with `matches: []`. Styles are imported with `?inline` and passed to `createShadowRootUi` with `cssInjectionMode: 'manual'`, so neither CSS nor the backdrop needs site access or external fetches. `bun run build` checks the generated manifest and script path and copies third-party notices into the unpacked extension.

Viewport screenshots travel only through extension messaging and transient memory. The full viewport bitmap is closed immediately after cropping. Closing or grabbing again revokes the preview URL and drops its Blob. Downloads use a separate temporary Blob URL retained for 60 seconds so closing the preview cannot interrupt them. Pending frames/listeners and cancelled requests are cleaned up; only the activation listener remains while idle. Shadow DOM isolates styles, **not confidential data from the host page**.

## Supported scope and limitations

- Chrome desktop, ordinary HTTP/HTTPS pages (including localhost), static, fully visible top-level DOM elements. Open shadow-root hit testing is supported; iframe contents and closed shadow-root internals are outside scope.
- Single rectangular sections and opaque cards with four equal circular corners. Resolved circular pixel or percentage radii are supported. Nonuniform/elliptical corners, transparent rounded surfaces, CSS transforms/zoom, masks, clip paths, and ancestor clipping are rejected. Ordinary browser zoom is supported; pinch zoom is rejected.
- Capture preserves **pixels as visibly rendered**, including occlusion and background-dependent effects. It cannot recover transparent layers from glassmorphism, blend modes, or overlapping decoration. The presentation shadow replaces original shadows outside the element's border box.
- No full-page capture, stitching, off-screen rendering, multiple selections, hover-state freezing, or animated-state guarantees. Layout monitoring is best effort, not an atomic page freeze; an animation entirely inside unchanged bounds can still advance during capture.
- Chrome's restricted pages and the Chrome Web Store cannot be injected. A `!` action badge and explanatory action title report failure. A page reload or revoked access requires clicking the toolbar action again.
- Browser/platform screenshot size limits still apply. Very large or inconsistent captured dimensions are rejected before composition.

## Verification

`bun test` runs two focused tests with 80 assertions: a normal capture/composition path across density, zoom, fractional edges and scrollbars, and invalid/clipped/moved/stale-request rejection. No additional test framework is installed.

The packaged extension has been exercised in Chrome for Testing on the local fixture using actual toolbar activation and real `captureVisibleTab` pixels. Downloaded PNGs and browser-check evidence are kept locally under `output/playwright/` (ignored by Git). See [VERIFICATION.md](VERIFICATION.md) for the recorded results and remaining coverage limits.

References: [React Grab](https://github.com/aidenybai/react-grab), [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints), [WXT content scripts](https://wxt.dev/guide/essentials/content-scripts), [WXT React](https://wxt.dev/guide/essentials/frontend-frameworks), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [action](https://developer.chrome.com/docs/extensions/reference/api/action), [tabs capture](https://developer.chrome.com/docs/extensions/reference/api/tabs), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
