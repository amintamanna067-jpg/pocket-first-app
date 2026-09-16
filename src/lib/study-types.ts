export type StudyConcept = {
  key: string;
  title: string;
  anchor: string;
  explanation: string;
  example: string;
  recallQuestion: string;
};

export type StudyFlashcard = {
  key: string;
  front: string;
  back: string;
};

export type StudyPayload = {
  summary: string;
  concepts: StudyConcept[];
  flashcards: StudyFlashcard[];
};

export type StudyTopic = {
  id: string;
  chapter_id: string;
  title: string;
  source_type: string;
  source_name: string | null;
  source_text: string;
  version_family: string;
  version_number: number;
  generated_payload: StudyPayload;
  sort_position: number;
  updated_at: string;
};
