"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface Question {
  question: string
  category: string
  difficulty: "easy" | "medium" | "hard"
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [newQuestion, setNewQuestion] = useState<Question>({
    question: "",
    category: "",
    difficulty: "medium"
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect if not authenticated
  if (status === "unauthenticated") {
    router.push("/")
    return null
  }

  const handleAddQuestion = () => {
    if (newQuestion.question.trim() && newQuestion.category.trim()) {
      setQuestions([...questions, newQuestion])
      setNewQuestion({
        question: "",
        category: "",
        difficulty: "medium"
      })
    }
  }

  const handleSubmit = async () => {
    if (questions.length === 0) return

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ questions }),
      })

      if (!response.ok) {
        throw new Error("Failed to submit questions")
      }

      setQuestions([])
      alert("Questions submitted successfully!")
    } catch (error) {
      console.error("Error submitting questions:", error)
      alert("Failed to submit questions. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Interview Questions Management</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Question</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Question
            </label>
            <textarea
              value={newQuestion.question}
              onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter your question here..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              value={newQuestion.category}
              onChange={(e) => setNewQuestion({ ...newQuestion, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Technical, Behavioral, Problem Solving"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty
            </label>
            <select
              value={newQuestion.difficulty}
              onChange={(e) => setNewQuestion({ ...newQuestion, difficulty: e.target.value as Question["difficulty"] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          
          <button
            onClick={handleAddQuestion}
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add Question
          </button>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Questions to Submit ({questions.length})</h2>
          <div className="space-y-4">
            {questions.map((q, index) => (
              <div key={index} className="border-b pb-4">
                <p className="font-medium">{q.question}</p>
                <div className="text-sm text-gray-600 mt-1">
                  <span className="mr-4">Category: {q.category}</span>
                  <span>Difficulty: {q.difficulty}</span>
                </div>
              </div>
            ))}
            
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Questions"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 