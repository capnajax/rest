
import {
  RoleInfoCalculator,
  EndpointMetaRoles,
  AppMeta
} from './meta-types.js';

type RoleParameterType = string | RoleInfoCalculator |
  (Partial<EndpointMetaRoles>) | ((string|RoleInfoCalculator)[]);
function normalizeRoles(...roles: RoleParameterType[]): EndpointMetaRoles {
  const normalizedRoles: EndpointMetaRoles = {
    endpoint: []
  };
  for (const role of roles) {
    if (typeof role === 'string') {
      normalizedRoles.endpoint.push(role);
    } else if (typeof role === 'function') {
      normalizedRoles.object ||= [];
      normalizedRoles.object.push(role);
    } else if (Array.isArray(role)) {
      for (const r of role) {
        if (typeof r === 'string') {
          normalizedRoles.endpoint.push(r);
        } else if (typeof r === 'function') {
          normalizedRoles.object ||= [];
          normalizedRoles.object.push(r);
        }
      }
    } else if (typeof role === 'object') {
      if (role.endpoint) {
        normalizedRoles.object ||= [];
        normalizedRoles.endpoint.push(...role.endpoint);
      }
      if (role.object) {
        normalizedRoles.object ||= [];
        normalizedRoles.object.push(...role.object);
      }
    } else {
      // should be impossible
      throw new Error(`Invalid role parameter: ${role}`);
    }
  }
  return normalizedRoles;
}

/**
 * Creates a metadata preset for role-based access control
 * @param roles 
 * @returns A partial AppMeta object with the specified roles
 */
export const roleBased = function roleBased(
  ...roles: RoleParameterType[]
): Partial<AppMeta> {
  return {
    requiresAuth: true,
    roles: {
      ...normalizeRoles(...roles)
    }
  }
};
