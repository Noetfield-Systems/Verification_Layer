'use client'

/**
 * Confetti utility — fire on first PASS in the playground, on dashboard entry,
 * and other delight moments. Uses canvas-confetti with the Noetfield emerald
 * palette. Tasteful, one-shot, never overwhelming.
 */

import confetti from 'canvas-confetti'

const EMERALD = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0']
const DARK = ['#0A0A0A', '#141414', '#262626']

/** A small, quick burst from the center-top. Good for "verification passed". */
export function firePassConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.3 },
    colors: EMERALD,
    startVelocity: 35,
    decay: 0.93,
    scalar: 0.85,
    disableForReducedMotion: true,
  })
  // Second wave for a fuller feel
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 100,
      origin: { y: 0.4 },
      colors: EMERALD,
      startVelocity: 25,
      decay: 0.92,
      scalar: 0.7,
      disableForReducedMotion: true,
    })
  }, 180)
}

/** A subtle side-cannon burst. Good for "dashboard entered" or first sign-in. */
export function fireSideConfetti() {
  confetti({
    particleCount: 50,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.7 },
    colors: EMERALD,
    disableForReducedMotion: true,
  })
  confetti({
    particleCount: 50,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.7 },
    colors: EMERALD,
    disableForReducedMotion: true,
  })
}

/** A dark + emerald mix for bigger moments (key creation, project creation). */
export function fireKeyCreatedConfetti() {
  confetti({
    particleCount: 60,
    spread: 75,
    origin: { y: 0.5 },
    colors: [...EMERALD, ...DARK],
    disableForReducedMotion: true,
  })
}

/** Quiet single-particle puff — for copy-to-clipboard moments. */
export function fireCopyPuff() {
  confetti({
    particleCount: 8,
    spread: 360,
    origin: { y: 0.5 },
    colors: EMERALD,
    startVelocity: 12,
    scalar: 0.5,
    disableForReducedMotion: true,
  })
}
