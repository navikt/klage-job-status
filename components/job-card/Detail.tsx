'use client';

interface JobDetailProps {
  label: string;
  children: React.ReactNode;
  /**
   * Pass `true` only when `children` is expected to legitimately differ between the server
   * render and the client's hydration pass (e.g. `Duration`, computed from elapsed time since
   * the job started) - not a real bug to fix, just React's documented way of opting a
   * known-to-vary text node out of the hydration mismatch warning/tree-regeneration.
   * @see https://react.dev/link/hydration-mismatch
   */
  suppressHydrationWarning?: boolean;
}

export const JobDetail = ({ label, children, suppressHydrationWarning }: JobDetailProps) => (
  <section className="flex flex-col gap-1">
    <span className="font-bold text-small text-text-subtle">{label}:</span>
    <span className="text-small text-text-default" suppressHydrationWarning={suppressHydrationWarning}>
      {children}
    </span>
  </section>
);
