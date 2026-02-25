import { pino } from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

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
    const session = this.sessions.get(id);
    if (session && !session.isExpired()) {
      session.extend();
      logger.trace('[SessionManager] extended session %s', id);
      return true;
    }
    return false;
  }

  /**
   * Get the session with the given ID if it exists and is not expired.
   * @param id The session ID to retrieve.
   * @returns Promise that resolves to the session if it exists and is valid,
   *  `null` otherwise.
   */
  async getSession(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (session && !session.isExpired()) {
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
  async hasSession(id: string): Promise<boolean> {
    return this.sessions.has(id) && !this.sessions.get(id)!.isExpired();
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
        console.log("Sweeping expired sessions...");
        for (const [id, session] of this.sessions) {
          if (session.isExpired()) {
            console.log(`Deleting expired session: ${id}`);
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
    logger.trace('[Session] extending session %s', this.#id);
    this.#expiresAt = new Date(Date.now() + Session.idleLifetime);
    return this;
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
