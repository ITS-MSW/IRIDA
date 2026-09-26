import { expect, mock, test } from 'bun:test';
import type { CaptureMessage, CaptureResponse, VerifyMessage } from '../lib/messaging';

function event<Args extends unknown[]>() {
  const listeners = new Set<(...args: Args) => unknown>();
  return {
    addListener: (listener: (...args: Args) => unknown) => { listeners.add(listener); },
    removeListener: (listener: (...args: Args) => unknown) => { listeners.delete(listener); },
    emit: (...args: Args) => [...listeners].map(listener => listener(...args)),
    clear: () => listeners.clear(),
    get size() { return listeners.size; },
  };
}

const dashboardTab = { id: 7, windowId: 3, url: 'https://example.com/student/dashboard', status: 'complete' };
let activeTab = { ...dashboardTab };
let duringCapture = () => {};
const captureVisibleTab = mock(async () => { duringCapture(); return 'data:image/png;base64,AAAA'; });
const sendMessage = mock(async (_tabId: number, message: VerifyMessage, _options: { documentId: string }) => ({
  sessionId: message.sessionId, requestId: message.requestId, ok: true,
}));
const api = {
  runtime: {
    id: 'irida-test',
    onMessage: event<[unknown, Browser.runtime.MessageSender, (response: CaptureResponse) => void]>(),
  },
  action: { onClicked: event<[Browser.tabs.Tab]>() },
  tabs: {
    query: async () => [activeTab], sendMessage, captureVisibleTab,
    onActivated: event<[Browser.tabs.OnActivatedInfo]>(),
    onUpdated: event<[number, Browser.tabs.OnUpdatedInfo]>(),
    onRemoved: event<[number]>(),
  },
  windows: { onFocusChanged: event<[number]>() },
};
mock.module('wxt/browser', () => ({ browser: api }));
const { default: background } = await import('../entrypoints/background');

const request: CaptureMessage = {
  type: 'irida:capture',
  sessionId: '11111111-1111-4111-8111-111111111111',
  requestId: '22222222-2222-4222-8222-222222222222',
  rect: { x: 20, y: 30, width: 300, height: 200 },
  viewport: { width: 1200, height: 800, contentWidth: 1200, contentHeight: 800 },
};
const sender = {
  id: api.runtime.id, frameId: 0, documentId: 'same-document',
  url: 'https://example.com/', tab: activeTab,
} as unknown as Browser.runtime.MessageSender;

function capture(from = sender) {
  api.runtime.onMessage.clear();
  api.action.onClicked.clear();
  captureVisibleTab.mockClear();
  sendMessage.mockClear();
  background.main();
  return new Promise<CaptureResponse>(resolve => {
    expect(api.runtime.onMessage.emit(request, from, resolve)).toEqual([true]);
  });
}

function expectCleanup() {
  for (const events of [api.tabs.onActivated, api.tabs.onUpdated, api.tabs.onRemoved, api.windows.onFocusChanged]) {
    expect(events.size).toBe(0);
  }
}

test('captures the current route when the same document sender still reports its original URL', async () => {
  activeTab = { ...dashboardTab };
  duringCapture = () => {};
  const response = await capture();
  expect(response).toEqual({ sessionId: request.sessionId, requestId: request.requestId, ok: true, png: 'data:image/png;base64,AAAA' });
  expect(captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' });
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(sendMessage).toHaveBeenCalledWith(7, { sessionId: request.sessionId, requestId: request.requestId, type: 'irida:verify' }, { documentId: 'same-document' });
  expectCleanup();
});

test('discards pixels if the tab or route changes during capture', async () => {
  for (const change of [
    () => { activeTab = { ...activeTab, id: 8 }; api.tabs.onActivated.emit({ tabId: 8, windowId: 3 }); },
    // A changed live URL must also fail if its update event has not arrived yet.
    () => { activeTab = { ...activeTab, url: 'https://example.com/student/formations' }; },
  ]) {
    activeTab = { ...dashboardTab };
    duringCapture = change;
    const response = await capture({ ...sender, url: activeTab.url });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toContain('active page changed during capture');
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(response).not.toHaveProperty('png');
    expectCleanup();
  }
});
