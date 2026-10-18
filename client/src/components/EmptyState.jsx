export default function EmptyState({ title, body, action }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body">{body}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}
