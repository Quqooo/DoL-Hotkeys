export function sugar(): any {
  return window.SugarCube;
}

export function engine(): any {
  return sugar()?.Engine;
}

export function stateTemp(): any {
  return sugar()?.State?.temporary;
}

export function gameVariables(): any {
  return sugar()?.State?.variables;
}

export function currentPassage(): string {
  return String(sugar()?.State?.passage ?? '');
}

export function wikifyEval(markup: string): void {
  const wikifier = window.Wikifier ?? sugar()?.Wikifier;
  wikifier?.wikifyEval(markup);
}
