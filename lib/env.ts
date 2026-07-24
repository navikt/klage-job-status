const CLUSTER = process.env.NAIS_CLUSTER_NAME;
export const IS_LOCAL = CLUSTER === undefined;
