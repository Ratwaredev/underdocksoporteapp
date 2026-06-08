import { Download } from 'lucide-react';
import type { UpdateResult } from '../lib/domain';

export function UpdateNotice({
  updateResult,
  isUpdating,
  updateProgress,
  onInstallUpdate
}: {
  updateResult: UpdateResult | null;
  isUpdating: boolean;
  updateProgress: string;
  onInstallUpdate: () => void;
}) {
  if (updateResult?.status !== 'available') return null;

  return (
    <section className="update-strip panel">
      <div>
        <p className="eyebrow">Actualización disponible</p>
        <strong>{updateResult.notes || 'Hay una actualización disponible.'}</strong>
      </div>
      <button className="btn btn-primary" onClick={onInstallUpdate} disabled={isUpdating}>
        <Download size={16} /> {isUpdating ? updateProgress || 'Aplicando' : 'Aplicar actualización'}
      </button>
    </section>
  );
}
