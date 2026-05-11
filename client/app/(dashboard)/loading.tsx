// Skeleton shown by Next while a server component fetches its data.
// Server-renderable; we deliberately avoid importing HeroUI components
// here because Next inlines this module into the static prerender of
// adjacent client pages, and pulling in any HeroUI component (which
// reaches for React.createContext at module-eval time) breaks that
// prerender. A plain Tailwind spinner is enough for the empty fallback.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 mt-24">
      <div
        className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-default-200 border-t-primary"
        aria-hidden
      />
      <div className="text-sm text-default-500">加载中…</div>
    </div>
  );
}
