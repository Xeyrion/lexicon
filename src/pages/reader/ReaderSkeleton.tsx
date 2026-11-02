/** Placeholder shown while the article and the dictionary are still loading. */
export function ReaderSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-12 rounded-2xl bg-sunken/70" />
      <div className="surface-card h-[34rem] p-8">
        <div className="mx-auto h-full max-w-2xl space-y-4">
          <div className="h-8 w-2/3 rounded-full bg-sunken" />
          <div className="h-4 w-1/3 rounded-full bg-sunken/70" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-3 rounded-full bg-sunken/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
