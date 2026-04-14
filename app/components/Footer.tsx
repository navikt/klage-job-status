import { Box, HStack, Link } from '@navikt/ds-react';

export const Footer = () => (
  <Box
    as="footer"
    padding="space-16"
    borderWidth="1 0 0 0"
    borderColor="accent"
    background="default"
    className="text-center text-small text-text-subtle"
  >
    <p>Job Status Dashboard - by Team Klage</p>

    <HStack align="center" justify="center" gap="space-16">
      <Link
        href="https://github.com/navikt/klage-job-status"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        Source Code
      </Link>

      <Link
        href="https://github.com/navikt/klage-job-status/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        Issues
      </Link>

      <Link
        href="https://nav-it.slack.com/archives/C01L59AQVQA"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        Slack
      </Link>
    </HStack>
  </Box>
);
