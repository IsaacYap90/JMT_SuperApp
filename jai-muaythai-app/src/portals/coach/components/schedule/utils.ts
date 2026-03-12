import { ClassItem, PTSession, TimelineItem } from './types';

// Helper to get current date/time in Singapore timezone
export const getSingaporeDate = () => {
  const now = new Date();
  const singaporeOffset = 8 * 60 * 60 * 1000; // UTC+8
  return new Date(now.getTime() + singaporeOffset);
};

export const getDayOfWeek = (date: Date): string => {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()];
};

export const formatTime = (time: string) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const isTimePassed = (startTime: string, date: Date) => {
  if (!startTime) return false;
  const nowSG = getSingaporeDate();
  const [hours, minutes] = startTime.split(':').map(Number);
  const classDateTime = new Date(date);
  classDateTime.setUTCHours(hours, minutes, 0, 0);
  return nowSG > classDateTime;
};

// Format date for alert
export const formatDate = (isoString: string) => {
  const date = new Date(isoString);
  // Convert to Singapore timezone
  const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return sgDate.toLocaleDateString('en-SG', {
    timeZone: 'UTC', // Since we already adjusted the time, use UTC to avoid double conversion
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// Format datetime for PT sessions in Singapore timezone (UTC+8)
export const formatPTDateTime = (isoString: string) => {
  const date = new Date(isoString);
  const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  const hours = sgDate.getUTCHours();
  const minutes = sgDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return {
    time: `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`,
    date: sgDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
  };
};

// Check if PT session is passed (using Singapore timezone)
export const isPTSessionPassed = (isoString: string) => {
  const now = new Date();
  const singaporeOffset = 8 * 60 * 60 * 1000;
  const sessionDate = new Date(isoString);
  const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
  const nowInSG = new Date(now.getTime() + singaporeOffset);
  return sessionInSG < nowInSG;
};

// Get class level from name
export const getClassLevel = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('kids')) return 'Kids';
  if (lower.includes('pre-teen')) return 'Pre-Teen';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('advanced')) return 'Advanced';
  if (lower.includes('pro fighter')) return 'Pro Fighter';
  return 'All Levels';
};

// Format time for timeline (12-hour format)
export const formatTimelineTime = (timeStr: string): string => {
  if (timeStr.includes(':')) {
    // Class time format: HH:MM:SS
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }
  // ISO string format for PT
  return formatPTDateTime(timeStr).time;
};

export const generateWeekDays = (today: Date) => {
  const days = [];
  for (let i = -7; i <= 13; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + i);
    days.push({
      date,
      dayOfWeek: getDayOfWeek(date),
      isToday: i === 0,
      isPast: i < 0,
    });
  }
  return days;
};

// Helper: Group buddy sessions - show only ONE card per time slot
export const groupBuddySessions = (sessions: any[]): PTSession[] => {
  const sessionMap = new Map<string, any>();

  sessions.forEach(item => {
    // Use scheduled_at + session_type as key to group buddy sessions
    const key = `${item.scheduled_at}_${item.session_type}`;

    if (item.session_type === 'buddy') {
      // For buddy sessions, only keep the first member's entry
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          id: item.id,
          scheduled_at: item.scheduled_at,
          duration_minutes: item.duration_minutes,
          status: item.status,
          member_name: (item.member as any)?.full_name || 'Unknown Member',
          session_type: item.session_type,
          commission_amount: item.commission_amount,
        });
      }
      // Skip duplicate buddy sessions at same time slot
    } else {
      // Non-buddy sessions: use just scheduled_at as key
      const soloKey = item.scheduled_at;
      if (!sessionMap.has(soloKey)) {
        sessionMap.set(soloKey, {
          id: item.id,
          scheduled_at: item.scheduled_at,
          duration_minutes: item.duration_minutes,
          status: item.status,
          member_name: (item.member as any)?.full_name || 'Unknown Member',
          session_type: item.session_type,
          commission_amount: item.commission_amount,
        });
      }
    }
  });

  return Array.from(sessionMap.values())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
};

// Create unified timeline for a day
export const createUnifiedTimeline = (dayClasses: ClassItem[], dayPTSessions: PTSession[], dayDate: Date): TimelineItem[] => {
  const items: TimelineItem[] = [];

  // Add classes
  dayClasses.forEach(cls => {
    items.push({
      id: `class-${cls.id}`,
      type: 'class',
      time: formatTimelineTime(cls.start_time),
      title: cls.name,
      subtitle: getClassLevel(cls.name),
      details: `${cls.start_time} - ${cls.end_time}`,
      isPassed: dayDate < new Date() || isTimePassed(cls.start_time, dayDate),
      isAssistant: !cls.isMyClass, // Not my class means assistant role
      data: cls,
    });
  });

  // Add PT sessions
  dayPTSessions.forEach(session => {
    const { time } = formatPTDateTime(session.scheduled_at);
    const isBuddy = session.session_type === 'buddy';
    const isHouseCall = session.session_type === 'house_call';
    const icon = isBuddy ? '👥' : isHouseCall ? '🏠' : '';

    items.push({
      id: `pt-${session.id}`,
      type: 'pt',
      time: time,
      title: `${icon} ${session.member_name}`.trim(),
      subtitle: `${session.duration_minutes} min`,
      details: `${session.duration_minutes} min`,
      isPassed: dayDate < new Date() || isPTSessionPassed(session.scheduled_at),
      sessionType: session.session_type,
      commission: session.commission_amount || 40,
      data: session,
    });
  });

  // Sort by time
  return items.sort((a, b) => {
    const timeA = a.time.replace(/([0-9]+):([0-9]+)\s*(AM|PM)/i, (_, h, m, ampm) => {
      let hour = parseInt(h);
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:${m}`;
    });
    const timeB = b.time.replace(/([0-9]+):([0-9]+)\s*(AM|PM)/i, (_, h, m, ampm) => {
      let hour = parseInt(h);
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:${m}`;
    });
    return timeA.localeCompare(timeB);
  });
};
