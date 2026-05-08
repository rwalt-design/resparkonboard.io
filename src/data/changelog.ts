export interface ChangelogEntry {
  date: string   // YYYY-MM-DD — newest first
  title: string
  bullets: string[]
}

// Add new entries at the TOP. The date drives what users see vs. what they've dismissed.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-05-08',
    title: 'A few things you\'ve been asking for',
    bullets: [
      'You can now take freeform notes on any account — there\'s a big open space on the right side of the Details tab',
      'Action items created inside a session now show up in your Action Items tab, so nothing gets lost',
      'You can manually add action items directly from the Action Items tab',
      'Double-click any plan template name in Settings to rename it',
      'Deleting a plan template now archives it instead — you can restore it any time from the bottom of the list',
      'This popup! We\'ll use it to let you know when something changes',
    ],
  },
]
