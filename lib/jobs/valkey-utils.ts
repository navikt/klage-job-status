import type { GlideString } from '@valkey/valkey-glide';

/** Normalizes a `GlideString`, which may be a `string` or a `Buffer`, into a `string`. */
export const toStr = (value: GlideString): string => (typeof value === 'string' ? value : value.toString());
