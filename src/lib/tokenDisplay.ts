export function getTokenTicker(symbol: string): string {
  return symbol.replace(/^c/, '').replace(/Mock$/, '');
}

export function getTokenDisplayName(name: string): string {
  return name.replace(/^Confidential\s/, '').replace(/\sMock$/, '');
}
