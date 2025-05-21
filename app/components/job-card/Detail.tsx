interface JobDetailProps {
  label: string;
  children: React.ReactNode;
}

export const JobDetail = ({ label, children }: JobDetailProps) => (
  <section className="flex flex-col gap-1">
    <span className="font-bold text-small text-text-subtle">{label}:</span>
    <span className="text-small text-text-default">{children}</span>
  </section>
);
