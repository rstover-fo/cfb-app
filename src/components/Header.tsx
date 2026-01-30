import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900 hover:text-blue-600">
          CFB Team 360
        </Link>
        <nav>
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            All Teams
          </Link>
        </nav>
      </div>
    </header>
  )
}
