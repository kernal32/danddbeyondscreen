import { lazy, Suspense } from 'react';

/** `react-qr-code` is CJS-only; lazy-loading avoids top-level interop TDZ issues with Vite + React 19. */
const QrInner = lazy(async () => {
  const m = await import('react-qr-code');
  return { default: m.default };
});

export default function LazyQrCode({
  value,
  size = 200,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <Suspense
        fallback={
          <div
            className="animate-pulse rounded-lg bg-white/10"
            style={{ width: size, height: size }}
            aria-hidden
          />
        }
      >
        <QrInner value={value} size={size} />
      </Suspense>
    </div>
  );
}
