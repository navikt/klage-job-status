import { Footer } from '@app/components/Footer';
import { Header } from '@app/components/Header';
import { MainContent } from '@app/components/MainContent';
import { NamespaceProvider } from '@app/context/NamespaceContext';
import { useTheme } from '@app/hooks/theme';
import { Box, Theme, VStack } from '@navikt/ds-react';

export const App = () => {
  const theme = useTheme();

  return (
    <Theme theme={theme} hasBackground={false} className="flex min-h-full w-full">
      <NamespaceProvider>
        <VStack width="100%" minHeight="100%">
          <Header />

          <Box
            width="100%"
            background="sunken"
            paddingInline="space-16"
            paddingBlock="space-32"
            maxWidth="500"
            flexGrow="1"
            marginInline="auto"
          >
            <MainContent />
          </Box>

          <Footer />
        </VStack>
      </NamespaceProvider>
    </Theme>
  );
};
