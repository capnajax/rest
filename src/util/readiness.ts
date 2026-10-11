const outstandingTokens: Set<string> = new Set();
const failedTokens: Set<string> = new Set();
const resolvedTokens: Set<string> = new Set();
const tokenPromises = {} as Record<string, ((success: boolean) => void)[]>;
const allTokensPromises: Promise<void>[] = [];

/**
 * Call this function to register an async operation that must complete before
 * the application is considered ready. The token must be completed with
 * completeToken() for the application to be considered ready. If a token is
 * registered more than once, an error will be thrown.
 * @param token a simple text identifier for the async operation being
 * registered. This is used for tracking and awaiting the completion of the
 * operation.
 */
export function registerToken(token: string): void {
  if (
    outstandingTokens.has(token) ||
    resolvedTokens.has(token) ||
    failedTokens.has(token)
  ) {
    throw new Error(`Token "${token}" is already registered`);
  }

  outstandingTokens.add(token);
  allTokensPromises.push(awaitToken(token));
}

/**
 * Call this function to mark an initialization task as having been completed.
 * The token does not necessarily need to have been registered before calling
 * this function, but if it has been registered, the application will not
 * consider itself ready until this function is called with the token. If the
 * token is marked as completed more than once, an error will be thrown.
 * @param token the token to mark as completed
 * @param isSuccessful the outcome of the async operation (true for success,
 *  false for failure)
 * @returns the outcome of the token
 */
export function completeToken(token: string, isSuccessful: boolean = true)
: boolean {

  if (resolvedTokens.has(token)) {
    throw new Error(`Token "${token}" has already been successfully completed`);
  }
  if (failedTokens.has(token)) {
    throw new Error(`Token "${token}" has already been marked as failed`);
  }

  if (isSuccessful) {
    resolvedTokens.add(token);
  } else {
    failedTokens.add(token);
  }

  outstandingTokens.delete(token);
  if (tokenPromises[token]) {
    for (const callback of tokenPromises[token]) {
      callback(isSuccessful);
    }
    delete tokenPromises[token];
  }
  return isSuccessful;
}

/**
 * Returns a promise that resolves or rejects when a token has an outcome. The
 * token does not need to be registered before calling this function, it will
 * simply wait for the token to be registered and then have an outcome. If the
 * token has already had an outcome (ready or failed), the promise will resolve
 * or reject immediately.
 * @param token the token to wait for
 * @returns a Promise that resolves or rejects when the token has an outcome.
 */
export function awaitToken(token: string): Promise<void> {
  if (resolvedTokens.has(token)) {
    return Promise.resolve();
  }
  if (failedTokens.has(token)) {
    return Promise.reject(new Error(`Token "${token}" has already failed`));
  }
  return new Promise<void>((resolve, reject) => {
    tokenPromises[token] ||= [];
    tokenPromises[token].push((success: boolean) => {
      if (success) {
        resolve();
      } else {
        reject(new Error(`Token "${token}" failed`));
      }
    });
  });
}

/**
 * Returns true if there are no registered-but-uncompleted tokens and no failed
 * tokens, meaning the application is considered ready. If there are any
 * outstanding tokens or any failed tokens, this function will return false.
 * @returns true if the application is ready, false otherwise
 */
export function isReady(): boolean {
  return outstandingTokens.size === 0 && failedTokens.size === 0;
}

export function getOutstandingTokens(): string[] {
  return Array.from(outstandingTokens);
}

export function getFailedTokens(): string[] {
  return Array.from(failedTokens);
}


