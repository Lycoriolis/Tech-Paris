"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface InterviewData {
  username: string
  cv: File | null
  linkedinUrl: string
  additionalInfo: string
  review?: string
}

export default function Page() {
  const router = useRouter()
  const [interviewData, setInterviewData] = useState<InterviewData>({
    username: "",
    cv: null,
    linkedinUrl: "",
    additionalInfo: "",
  })
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
      setInterviewData({ ...interviewData, cv: e.target.files[0] })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Here you would typically send the data to your backend
      // For now, we'll simulate a response
      const mockReview = `Interview Review for ${interviewData.username}:
      
Based on the provided information:
- LinkedIn Profile: ${interviewData.linkedinUrl}
- Additional Information: ${interviewData.additionalInfo}

The candidate appears to be a good fit for the position. The interview will focus on:
1. Technical skills assessment
2. Problem-solving abilities
3. Communication skills
4. Team collaboration experience

The interview will be tailored to the candidate's background and experience level.`

      // Save review to localStorage
      localStorage.setItem("interviewReview", mockReview)
      setReview(mockReview)

      // Navigate to interview page
      router.push("/interview")
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
                  value={interviewData.username}
                  onChange={(e) => setInterviewData({ ...interviewData, username: e.target.value })}
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
                  value={interviewData.linkedinUrl}
                  onChange={(e) => setInterviewData({ ...interviewData, linkedinUrl: e.target.value })}
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
                  value={interviewData.additionalInfo}
                  onChange={(e) => setInterviewData({ ...interviewData, additionalInfo: e.target.value })}
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
