import { useState } from 'react';

const GROUPS = [
  {
    title: 'Notifications',
    items: [
      { key: 'notifyPickups', label: 'Pickup request updates', desc: 'Approvals, declines, and new requests.', defaultOn: true },
      { key: 'notifyCarpools', label: 'Carpool activity', desc: 'New join requests and carpool changes.', defaultOn: true },
      { key: 'notifyMessages', label: 'New messages', desc: 'Get notified when someone messages you.', defaultOn: true },
    ],
  },
  {
    title: 'Location sharing',
    items: [
      { key: 'shareLiveLocation', label: 'Share live location during pickups', desc: 'Lets the other person see your route in real time.', defaultOn: false },
      { key: 'autoOpenRoute', label: 'Open the route automatically after approval', desc: 'Jump straight to the map when a pickup is approved.', defaultOn: false },
    ],
  },
  {
    title: 'Map preferences',
    items: [
      { key: 'showTraffic', label: 'Show traffic on routes', desc: 'Overlay live traffic conditions where available.', defaultOn: false },
      { key: 'metricUnits', label: 'Use kilometers instead of miles', desc: 'Switch distance units across the app.', defaultOn: false },
    ],
  },
  {
    title: 'Privacy',
    items: [
      { key: 'hideExactAddress', label: 'Hide your exact address from other parents', desc: 'Only drivers you approve can see precise pickup points.', defaultOn: true },
    ],
  },
];

export default function SettingsPage() {
  const [state, setState] = useState(() => {
    const initial = {};
    GROUPS.forEach((g) => g.items.forEach((i) => (initial[i.key] = i.defaultOn)));
    return initial;
  });

  const toggle = (key) => setState((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Control notifications, location sharing, and how the map looks.</p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="stack">
          <p className="settings-group-title">{group.title}</p>
          <div className="card">
            {group.items.map((item, idx) => (
              <div
                key={item.key}
                className="settings-row"
                style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)' }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {item.desc}
                  </div>
                </div>
                <Toggle checked={state[item.key]} onChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="stack">
        <p className="settings-group-title">Safety & compliance</p>
        <div className="card">
          <div className="settings-row" style={{ borderTop: 'none' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Require parental consent for child connections</div>
              <div className="muted" style={{ marginTop: 2 }}>Links involving a child account require explicit parent approval before the connection is active.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Restrict live location to active trip windows</div>
              <div className="muted" style={{ marginTop: 2 }}>Trip location updates are only permitted during active pickup and drop-off windows.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Filter unsafe chat content</div>
              <div className="muted" style={{ marginTop: 2 }}>Inappropriate language, links, email addresses, and phone numbers are blocked automatically.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Use short-lived family tokens</div>
              <div className="muted" style={{ marginTop: 2 }}>Family join links expire after 15 minutes and are single-use to reduce unauthorized joins.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>2-step boarding confirmation</div>
              <div className="muted" style={{ marginTop: 2 }}>Drivers scan or enter the child boarding PIN before the trip is marked active.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
          <div className="settings-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Parent oversight dashboard</div>
              <div className="muted" style={{ marginTop: 2 }}>Parents can review friend lists, active chats, and trip history in the profile area.</div>
            </div>
            <Toggle checked={true} onChange={() => null} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={onChange}
    >
      <span className="toggle-thumb" />
    </button>
  );
}
