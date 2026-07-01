interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

export default function WebPageHeader({ title, subtitle, onBack, actions }: Props) {
  return (
    <header className="web-page-header">
      <div className="web-page-header-main">
        {onBack && (
          <button type="button" className="icon-btn web-page-back" onClick={onBack} title="Back">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back_ios_new</span>
          </button>
        )}
        <div>
          <h1 className="web-page-title">{title}</h1>
          {subtitle && <p className="web-page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="web-page-header-actions">{actions}</div>}
    </header>
  );
}
