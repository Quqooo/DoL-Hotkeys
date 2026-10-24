import { isAvailable, runAction } from './actions';
import { dictFor } from './i18n';
import { registerBuiltin } from './registry';
import { DEFAULT_BINDS } from './settings';
import { ACTION_ORDER } from './types';

export function installBuiltins(): void {
  for (const id of ACTION_ORDER) {
    registerBuiltin({
      id,
      label: lang => dictFor(lang).names[id],
      defaultBind: DEFAULT_BINDS[id],
      available: () => isAvailable(id),
      handler: () => runAction(id),
    });
  }
}
