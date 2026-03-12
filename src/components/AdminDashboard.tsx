interface AdminDashboardProps {
  isAdminMode: boolean;
  canUseAdminControls: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onReset: () => void;
}

export function AdminDashboard({
  isAdminMode,
  canUseAdminControls,
  onLogin,
  onLogout,
  onReset,
}: AdminDashboardProps) {
  return (
    <section className="panel admin-control-panel">
      <h2>Admin Dashboard</h2>
      <p className="mode-admin-note">
        {isAdminMode ? 'Admin login verified.' : 'Admin login is required.'}
      </p>
      <div className="actions">
        {!isAdminMode ? (
          <button type="button" onClick={onLogin}>
            Admin Login
          </button>
        ) : (
          <button type="button" onClick={onLogout}>
            Log Out
          </button>
        )}
      </div>
      {canUseAdminControls ? (
        <div className="actions">
          <button id="clearButton" type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      ) : null}
    </section>
  );
}
