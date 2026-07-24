export const isExpired = (created: number, timeout: number): boolean => created + timeout * 1000 < Date.now();
