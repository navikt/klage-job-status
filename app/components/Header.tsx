import { ShowApiKeys } from '@app/components/api-keys/ShowApiKeys';
import { NamespaceSelector } from '@app/components/NamespaceSelector';
import { useTheme, useToggleTheme } from '@app/hooks/theme';
import { MoonIcon, SunIcon } from '@navikt/aksel-icons';
import { Box, Button, Heading, HStack } from '@navikt/ds-react';

export const Header = () => (
  <Box.New
    as="header"
    background="default"
    borderColor="accent"
    borderWidth="0 0 1 0"
    width="100%"
    className="flex flex-row items-center justify-center"
  >
    <HStack justify="space-between" align="center" padding="4" className="mx-auto w-full max-w-500">
      <Heading as="a" level="1" size="medium" href="/" className="mr-auto">
        Job Status Dashboard
      </Heading>

      <ShowApiKeys />

      <NamespaceSelector />

      <ThemeSwitcher />
    </HStack>
  </Box.New>
);

const ThemeSwitcher = () => {
  const theme = useTheme();
  const toggleTheme = useToggleTheme();

  return (
    <Button
      variant="tertiary-neutral"
      icon={theme === 'light' ? <SunIcon title="Switch to dark theme" /> : <MoonIcon title="Switch to light theme" />}
      onClick={toggleTheme}
    />
  );
};
