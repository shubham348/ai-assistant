
type HeaderProps = {
  connectionMessage: string;
  error: string;
};

function Header({ connectionMessage, error }: HeaderProps) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="AI Assistant home">
        <span className="brand-icon" aria-hidden="true">
          ✳
        </span>
        <span>AI Assistant</span>
      </a>

      <div className="header-status">
        <span
          className={`connection-pill ${error ? "offline" : "online"}`}
          title={error || connectionMessage}
        >
          <span className="status-dot" />
          <span>{error ? "Backend offline" : "Backend connected"}</span>
        </span>

        <span className="model-badge">
          <span className="status-dot" />
          Local AI
        </span>
      </div>
    </header>
  );
}

export default Header;
