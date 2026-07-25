import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { SignInForm } from '@/components/auth/SignInForm'

export const metadata = {
  title: 'Sign in | CFB Team 360',
  description: 'Sign in with a magic link -- no password required.',
}

interface SignInPageProps {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ next?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const user = await getCurrentUser()
  if (user) {
    redirect('/account')
  }

  const { next } = await searchParams

  return (
    <div className="p-8">
      <div className="max-w-sm mx-auto mt-12">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Sign in
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-4 mb-6">
          Enter your email and we&apos;ll send you a link to sign in -- no password needed.
        </p>

        <SignInForm next={next} />
      </div>
    </div>
  )
}
