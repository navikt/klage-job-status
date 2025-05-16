const getRequiredEnv = (name: string) => {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Environment variable "${name}" is required`);
  }

  return value;
};

const getTimeout = () => {
  const raw = process.env.timeout;
  return raw === undefined || raw.length === 0 ? 600 : Number.parseInt(raw, 10);
};

export const IS_GITHUB_ACTION = process.env.GITHUB_ACTIONS === 'true';

const getJobId = () => {
  if (IS_GITHUB_ACTION) {
    return getRequiredEnv('JOB_ID');
  }

  const [jobId] = process.argv.slice(2);

  console.debug(`Job ID from command line: "${jobId}"`);

  if (jobId === undefined || jobId.length === 0) {
    throw new Error('Job ID is required');
  }

  return jobId;
};

export const JOB_ID = getJobId();

export const API_KEY = IS_GITHUB_ACTION
  ? getRequiredEnv('API_KEY')
  : 'klage:read.MU71PJn99JCV2a2py6uQw3_aL7I6YSH_Dd3HLAhr5WM';

export const TIMEOUT = IS_GITHUB_ACTION ? getTimeout() : 600; // How long this action will wait for the job to finish (in seconds)

export const JOB_URL = IS_GITHUB_ACTION
  ? `https://klage-job-status.ekstern.dev.nav.no/jobs/${JOB_ID}`
  : `http://localhost:8080/jobs/${JOB_ID}`;

const [namespace] = API_KEY.split(':');

if (namespace === undefined || namespace.length === 0) {
  throw new Error('API_KEY is missing namespace');
}

export const NAMESPACE = namespace;
