import { TrashIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { useCallback, useState } from 'react';

interface DeleteJobProps {
  jobId: string;
  namespace: string;
}

export const DeleteJob = ({ jobId, namespace }: DeleteJobProps) => {
  const [isLoading, setLoading] = useState(false);

  const onDelete = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(`/api/namespaces/${namespace}/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(`Failed to delete job: ${res.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting job:', error);
    } finally {
      setLoading(false);
    }
  }, [jobId, namespace]);

  return (
    <Tooltip content="Delete job" placement="right">
      <Button size="small" variant="danger" icon={<TrashIcon aria-hidden />} onClick={onDelete} loading={isLoading} />
    </Tooltip>
  );
};
