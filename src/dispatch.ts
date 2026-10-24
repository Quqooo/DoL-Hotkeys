import { runAction } from './actions';
import { sameBind } from './keys';
import { getConfig } from './settings';
import { ACTION_ORDER, type ActionId, type Bind } from './types';

/** legacy：按 ACTION_ORDER 取首个精确命中，保持既有行为 */
export function matchBuiltin(held: Bind): ActionId | null {
  const binds = getConfig().binds;
  for (const action of ACTION_ORDER) {
    const bind = binds[action];
    if (!bind || bind.length !== held.length) continue;
    if (sameBind(bind, held)) return action;
  }
  return null;
}

export function dispatch(held: Bind): ActionId | null {
  const action = matchBuiltin(held);
  if (!action) return null;
  runAction(action);
  return action;
}
