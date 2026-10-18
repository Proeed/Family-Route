const LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  active: 'Active',
  expired: 'Expired',
};

const VARIANT = {
  active: 'approved',
  expired: 'declined',
};

export default function StatusPill({ status }) {
  const className = `pill pill-${VARIANT[status] || status}`;
  return <span className={className}>{LABELS[status] || status}</span>;
}
