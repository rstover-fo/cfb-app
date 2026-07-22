import type { Metadata } from 'next'
import { ChartGallery } from '@/components/dev/ChartGallery'

export const metadata: Metadata = {
  title: 'Chart Gallery (dev)',
}

/**
 * Dev-only chart gallery. Server page, client gallery -- see
 * src/app/dev/layout.tsx for the production 404 gate and
 * src/components/dev/ChartGallery.tsx for the chart list. No data fetching
 * here or in the gallery: every chart renders from local fixtures
 * (src/lib/fixtures/gallery).
 */
export default function DevChartsPage() {
  return <ChartGallery />
}
