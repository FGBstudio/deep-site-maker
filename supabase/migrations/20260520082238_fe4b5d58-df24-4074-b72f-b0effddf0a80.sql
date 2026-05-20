ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS assignees uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.project_tasks
  SET assignees = ARRAY[assigned_to]
  WHERE assigned_to IS NOT NULL
    AND (assignees IS NULL OR array_length(assignees, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignees
  ON public.project_tasks USING GIN (assignees);