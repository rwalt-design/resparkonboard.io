import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('Auth exchange error:', error?.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Restrict to @respark.com
  const email = data.user.email ?? ''
  if (!email.endsWith('@respark.com')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }

  // Ensure org + membership via SECURITY DEFINER function (bypasses RLS for new users)
  const name =
    (data.user.user_metadata?.full_name as string) ||
    (data.user.user_metadata?.name as string) ||
    email.split('@')[0]

  const { error: rpcError } = await supabase.rpc('ensure_org_member', {
    p_user_id: data.user.id,
    p_name: name,
  })

  if (rpcError) {
    console.error('ensure_org_member error:', rpcError.message)
    // Don't block sign-in — user can still access the app
  }

  return NextResponse.redirect(`${origin}${next}`)
}
