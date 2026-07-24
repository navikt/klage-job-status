import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NetInstrumentation } from '@opentelemetry/instrumentation-net';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/**
 * Sets up OpenTelemetry tracing for the Node.js server process. Nais injects the
 * `OTEL_EXPORTER_OTLP_ENDPOINT` (and related `OTEL_*`) environment variables, which the
 * exporter and SDK pick up automatically - no explicit endpoint configuration needed here.
 */
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'klage-job-status',
  }),
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
  instrumentations: [
    new DnsInstrumentation(),
    new HttpInstrumentation(),
    new NetInstrumentation(),
    new UndiciInstrumentation(),
  ],
});

sdk.start();

const shutdown = async () => {
  try {
    await sdk.shutdown();
    process.exit(0);
  } catch (error) {
    console.error('OpenTelemetry SDK shutdown failed', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
