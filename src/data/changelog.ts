export interface ChangelogEntry {
  date: string   // YYYY-MM-DD — newest first
  title: string
  bullets: string[]
}

// Add new entries at the TOP. The date drives what users see vs. what they've dismissed.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-05-08',
    title: 'Notes, session action items & template improvements',
    bullets: [
      'Details tab: new full-height notes scratchpad to the right of account info',
      'Session action items now sync to the Action Items tab automatically',
      'Plan template names are now double-click editable inline',
      'Archiving plan templates instead of deleting — restore any time from the archived list',
    ],
  },
]
