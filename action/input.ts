const getRequiredEnv = (name: string) => {
  const value = process.env[name.toUpperCase()];

  if (value === undefined || value.length === 0) {
    throw new Error(`Environment variable ${name.toUpperCase()} is required`);
  }

  return value;
};

const getTimeout = () => {
  const raw = process.env.timeout;
  return raw === undefined || raw.length === 0 ? 600 : Number.parseInt(raw, 10);
};

export const IS_GITHUB_ACTION = process.env.GITHUB_ACTIONS === 'true';

export const NAMESPACE = IS_GITHUB_ACTION ? getRequiredEnv('NAMESPACE') : 'klage';
export const JOB_ID = IS_GITHUB_ACTION ? getRequiredEnv('JOB_ID') : '123';
export const API_KEY = IS_GITHUB_ACTION ? getRequiredEnv('API_KEY') : 'api_key';
export const TIMEOUT = IS_GITHUB_ACTION ? getTimeout() : 600; // How long this action will wait for the job to finish (in seconds)

export const JOB_URL = IS_GITHUB_ACTION
  ? `https://klage-job-status.ekstern.dev.nav.no/jobs/${NAMESPACE}/${JOB_ID}`
  : `http://localhost:8080/jobs/${NAMESPACE}/${JOB_ID}`;
