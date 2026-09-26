import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isCaptureMessage, isRecord, matchesRequest, type CaptureMessage, type CaptureResponse, type VerifyMessage } from '../lib/messaging';

export default defineBackground(() => {
  const activating = new Set<number>();
  let capturing = false;
  let lastCapture = 0;

  async function activate(tab: Browser.tabs.Tab) {
    const tabId = tab.id;
    if (tabId === undefined || activating.has(tabId)) return;
    activating.add(tabId);
    try {
      if (!tab.url || !/^https?:\/\//.test(tab.url)) throw new Error('Open an HTTP or HTTPS page to grab UI.');
      const message = { type: 'irida:activate' } as const;
      let response: unknown;
      try {
        response = await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
      } catch {
        await browser.scripting.executeScript({
          target: { tabId, frameIds: [0] }, world: 'ISOLATED', files: ['/content-scripts/picker.js'],
        });
        response = await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
      }
      if (!isRecord(response) || response.ok !== true) {
        throw new Error(isRecord(response) && typeof response.error === 'string' ? response.error : 'Could not open the picker. Reload this page and try again.');
      }
      await browser.action.setBadgeText({ tabId, text: '' });
      await browser.action.setTitle({ tabId, title: 'IRIDA — Grab UI' });
    } catch (error) {
      await browser.action.setBadgeBackgroundColor({ tabId, color: '#7947cc' });
      await browser.action.setBadgeText({ tabId, text: '!' });
      const reason = error instanceof Error && !/Cannot access|Missing host permission/.test(error.message)
        ? error.message : 'Chrome does not allow grabbing this page. Open an ordinary website and try again.';
      await browser.action.setTitle({ tabId, title: `IRIDA — ${reason}` });
    } finally { activating.delete(tabId); }
  }

  browser.action.onClicked.addListener(tab => { void activate(tab).catch(() => {}); });

  async function capture(request: CaptureMessage, sender: Browser.runtime.MessageSender): Promise<CaptureResponse> {
    const id = { sessionId: request.sessionId, requestId: request.requestId };
    const fail = (error: string): CaptureResponse => ({ ...id, ok: false, error });
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (sender.id !== browser.runtime.id || sender.frameId !== 0 || tabId === undefined || windowId === undefined ||
      !sender.documentId || !sender.url || !/^https?:\/\//.test(sender.url)) {
      return fail('Capture is only available in the active page. Click IRIDA again.');
    }
    if (capturing || Date.now() - lastCapture < 600) return fail('Please wait a moment before grabbing again.');
    capturing = true;
    let changed = false;
    const onActivated = (info: Browser.tabs.OnActivatedInfo) => { if (info.windowId === windowId) changed = true; };
    const onFocus = (focusedWindow: number) => { if (focusedWindow !== windowId) changed = true; };
    const onUpdated = (id: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (id === tabId && (info.status === 'loading' || info.url !== undefined)) changed = true;
    };
    const onRemoved = (id: number) => { if (id === tabId) changed = true; };
    browser.tabs.onActivated.addListener(onActivated);
    browser.windows.onFocusChanged.addListener(onFocus);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);

    const validate = async () => {
      const tabs = await browser.tabs.query({ active: true, windowId });
      const tab = tabs[0];
      if (changed || !tab || tab.id !== tabId || tab.windowId !== windowId || tab.url !== sender.url || tab.status === 'loading') {
        throw new Error('The active page changed during capture. Return to the page and try again.');
      }
      const message: VerifyMessage = { ...id, type: 'irida:verify' };
      const reply: unknown = await browser.tabs.sendMessage(tabId!, message, { documentId: sender.documentId! });
      if (changed || !isRecord(reply) || reply.ok !== true || !matchesRequest(id, reply as unknown as VerifyMessage)) {
        throw new Error('The selection changed during capture. Grab it again.');
      }
    };

    try {
      await validate();
      lastCapture = Date.now();
      const png = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
      await validate();
      return { ...id, ok: true, png };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return fail(/during capture|selection changed/.test(message) ? message
        : 'Chrome could not capture this page. Click IRIDA again to grant access, then try once more.');
    } finally {
      capturing = false;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.windows.onFocusChanged.removeListener(onFocus);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    }
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isCaptureMessage(message)) return;
    void capture(message, sender).then(sendResponse, () => sendResponse({
      sessionId: message.sessionId, requestId: message.requestId, ok: false, error: 'Capture failed. Please try again.',
    } satisfies CaptureResponse));
    // Chrome's callback contract works even on versions without Promise listeners.
    return true;
  });
});
