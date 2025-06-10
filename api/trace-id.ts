const getUUID = () => crypto.randomUUID().replaceAll('-', '');

export const getTraceId = getUUID;
export const getSpanId = () => getUUID().substring(0, 16);
