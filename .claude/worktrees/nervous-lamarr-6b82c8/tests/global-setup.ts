/**
 * global-setup.ts — runs once before all tests.
 *
 * Signs in via the demo flow (anonymous Supabase session) and saves the
 * authenticated browser state to tests/auth/user.json.  Every test then
 * loads this state instead of signing in fresh, avoiding Supabase rate-limits
 * and shaving ~13s off every test's startup time.
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, 'auth', 'user.json')
const BASE_URL  = process.env.BASE_URL || 'https://onboard-io.vercel.app'

export default async function globalSetup() {
  // Ensure the auth directory exists
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page    = await context.newPage()

  console.log('\n🔐 Global setup: signing in via demo mode…')

  await page.goto(`${BASE_URL}/login`)

  // Click the demo button
  const demoBtn = page.getByRole('button', { name: /skip and try with sample data/i })
  await demoBtn.waitFor({ state: 'visible', timeout: 15_000 })
  await demoBtn.click()

  // Wait for dashboard — the demo setup call + router.push('/') + router.refresh()
  // can take a few seconds on Vercel cold starts.
  try {
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 })
  } catch {
    // If still on /login after 30s, something went wrong
    await page.screenshot({ path: 'test-results/global-setup-failed.png' })
    await browser.close()
    throw new Error(`Global setup: demo login did not redirect to / — stayed at ${page.url()}`)
  }

  // Wait for the dashboard heading to confirm the page fully rendered
  await page.getByRole('heading', { name: 'Accounts' }).waitFor({ timeout: 15_000 })

  console.log('✅ Global setup: authenticated, saving state…')

  // Save auth state (cookies + localStorage) for all tests to reuse
  await context.storageState({ path: AUTH_FILE })

  await browser.close()
  console.log(`✅ Global setup: state saved to ${AUTH_FILE}\n`)
}
