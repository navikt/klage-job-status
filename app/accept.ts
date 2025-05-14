export enum AcceptType {
  JSON = 'application/json',
  SSE = 'text/event-stream',
  ANY = '*/*',
}

export interface AcceptValue {
  type: string;
  quality: number; // A value in order of preference expressed using a relative quality value called the weight.
}

export const getAcceptValues = (header: string | null): AcceptValue[] => {
  const result: AcceptValue[] = [];

  if (header === null || header.length === 0) {
    return result;
  }

  const mainValues = header.split(',');

  for (const value of mainValues) {
    const trimmedValue = value.trim();
    const [type, ...rest] = trimmedValue.split(';');

    if (type === undefined || type.length === 0) {
      continue;
    }

    const qualityValue = rest
      .map((t) => t.trim())
      .find((t) => t.startsWith('q='))
      ?.split('=')[1];

    const quality = qualityValue === undefined ? 1 : Number.parseFloat(qualityValue);

    result.push({ type, quality });
  }

  return result.toSorted((a, b) => b.quality - a.quality);
};

export const preferred = (accept: AcceptValue[], types: AcceptType[]): AcceptType | null => {
  if (accept.length === 0) {
    return null;
  }

  const clientPreferred = getClientPreferred(accept, types);

  // If the client prefers a specific type, return it.
  if (clientPreferred !== AcceptType.ANY) {
    return clientPreferred;
  }

  // If the client prefers a wildcard, return the server's preferred type.
  const [serverPreferred] = types;

  if (serverPreferred === undefined) {
    return null;
  }

  return serverPreferred;
};

const getClientPreferred = (accept: AcceptValue[], types: AcceptType[]): AcceptType | null => {
  for (const a of accept) {
    for (const t of types) {
      if (a.type === t) {
        return t;
      }
    }

    if (a.type === AcceptType.ANY) {
      return AcceptType.ANY;
    }
  }

  return null;
};
