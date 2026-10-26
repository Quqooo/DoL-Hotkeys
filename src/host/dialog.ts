const HOST_CLASS = 'dolhk-dialog-host';

let pending: ((ok: boolean) => void) | null = null;
let wired = false;

function dialogApi(): NonNullable<Window['Dialog']> | null {
  const candidates = [window.Dialog, window.SugarCube?.Dialog];
  for (const api of candidates) {
    if (api && typeof api.setup === 'function' && typeof api.open === 'function') return api;
  }
  return null;
}

function settle(ok: boolean): void {
  const resolve = pending;
  pending = null;
  if (resolve) resolve(ok);
}

function closeHost(): void {
  try {
    dialogApi()?.close();
  } catch {
    /* already closed */
  }
}

function wire(): void {
  if (wired) return;
  wired = true;
  window.jQuery?.(document).on(':dialogclosed', () => settle(false));
}

function actionButton(label: string, choose: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'dolhk-dialog-btn';
  node.textContent = label;
  node.addEventListener('click', choose);
  return node;
}

export function confirmDialog(message: string, okLabel: string, cancelLabel: string, title: string): Promise<boolean> {
  const api = dialogApi();
  if (!api) return Promise.resolve(true);
  wire();
  settle(false);

  const choose = (ok: boolean): void => {
    settle(ok);
    closeHost();
  };

  const body = document.createElement('div');
  body.className = 'dolhk-dialog-body';
  const text = document.createElement('p');
  text.className = 'dolhk-dialog-text';
  text.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'dolhk-dialog-actions';
  actions.append(actionButton(cancelLabel, () => choose(false)), actionButton(okLabel, () => choose(true)));
  body.append(text, actions);

  try {
    api.setup(title, HOST_CLASS);
    api.append(body);
    api.open();
  } catch (error) {
    console.warn('[dol-hotkeys] dialog failed', error);
    closeHost();
    return Promise.resolve(false);
  }

  return new Promise<boolean>(resolve => {
    pending = resolve;
  });
}
