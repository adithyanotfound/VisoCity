// Worldgen package placeholder for repository scanner & metric collector
export interface WorldScannerOptions {
  repoPath: string;
  maxFiles?: number;
}

export function isScannerAvailable(): boolean {
  return true;
}
