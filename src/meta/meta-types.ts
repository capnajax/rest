import { ContextMeta, FrameworkMeta } from 'filamentjs';
import {
    AppMeta as RateLimitAppMeta,
    ContextMeta as RateLimitContextMeta
} from '@filamentjs/rate-limiting';
import {
    AppMeta as ReqLoggingAppMeta,
    ContextMeta as ReqLoggingContextMeta
} from '@filamentjs/request-logging';

export interface ObjectRoleInfo {
  article?: string|number;
  articleAuthority?: 'delegate' | 'admin' | 'edit' | 'read';
}
export type RoleInfoCalculator = (roleInfo: ObjectRoleInfo) => string|string[];

export interface EndpointMetaRoles {
  // Roles required at the endpoint level
  endpoint: string[];
  // Roles calculated by object properties, e.g. article:123:edit
  object?: (string|RoleInfoCalculator)[];
}

/**
 * Application metadata interface
 * 
 * Extend this interface to add your own metadata properties.
 * Middleware can inspect req.endpointMeta to make decisions.
 */
export interface AppMeta extends 
  FrameworkMeta, RateLimitAppMeta, ReqLoggingAppMeta
{

  analytics: { enabled: boolean };

  contentTypes: {
    /**
     * List of content types that this endpoint can accept. Wildcards are not
     * supported, but any type that is specified as single word (e.g. 'html')
     * will be interpreted as 'text/html' or 'application/html'. Ignored if the
     * request is not a POST, PUT, or PATCH request. An `undefined` value or an
     * empty array means that all content types are accepted.
     */
    supportedTypes?: string[];
    /**
     * Default content type to parse the body as if the Content-Type header is
     * missing. Ignored if allowMissingContentType is false or if the request
     * is not a POST, PUT, or PATCH request. Required if allowMissingContentType
     * is true.
     */
    defaultType?: string;
    /**
     * Set to true to allow requests with missing Content-Type header. In this
     * case, the defaultType will be used to parse the body. Ignored if the
     * request is not a POST, PUT, or PATCH request.
     */
    allowMissingContentType: boolean;    
  }

  /**
   * Whether this endpoint requires authentication
   */
  requiresAuth: boolean;

  /**
   * Session policy for this endpoint. Set this to `null` to disable the use of
   * sessions for this endpoint (i.e., req.session will always be null).
   */
  sessionPolicy: {
    /**
     * Set to `true` to create an anonymous session for unauthenticated users if
     * no session already exists.
     */
    createAnonymous: boolean;
    /**
     * Set to `true` to extend the session expiration on each request.
     */
    extendOnRequest: boolean;

  }|null;

  /**
   * Logging configuration
   */
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };

  /**
   * Tags for categorizing endpoints
   */
  tags: string[];

  /**
   * Roles required to access this endpoint. 
   * If not specified, the endpoint is accessible to all users as long as they
   * requiresAuth is satisfied (i.e., the user is authenticated if requiresAuth
   * is true).
   */
  roles?: EndpointMetaRoles;
}

/**
 * For context
 */
export interface ContentType {
  type: string;
  params: Record<string, string>;
  isMultipart: () => boolean;
  isJson: () => boolean;
  isYaml: () => boolean;
  isXml: () => boolean;
  isToml: () => boolean;
  isFormUrlEncoded: () => boolean;
  isPlainText: () => boolean;
  isHtml: () => boolean;
  isImage: () => boolean
}

export interface Context extends 
  ContextMeta, RateLimitContextMeta, ReqLoggingContextMeta
{
  body?: () => Promise<unknown>,
  contentType?: ContentType|null;
  contentTypes: {
    allowMissingContentType: boolean,
    defaultType: string,
    supportedTypes?: string[]
  },
  cookies?: Record<string, string>,
  session?: Record<string, any>|null
}
