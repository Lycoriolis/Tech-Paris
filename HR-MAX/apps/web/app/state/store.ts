import { create } from "zustand"

interface RoomStore {
  room: string
  setRoom: (room: string) => void
}

interface UserStore {
  username: string
  setUsername: (username: string) => void
  cv: File | null
  setCv: (cv: File | null) => void
  linkedinUrl: string
  setLinkedinUrl: (linkedinUrl: string) => void
  additionalInfo: string
  setAdditionalInfo: (additionalInfo: string) => void
}

type Store = RoomStore & UserStore



const useStore = create<Store>((set) => ({
  room: "",
  setRoom: (room) => set({ room }),
  username: "",
  setUsername: (username) => set({ username }),
  cv: null,
  setCv: (cv) => set({ cv }),
  linkedinUrl: "",
  setLinkedinUrl: (linkedinUrl) => set({ linkedinUrl }),
  additionalInfo: "",
  setAdditionalInfo: (additionalInfo) => set({ additionalInfo }),
}))

export default useStore