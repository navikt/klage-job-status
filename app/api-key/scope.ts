export enum AccessScope {
  READ = 'read',
  WRITE = 'write',
}

const ACCESS_SCOPES = Object.values(AccessScope);

export const isAccessScope = (value: string): value is AccessScope => ACCESS_SCOPES.includes(value as AccessScope);

export const validateScope = (scope: string | undefined, requiredScope: AccessScope): boolean => {
  // If no scope is provided, the API key is invalid.
  if (scope === undefined) {
    return false;
  }

  // If the required scope is WRITE, the API key must be WRITE.
  if (requiredScope === AccessScope.WRITE && scope === AccessScope.WRITE) {
    return true;
  }

  // If the required scope is READ, the API key must be READ or WRITE.
  if (requiredScope === AccessScope.READ && isAccessScope(scope)) {
    return true;
  }

  return false;
};
