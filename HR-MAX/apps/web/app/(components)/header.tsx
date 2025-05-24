"use client"
import {AuthButton} from "./button"
import Link from 'next/link'
import { useSession } from "next-auth/react"

export default function Header() {
  const { data: session } = useSession()

  return (
    <header className="w-full bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900">HR Interviewer</h1>
            {session && (
              <nav className="ml-4">
                <Link 
                  href="/admin" 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Admin
                </Link>
                <Link 
                  href="/" 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Interview
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center">
          <AuthButton />
          </div>
        </div>
      </div>
    </header>
  )
}