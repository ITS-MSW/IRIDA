import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { isRecord, isRequestId } from '../../lib/messaging';
import type { PickerController } from '../../lib/picker/controller';
import styles from './styles.css?inline';

export default defineContentScript({
  registration: 'runtime',
  matches: [],
  cssInjectionMode: 'manual',
  main(ctx) {
    if (window.top !== window) return;
    let controller: PickerController | undefined;
    let loading: Promise<PickerController> | undefined;
    const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message: unknown, sender, respond) => {
      if (sender.id !== browser.runtime.id || !isRecord(message)) return;
      if (message.type === 'irida:verify' && isRequestId(message)) {
        respond({ sessionId: message.sessionId, requestId: message.requestId, ok: controller?.verify(message) ?? false });
      }
      if (message.type !== 'irida:activate') return;
      // React Grab has browser-only module constants. Import only inside this runtime.
      loading ??= import('../../lib/picker/controller').then(({ PickerController }) => {
        if (ctx.isInvalid) throw new Error('The extension was reloaded. Refresh this page and try again.');
        return controller = new PickerController(ctx, styles);
      });
      void loading.then(instance => instance.toggle()).then(() => respond({ ok: true }), (error: unknown) => {
        loading = undefined;
        respond({ ok: false, error: error instanceof Error ? error.message : 'Could not open the picker.' });
      });
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { browser.runtime.onMessage.removeListener(listener); controller?.close(); });
  },
});
