"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import useStore from "@/app/state/store"
import { toBase64 } from "@/app/lib/tools"
import { readFileSync } from "fs"
export default function Page() {
  const router = useRouter()
  // Get both values and setters from the store
  const {
    username,
    setUsername,
    setRoom,
    cv,
    setCv,
    linkedinUrl,
    setLinkedinUrl,
    additionalInfo,
    setAdditionalInfo
  } = useStore()

  const [review, setReview] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load review from localStorage on component mount
  useEffect(() => {
    const savedReview = localStorage.getItem("interviewReview")
    if (savedReview) {
      setReview(savedReview)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCv(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // generate an unique room id
      const roomId = `interview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // save room id to the global store 
      setRoom(roomId)
      
      // Convert CV to Buffer
      const arrayBuffer = await (cv as File).arrayBuffer()
      const cvBuffer = Buffer.from(arrayBuffer)
  
      // call api endpoint here to post data to the database
      await fetch("http://localhost:3001/api/session/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId,
          username,
          cv: Array.from(cvBuffer), // Convert Buffer to array for JSON transmission
          linkedinUrl,
          additionalInfo
        })
      })
      router.push(`/room/${roomId}`)
    } catch (error) {
      console.error("Error submitting form:", error)
      alert("Failed to submit form. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold mb-6">Interview Setup</h1>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload CV (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LinkedIn Profile URL
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://linkedin.com/in/your-profile"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Information
                </label>
                <textarea
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="Any additional information you'd like to share..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isSubmitting ? "Processing..." : "Start Interview"}
              </button>
            </form>
          </div>

          {/* Right Side - Review */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-6">AI Interviewer Review</h2>
            {review ? (
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-gray-700">
                  {review}
                </pre>
              </div>
            ) : (
              <div className="text-gray-500 italic">
                Complete the form to see your personalized interview review
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
