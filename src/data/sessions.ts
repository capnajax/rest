import { getLogger } from "../util/logger.js";
import { yieldToEventLoop } from "../util/tools.js";

const MANAGER_MODULE = 'd.sessions::SessionManager';
const SESSION_MODULE = 'd.sessions::Session';

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sweepingInterval: NodeJS.Timeout | null = null;

  /**
   * Create a new session for the given user ID. If userId is null, creates an
   * anonymous session.
   * @param userId The ID of the user for whom to create the session, or null
   *  for an anonymous session.
   * @returns Promise that resolves to the newly created session.
   */
  createSession(userId: string|null): Promise<Session> {
    const session = Session.create(userId);
    this.sessions.set(session.sessionId, session);
    return Promise.resolve(session);
  }

  deleteSession(id: string) {
    this.sessions.delete(id);
  }

  extendSession(id: string): boolean {
    const log = getLogger(MANAGER_MODULE, 'extendSession');
    const session = this.sessions.get(id);
    if (session && !session.isExpired()) {
      session.extend();
      log.silly('extended session %s', id);
      return true;
    }
    return false;
  }

  /**
   * Invalidate all sessions for a given user ID. This is useful for logging
   * out a user from all devices or sessions. 
   * @param userId The ID of the user whose sessions should be invalidated.
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    let counter = 0;
    for (const session of this.sessions.values()) {
      if (++counter % 100 === 0) {
        // Yield to event loop every 100 sessions to avoid blocking
        await yieldToEventLoop();
      }
      if (session.userId === userId) {
        session.invalidate();
      }
    }
  }

  /**
   * Get the session with the given ID if it exists and is not expired.
   * @param id The session ID to retrieve.
   * @returns Promise that resolves to the session if it exists and is valid,
   *  `null` otherwise.
   */
  async getSession(
    id: string,
    includeInvalidated: boolean = false
  ): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (session && !session.isExpired() && (includeInvalidated || !session.invalidated)) {
      return session.clone();
    }
    return null;
  }

  /**
   * Check if a session with the given ID exists and is not expired.
   * @param id The session ID to check.
   * @returns Promise that resolves to `true` if the session exists and is
   *  valid, `false` otherwise.
   */
  async hasSession(
    id: string,
    includeInvalidated: boolean = false
  ): Promise<boolean> {
    const session = this.sessions.get(id);
    return !!session && !session.isExpired() &&
      (includeInvalidated || !session.invalidated);
  }

  async patchSession(id: string, patch: Partial<Session>)
  : Promise<boolean> {
    const session = this.sessions.get(id);
    if (session && !session.isExpired()) {
      Object.assign(session.data, patch);
      return true;
    }
    return false;
  }

  startSweeping() {
    if (this.sweepingInterval === null) {
      this.sweepingInterval = setInterval(() => {
        const log = getLogger(MANAGER_MODULE, 'startSweeping');
        log.verbose("Sweeping expired sessions...");
        for (const [id, session] of this.sessions) {
          if (session.isExpired()) {
            log.verbose(`Deleting expired session: ${id}`);
            this.sessions.delete(id);
          }
        }
      }, 600000);
    }
  }

  stopSweeping() {
    if (this.sweepingInterval !== null) {
      clearInterval(this.sweepingInterval);
      this.sweepingInterval = null;
    }
  }
}

class Session {

  static idleLifetime = 1000 * 60 * 60 * 24; // 1 day

  static deserialize(serialized: string): Session {
    const data = JSON.parse(serialized);
    return new Session(
      data.id,
      new Date(data.expiresAt),
      data.userId
    );
  }

  static create(userId: string|null): Session {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + Session.idleLifetime);
    return new Session(id, expiresAt, userId);
  }

  #id: string;
  #invalidated: boolean = false;
  #expiresAt: Date;
  #userId: string|null;
  public data: Record<string, any>;
  
  constructor(
    id: string,
    expiresAt: Date|string|null,
    userId: string|null|Record<string, any>,
    data: Record<string, any> = {}
  ) {
    if (!(expiresAt instanceof Date)) {
      data = userId as Record<string, any>;
      userId = expiresAt as string|null;
      expiresAt = new Date(Date.now() + Session.idleLifetime);
    }

    this.#id = id;
    this.#expiresAt = expiresAt as Date;
    this.#userId = userId as string|null;
    this.data = data;
  }

  get invalidated() {
    return this.#invalidated;
  }
  get sessionId() {
    return this.#id;
  }
  get userId() {
    return this.#userId;
  }
  private set userId(newUserId: string|null) {
    this.#userId = newUserId;
  }

  clone(): Session {
    return new Session(
      this.#id,
      new Date(this.#expiresAt.getTime()),
      this.#userId,
      {...this.data}
    );
  }

  extend(): Session {
    const log = getLogger(SESSION_MODULE, 'extend');
    log.verbose('extending session %s', this.#id);
    this.#expiresAt = new Date(Date.now() + Session.idleLifetime);
    return this;
  }

  invalidate(): void {
    this.#invalidated = true;
  }

  isAnonymous(): boolean {
    return this.#userId === null;
  }

  isAuthenticated(): boolean {
    return this.#userId !== null && !this.isExpired();
  }

  isExpired(): boolean {
    return new Date() > this.#expiresAt;
  }

  serialize(): string {
    return JSON.stringify({
      id: this.#id,
      expiresAt: this.#expiresAt.toISOString(),
      userId: this.#userId,
      data: this.data
    });
  }

  /**
   * Convert an anonymous session to an authenticated session by setting the
   * userId. Will throw if the session is already authenticated to a different
   * user or has already expired.
   * @param newUserId 
   * @returns 
   */
  upgrade(newUserId: string): Session {
    if (this.isExpired()) {
      throw new Error("Cannot upgrade an expired session.");
    }
    if (this.userId !== null && this.userId !== newUserId) {
      throw new Error("Session is already authenticated to a different user.");
    }
    this.userId = newUserId;
    this.extend();
    return this;
  }
}

export default new SessionManager();
