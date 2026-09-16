CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  sort_position numeric NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses_own_all" ON public.courses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX courses_owner_order_idx ON public.courses(user_id, sort_position);
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  sort_position numeric NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters_own_all" ON public.chapters FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.user_id = auth.uid()));
CREATE INDEX chapters_owner_course_order_idx ON public.chapters(user_id, course_id, sort_position);
CREATE TRIGGER chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  source_type text NOT NULL CHECK (source_type IN ('text', 'notes', 'txt', 'md', 'pdf')),
  source_name text,
  source_text text NOT NULL,
  version_family uuid NOT NULL DEFAULT gen_random_uuid(),
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number > 0),
  generated_payload jsonb NOT NULL,
  sort_position numeric NOT NULL DEFAULT 1000,
  cached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, version_family, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO authenticated;
GRANT ALL ON public.topics TO service_role;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics_own_all" ON public.topics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chapters ch WHERE ch.id = chapter_id AND ch.user_id = auth.uid()));
CREATE INDEX topics_owner_chapter_order_idx ON public.topics(user_id, chapter_id, sort_position);
CREATE INDEX topics_owner_family_idx ON public.topics(user_id, version_family, version_number DESC);
CREATE TRIGGER topics_updated_at BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.concept_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  concept_key text NOT NULL,
  studied boolean NOT NULL DEFAULT false,
  recall_attempts integer NOT NULL DEFAULT 0 CHECK (recall_attempts >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= recall_attempts),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_id, concept_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_progress TO authenticated;
GRANT ALL ON public.concept_progress TO service_role;
ALTER TABLE public.concept_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_progress_own_all" ON public.concept_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND t.user_id = auth.uid()));
CREATE INDEX concept_progress_owner_topic_idx ON public.concept_progress(user_id, topic_id);
CREATE TRIGGER concept_progress_updated_at BEFORE UPDATE ON public.concept_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  flashcard_key text NOT NULL,
  repetitions integer NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  interval_days integer NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ease_factor numeric NOT NULL DEFAULT 2.5 CHECK (ease_factor >= 1.3),
  last_result text CHECK (last_result IN ('again', 'hard', 'good')),
  last_reviewed_at timestamptz,
  next_review_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_id, flashcard_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_reviews TO authenticated;
GRANT ALL ON public.flashcard_reviews TO service_role;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flashcard_reviews_own_all" ON public.flashcard_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND t.user_id = auth.uid()));
CREATE INDEX flashcard_reviews_due_idx ON public.flashcard_reviews(user_id, next_review_at);
CREATE TRIGGER flashcard_reviews_updated_at BEFORE UPDATE ON public.flashcard_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();