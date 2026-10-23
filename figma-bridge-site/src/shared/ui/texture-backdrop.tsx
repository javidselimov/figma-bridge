/** Fixed page backdrop: grid texture, vignette and scanlines (styled after reactivite.vercel.app). */
export function TextureBackdrop() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-background">
        <div className="absolute inset-0 texture-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_100%)]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] texture-scanlines"
      />
    </>
  );
}
