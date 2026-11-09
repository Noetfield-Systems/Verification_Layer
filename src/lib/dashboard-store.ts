/**
 * Noetfield dashboard client state (Zustand).
 *
 * Holds:
 *  - activeView: which dashboard section is rendered
 *  - selectedVerificationId: drives the Verification Detail view
 *  - selectedProjectId: optional filter for the Verifications list (set when
 *    a user clicks a project card or drills in from the Projects view)
 *  - apiKey: the playground plaintext key, persisted to localStorage via
 *    zustand/middleware persist. We only persist this one field.
 *  - seeded: a guard boolean so we don't double-call /api/seed in React
 *    StrictMode (which double-invokes effects in dev).
 */

'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ViewId } from './dashboard-types'

interface DashboardState {
  activeView: ViewId
  selectedVerificationId: string | null
  selectedProjectId: string | null
  apiKey: string | null
  /** The project ID returned at signup. When set, the dashboard is scoped
   * to THIS user's project (not the demo user). Persisted to localStorage. */
  signedUpProjectId: string | null
  seeded: boolean
  /** Whether the user has entered the dashboard from the landing page. */
  enteredDashboard: boolean

  setActiveView: (view: ViewId) => void
  setSelectedVerificationId: (id: string | null) => void
  setSelectedProjectId: (id: string | null) => void
  setApiKey: (key: string | null) => void
  setSignedUpProjectId: (id: string | null) => void
  setSeeded: (v: boolean) => void
  enterDashboard: () => void
  backToLanding: () => void
  signOut: () => void
  /** Called after a successful signup: caches the key + project + enters the dashboard. */
  completeSignup: (apiKey: string, projectId: string) => void

  openVerification: (id: string) => void
  filterByProject: (projectId: string) => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      activeView: 'landing',
      selectedVerificationId: null,
      selectedProjectId: null,
      apiKey: null,
      signedUpProjectId: null,
      seeded: false,
      enteredDashboard: false,

      setActiveView: (view) => set({ activeView: view }),
      setSelectedVerificationId: (id) => set({ selectedVerificationId: id }),
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      setApiKey: (key) => set({ apiKey: key }),
      setSignedUpProjectId: (id) => set({ signedUpProjectId: id }),
      setSeeded: (v) => set({ seeded: v }),
      enterDashboard: () => set({ enteredDashboard: true, activeView: 'overview' }),
      backToLanding: () => set({ enteredDashboard: false, activeView: 'landing' }),
      signOut: () => set({ apiKey: null, signedUpProjectId: null, selectedProjectId: null, selectedVerificationId: null, enteredDashboard: false, activeView: 'landing' }),
      completeSignup: (apiKey, projectId) =>
        set({
          apiKey,
          signedUpProjectId: projectId,
          selectedProjectId: projectId,
          enteredDashboard: true,
          activeView: 'overview',
        }),

      // Convenience: switch to detail view + set the id in one shot.
      openVerification: (id) =>
        set({ activeView: 'detail', selectedVerificationId: id }),
      // Switch to verifications view with a project filter applied.
      filterByProject: (projectId) =>
        set({
          activeView: 'verifications',
          selectedProjectId: projectId,
        }),
    }),
    {
      name: 'noetfield-dashboard',
      storage: createJSONStorage(() => localStorage),
      // Persist the api key + signed-up project ID so a returning user
      // sees their own data without re-signing-up.
      partialize: (state) => ({
        apiKey: state.apiKey,
        signedUpProjectId: state.signedUpProjectId,
      }),
    },
  ),
)
