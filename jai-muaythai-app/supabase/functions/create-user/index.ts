import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Parse request body (includes user_token for auth)
    const { email, password, full_name, role, user_token } = await req.json()

    if (!user_token) {
      return new Response(JSON.stringify({ error: 'Missing user_token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify caller is admin using their token
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${user_token}` } },
    })

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized - invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await callerClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['admin', 'master_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only admins can create users' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create user with Service Role Key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: role || 'coach', full_name },
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (data.user) {
      await adminClient.from('users').upsert({
        id: data.user.id,
        email,
        full_name,
        role: role || 'coach',
        is_first_login: true,
      })
    }

    return new Response(JSON.stringify({ user: data.user, message: 'User created successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
