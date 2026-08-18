import { getCompanyBranding } from '@/lib/get-branding'
import AppShell from '@/components/gazpharm/app-shell'

export default async function Home() {
  const initialBranding = await getCompanyBranding()
  return <AppShell initialBranding={initialBranding} />
}
