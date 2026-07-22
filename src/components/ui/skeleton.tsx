import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  // Matches the loading rows in components/dashboard/WidgetSkeleton.tsx:
  // a flat muted (bg-surface-alt) block, plain "animate-pulse rounded".
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
