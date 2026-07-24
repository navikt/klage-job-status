'use client';

import { MoonIcon, SunIcon } from '@navikt/aksel-icons';
import { Box, Button, Heading, HStack } from '@navikt/ds-react';
import { ShowApiKeys } from '@/components/api-keys/ShowApiKeys';
import { NamespaceSelector } from '@/components/NamespaceSelector';
import { ThemeEnum } from '@/lib/theme-shared';

interface HeaderProps {
  theme: ThemeEnum;
  onToggleTheme: () => void;
}

export const Header = ({ theme, onToggleTheme }: HeaderProps) => (
  <Box
    as="header"
    background="default"
    borderColor="accent"
    borderWidth="0 0 1 0"
    width="100%"
    className="flex flex-row items-center justify-center"
  >
    <HStack justify="space-between" align="center" padding="space-16" className="mx-auto w-full max-w-500">
      <Heading as="a" level="1" size="medium" href="/" className="mr-auto">
        Job Status Dashboard
      </Heading>

      <ShowApiKeys />

      <NamespaceSelector />

      <Button
        variant="tertiary-neutral"
        aria-label={theme === ThemeEnum.Light ? 'Switch to dark theme' : 'Switch to light theme'}
        icon={
          theme === ThemeEnum.Light ? (
            <SunIcon title="Switch to dark theme" />
          ) : (
            <MoonIcon title="Switch to light theme" />
          )
        }
        onClick={onToggleTheme}
      />
    </HStack>
  </Box>
);
