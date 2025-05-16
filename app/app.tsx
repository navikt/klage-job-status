import { NamespaceProvider } from '@app/context/NamespaceContext';
import '@app/app.css';
import { Footer } from '@app/components/Footer';
import { Header } from '@app/components/Header';
import { MainContent } from '@app/components/MainContent';
import { useTheme } from '@app/hooks/theme';
import { Box, Theme, VStack } from '@navikt/ds-react';

export const App = () => {
  const theme = useTheme();

  return (
    <Theme theme={theme} hasBackground={false} className="flex min-h-full w-full">
      <NamespaceProvider>
        <VStack width="100%" minHeight="100%">
          <Header />

          <Box.New
            width="100%"
            background="sunken"
            paddingInline="4"
            paddingBlock="8"
            maxWidth="500"
            flexGrow="1"
            marginInline="auto"
          >
            <MainContent />
          </Box.New>

          <Footer />
        </VStack>
      </NamespaceProvider>
    </Theme>
  );
};
