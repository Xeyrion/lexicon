export default function PageFallback() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-live="polite">
      <span className="sr-only">页面加载中</span>
      <div className="h-8 w-52 max-w-full rounded-full bg-sunken" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-sunken/70" />
        ))}
      </div>
      <div className="h-[22rem] rounded-[1.75rem] bg-sunken/70" />
    </div>
  )
}
