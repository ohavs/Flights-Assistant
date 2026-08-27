/* ── Skeleton ────────────────────────────────────────────────────────────
   Placeholder shapes that match what is about to appear, instead of a
   spinner that says only "wait". The content lands in the space the
   skeleton was already holding, so nothing jumps.                        */

export function SkeletonBox({ height = 14, width = '100%', radius = 8, style }) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/* A row that mirrors the list cards used across the app: leading control,
   two lines of text, trailing chevron. */
export function SkeletonRow({ lines = 2 }) {
  return (
    <div className="glass-card" style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: '12px 14px',
    }}>
      <SkeletonBox width={30} height={30} radius={10} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <SkeletonBox height={13} width="58%" />
        {lines > 1 && <SkeletonBox height={10} width="34%" />}
      </div>
    </div>
  );
}

/* Full-tab placeholder. `rows` roughly matches what the tab usually shows,
   so the skeleton occupies a believable amount of space. */
export default function Skeleton({ rows = 5, header = true, label }) {
  return (
    <div
      className="animate-fade"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      role="status"
      aria-live="polite"
      aria-label={label || 'טוען'}
    >
      {header && (
        <div className="glass-card" style={{ padding: '14px 16px', gap: 10 }}>
          <SkeletonBox height={12} width="30%" />
          <SkeletonBox height={30} radius={12} />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}
