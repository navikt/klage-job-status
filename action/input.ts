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
export const FAIL = process.env.FAIL === 'true' || process.env.FAIL === '1';
export const FAIL_ON_UNKNOWN = process.env.FAIL_ON_UNKNOWN === 'true' || process.env.FAIL_ON_UNKNOWN === '1';

export const API_KEY = IS_GITHUB_ACTION
  ? getRequiredEnv('API_KEY')
  : 'klage:read.MU71PJn99JCV2a2py6uQw3_aL7I6YSH_Dd3HLAhr5WM';

export const TIMEOUT = IS_GITHUB_ACTION ? getTimeout() : 600; // How long this action will wait for the job to finish (in seconds)

// `ACTION_TEST_BASE_URL` overrides the default for either mode - used by `action/run-child-process.ts`
// to point the action at the ephemeral server the tests start, without having to fake being a
// real GitHub Action. Deliberately not named `BASE_URL`: this action is a composite action
// consumed by other repos' workflows, which may already define their own unrelated `BASE_URL`
// job/step env var that would otherwise silently be inherited here.
export const BASE_URL =
  process.env.ACTION_TEST_BASE_URL ??
  (IS_GITHUB_ACTION ? 'https://klage-job-status.ekstern.dev.nav.no' : 'http://localhost:3000');

const getJobUrl = (): URL => {
  const url = URL.parse(`${BASE_URL}/jobs/${JOB_ID}`);

  if (url === null) {
    throw new Error(`Invalid job URL: ${url}`);
  }

  return url;
};

export const JOB_URL = getJobUrl();

const [namespace] = API_KEY.split(':');

if (namespace === undefined || namespace.length === 0) {
  throw new Error('API_KEY is missing namespace');
}

export const NAMESPACE = namespace;
