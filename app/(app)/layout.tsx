import { requireSession } from '@/lib/auth'

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return children
}
