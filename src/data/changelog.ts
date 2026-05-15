export interface ChangelogEntry {
  date: string   // YYYY-MM-DD — newest first
  title: string
  bullets: string[]
}

// Add new entries at the TOP. The date drives what users see vs. what they've dismissed.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-05-15',
    title: 'Updated SKU list to match new product lineup',
    bullets: [
      'SKUs now reflect the full ReSpark product catalog: Essentials, Pro, Dispatch, Rail, Exports, UptimePM Core, UptimePM Pro, and UptimePM Enterprise',
      'Add-ons updated to match: AI Agents (Commercial, Operations, Finance, Dispatch), Supplier Portal, Integrated GL, Brokerage, CRV Processing, Dispatch/Rail/Exports (when layered onto Essentials or Pro), and Positive Pay',
      'Old SKUs and add-ons (Facility Mgmt, Full Suite, Export Compliance, API) have been removed',
      'Default plan templates renamed from "Facility Management Standard" to "Yard Ops Standard"',
    ],
  },
  {
    date: '2026-05-15',
    title: 'Intake form tabs: Hardware, Reporting, Compliance',
    bullets: [
      'Three new tabs on every account — Hardware, Reporting, and Compliance — automatically populated when a client submits their pre-work form',
      'Hardware tab generates one checklist item per unit (e.g. FloorScale 1, FloorScale 2, FloorScale 3) based on the counts the client entered — check items off as you configure them in ReMatter',
      'Reporting tab shows every legacy report the client filled out, with columns for date range, purpose, key columns, and a spot for you to fill in the converted ReMatter report name and status',
      'Compliance tab is a checklist of every regulatory requirement the client flagged — government uploads, regulatory configs, document templates',
      'All three tabs are fully editable inline — add items manually, delete rows, and leave per-item notes',
      'Each tab has a freeform notes section at the bottom for session notes, open questions, and follow-up items',
      'The browser tab and Vercel favicon now show a 🚀 rocket emoji instead of the old logo icon',
      'Fixed Slack sync timestamp not updating after each sync run',
    ],
  },
  {
    date: '2026-05-13',
    title: 'Tooltips, smarter scan timing, and inline editing',
    bullets: [
      'Hover over the Last Outreach or Last Contact numbers on the dashboard to see what the interaction was and when',
      'Hover over KO or GL in the Timeline column to see the exact kickoff or go-live date',
      'The AI scan now only looks back to your last sync — no more re-surfacing old emails',
      'You can edit action item titles and notes inline — click any title or note to update it in place',
      'More PDF export polish — milestone pills are now solid teal, the Go-Live section shows the target date, internal steps (Account Creation, Sub Topics) are hidden from the customer view, and the AI intro no longer names individual contacts',
      'Fixed the exported onboarding plan PDF — milestone timeline no longer overlaps, and content flows across pages without leaving blank pages at the end',
      'Calendar sync now matches meetings by account name in the event title (not just by attendee email), logs them directly without a review step, and always looks back 14 days so meetings are never missed due to sync timing',
      'Fixed the AI Suggestions badge showing a count when the list was empty — internal sync notifications were inflating the number',
      'Sub-item names are now editable — click any sub-item text to edit it in place',
      'Meetings now count as Last Outreach too, not just Last Contact — a meeting is the strongest form of outreach',
      'Last Contact and Last Outreach now follow precise rules: "Called — Reached" counts as contact, voicemail and no-answer count as outreach only, texts count as outreach only, and custom interactions have a Contact/Outreach toggle when logging',
      'Fixed calendar sync incorrectly matching meetings to the wrong account — generic industry words like "Recycling", "Metals", "Industries" are no longer used as matching signals',
      'Sync no longer re-processes emails, calendar events, or Slack messages it has already seen — all processed IDs are loaded once at the start of each sync, stopping duplicate AI suggestions at the source',
    ],
  },
  {
    date: '2026-05-12',
    title: 'Smarter syncing, cleaner suggestions',
    bullets: [
      'AI suggestions now only appear once per email or Slack message — dismissing something means it\'s gone for good',
      'Sync now only pulls emails received since your last sync, so old threads stop generating new suggestions',
      'Added a "Dismiss all" button to clear your suggestion backlog in one click',
      'Fixed the Add Resource form',
    ],
  },
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
