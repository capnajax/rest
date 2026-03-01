import { getLogger } from '@/util/logger.ts';

const MODULE = 'readiness';

const outstandingTokens: Set<string> = new Set();

export function registerToken(token: string): void {
  const log = getLogger(MODULE, 'registerToken');
  log.info('Preparing token:', token);
  outstandingTokens.add(token);
}

export function tokenReady(token: string): void {
  const log = getLogger(MODULE, 'tokenReady');
  log.info('Token ready:', token);
  outstandingTokens.delete(token);
  if (outstandingTokens.size === 0) {
    log.info('All tokens ready. System is now healthy.');
  } else {
    log.info(
      `${outstandingTokens.size > 1
        ? outstandingTokens.size + ' tokens'
        : 'One token'
      } still outstanding:`,
      Array.from(outstandingTokens).join(', ')
    );
  }
}

export function isReady(): boolean {
  return outstandingTokens.size === 0;
}

export function getOutstandingTokens(): string[] {
  return Array.from(outstandingTokens);
}