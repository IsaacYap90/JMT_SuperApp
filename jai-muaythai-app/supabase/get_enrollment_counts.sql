-- Function to get class enrollment counts for a specific date
-- Usage: select * from get_class_enrollment_counts('2026-02-09');

create or replace function get_class_enrollment_counts(target_date date)
returns table (
  class_id uuid,
  count bigint
) 
language plpgsql
security definer
as $$
begin
  return query
  select 
    ce.class_id,
    count(*) as count
  from class_enrollments ce
  where ce.session_date = target_date
    and ce.status = 'active'
  group by ce.class_id;
end;
$$;
