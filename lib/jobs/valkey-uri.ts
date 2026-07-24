export interface ParsedValkeyUri {
  host: string;
  port: number;
  useTLS: boolean;
}

export const parseValkeyUri = (uri: string | undefined): ParsedValkeyUri => {
  if (uri === undefined) {
    throw new Error('Missing Valkey URI');
  }

  const url = new URL(uri);

  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number.parseInt(url.port, 10) : 6379,
    useTLS: url.protocol === 'rediss:' || url.protocol === 'valkeys:',
  };
};
