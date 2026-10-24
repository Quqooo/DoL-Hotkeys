import { isAvailable, runAction } from '../host/actions';
import { dictFor } from '../ui/i18n';
import { registerBuiltin } from './data/registry';
import { DEFAULT_BINDS } from '../core/settings';
import { ACTION_ORDER } from '../core/types';

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
