import type { ReactNode } from 'react';

export function CustomTitlebar({
  title = 'UnderDock',
  subtitle,
  status,
  rightSlot,
  onBrandDoubleClick
}: {
  title?: string;
  subtitle?: string;
  status?: string;
  rightSlot?: ReactNode;
  onBrandDoubleClick?: () => void;
}) {
  return (
    <header className="titlebar panel" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region onDoubleClick={onBrandDoubleClick}>
        <div className="brand-mark brand-mark--small" aria-hidden="true">
          <span />
        </div>
        <div>
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="titlebar__meta">
        {status ? <span className="titlebar__status">{status}</span> : null}
        {rightSlot ? <div className="titlebar__actions">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
