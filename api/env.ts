export const CLUSTER = process.env.NAIS_CLUSTER_NAME;
export const IS_DEV = CLUSTER === 'dev-gcp';
export const IS_PROD = CLUSTER === 'prod-gcp';
export const IS_LOCAL = CLUSTER === undefined;
export const IS_DEPLOYED = IS_DEV || IS_PROD;
