import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Get token from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const tokenIndex = pathParts.indexOf('calendar');
  const token = tokenIndex !== -1 && pathParts[tokenIndex + 1]
    ? pathParts[tokenIndex + 1].replace('.ics', '')
    : null;

  if (!token) {
    return new Response('Missing calendar token', { status: 400 });
  }

  // Create Supabase client with service role key
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Find user by calendar token
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, full_name, calendar_token')
    .eq('calendar_token', token)
    .single();

  if (userError || !user) {
    return new Response('Invalid calendar token', { status: 404 });
  }

  // Get date range (next 3 months)
  const now = new Date();
  const startDate = now.toISOString();
  const endDate = new Date(now.setMonth(now.getMonth() + 3)).toISOString();

  // Fetch classes where user is lead coach
  const { data: leadClasses } = await supabase
    .from('classes')
    .select('*')
    .eq('lead_coach_id', user.id)
    .eq('is_active', true);

  // Fetch classes where user is assistant coach
  const { data: assistantClasses } = await supabase
    .from('class_coaches')
    .select('class:class_id(*)')
    .eq('coach_id', user.id);

  const allClasses = [
    ...(leadClasses || []),
    ...(assistantClasses?.map(ac => ac.class) || []).filter(Boolean)
  ];

  // Fetch PT sessions
  const { data: ptSessions } = await supabase
    .from('pt_sessions')
    .select(`
      id,
      scheduled_at,
      duration_minutes,
      session_type,
      session_price,
      commission_amount,
      member:member_id(full_name),
      status
    `)
    .eq('coach_id', user.id)
    .eq('status', 'scheduled')
    .is('cancelled_at', null)
    .gte('scheduled_at', startDate)
    .lte('scheduled_at', endDate)
    .order('scheduled_at', { ascending: true });

  // Generate iCal content
  const calendarName = user.full_name ? `JMT - ${user.full_name}'s Schedule` : 'JMT Schedule';
  let icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Jai Muay Thai//Coach Calendar//EN
CALNAME:${calendarName}
X-WR-CALNAME:${calendarName}
X-WR-TIMEZONE:Asia/Singapore
X-WR-CALDESC:Your Jai Muay Thai coaching schedule
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

  // Day mapping for recurring classes
  const dayMap: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  };

  // Add class events (recurring weekly for next 3 months)
  const today = new Date();
  const threeMonthsLater = new Date(today);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  allClasses.forEach((cls: any) => {
    if (!cls.day_of_week || !cls.start_time || !cls.end_time) return;

    const dayIndex = dayMap[cls.day_of_week.toLowerCase()];
    if (dayIndex === undefined) return;

    // Calculate start time
    const [startHour, startMin] = cls.start_time.split(':').map(Number);
    const [endHour, endMin] = cls.end_time.split(':').map(Number);

    // Find next occurrence of this day of week
    let currentDate = new Date(today);
    const dayDiff = (dayIndex + 7 - currentDate.getUTCDay()) % 7;
    currentDate.setUTCDate(currentDate.getUTCDate() + dayDiff);

    // Generate events for next 12 weeks (covering ~3 months)
    for (let week = 0; week < 12; week++) {
      const eventDate = new Date(currentDate);
      eventDate.setUTCDate(eventDate.getUTCDate() + (week * 7));

      // Skip if beyond 3 months
      if (eventDate > threeMonthsLater) break;

      // Format times for iCal (UTC)
      const dtStart = new Date(Date.UTC(
        eventDate.getUTCFullYear(),
        eventDate.getUTCMonth(),
        eventDate.getUTCDate(),
        startHour,
        startMin,
        0
      ));
      const dtEnd = new Date(Date.UTC(
        eventDate.getUTCFullYear(),
        eventDate.getUTCMonth(),
        eventDate.getUTCDate(),
        endHour,
        endMin,
        0
      ));

      const uid = `class-${cls.id}-${eventDate.toISOString().split('T')[0]}@jaimuaythai.com`;
      const category = cls.lead_coach_id === user.id ? 'CLASS' : 'ASSISTANT';
      const location = cls.location || 'Jai Muay Thai, 3 Ang Mo Kio St 62';

      icalContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}
DTSTART:${dtStart.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
DTEND:${dtEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
SUMMARY:Class - ${cls.name}
DESCRIPTION:${cls.description || 'Group fitness class'}${cls.lead_coach_id !== user.id ? ' (Assistant)' : ''}
LOCATION:${location}
CATEGORIES:${category}
COLOR:#007AFF
STATUS:CONFIRMED
END:VEVENT
`;
    }
  });

  // Add PT session events (one-time)
  if (ptSessions) {
    ptSessions.forEach((session: any) => {
      const sessionDate = new Date(session.scheduled_at);
      const endDate = new Date(sessionDate.getTime() + (session.duration_minutes * 60 * 1000));

      // Format session type for display
      let sessionTypeLabel = 'PT Session';
      let category = 'PT';
      let color = '#FF9500';

      switch (session.session_type) {
        case 'buddy':
          sessionTypeLabel = 'Buddy PT';
          category = 'PT_BUDDY';
          color = '#AF52DE';
          break;
        case 'house_call':
          sessionTypeLabel = 'House Call';
          category = 'PT_HOUSE';
          color = '#FF9500';
          break;
        case 'solo_package':
          sessionTypeLabel = 'Solo PT';
          category = 'PT';
          color = '#FF9500';
          break;
        case 'solo_single':
          sessionTypeLabel = 'Single PT';
          category = 'PT';
          color = '#FF9500';
          break;
      }

      const memberName = session.member?.full_name || 'Unknown Member';
      const commission = session.commission_amount || session.session_price * 0.5 || 40;

      icalContent += `BEGIN:VEVENT
UID:pt-${session.id}@jaimuaythai.com
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'}
DTSTART:${sessionDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
DTEND:${endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
SUMMARY:${sessionTypeLabel} - ${memberName}
DESCRIPTION:${sessionTypeLabel} with ${memberName}\\nCommission: S$${commission.toFixed(2)}
LOCATION:Jai Muay Thai, 3 Ang Mo Kio St 62 (or member's location for house calls)
CATEGORIES:${category}
COLOR:${color}
STATUS:CONFIRMED
END:VEVENT
`;
    });
  }

  icalContent += 'END:VCALENDAR';

  // Return iCal file with proper headers
  return new Response(icalContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${user.full_name?.replace(/\s+/g, '_') || 'coach'}_schedule.ics"`,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
});
