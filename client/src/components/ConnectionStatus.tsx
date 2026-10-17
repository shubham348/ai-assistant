
type ConnectionStatusProps = {
  message: string;
  error: string;
};

function ConnectionStatus({ message, error }: ConnectionStatusProps) {
  return (
    <div className={`connection-card ${error ? "connection-error" : ""}`}>
      <span className="connection-indicator" />

      <div className="connection-copy">
        <strong>{error ? "Request failed" : "Backend connection"}</strong>
        <span>{error || message}</span>
      </div>

      <span className="connection-label">
        {error ? "Error" : "API"}
      </span>
    </div>
  );
}

export default ConnectionStatus;
