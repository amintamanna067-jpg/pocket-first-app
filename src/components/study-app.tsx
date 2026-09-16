import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ChevronDown, ChevronRight, Cloud, CloudOff, FileText, Folder, FolderPlus, GraduationCap, LogOut, Menu, MoreVertical, Plus, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateStudyMaterial, regenerateConcept } from "@/lib/study.functions";
import { cacheTopic, listCachedTopics, readCachedTopic } from "@/lib/offline-cache";
import type { StudyPayload, StudyTopic } from "@/lib/study-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Course = { id: string; name: string; sort_position: number };
type Chapter = { id: string; course_id: string; name: string; sort_position: number };
type Review = { flashcard_key: string; repetitions: number; interval_days: number; ease_factor: number; next_review_at: string; last_result: string | null };
type Screen = "home" | "new" | "topic" | "review" | "progress";

export function StudyApp({ userId, email }: { userId: string; email: string }) {
  const navigate = useNavigate();
  const generate = useServerFn(generateStudyMaterial);
  const regenerate = useServerFn(regenerateConcept);
  const [online, setOnline] = useState(true);
  const [screen, setScreen] = useState<Screen>("home");
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [active, setActive] = useState<StudyTopic | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!navigator.onLine) { setTopics(await listCachedTopics(userId)); return; }
    const [{ data: c }, { data: ch }, { data: t }, { data: r }] = await Promise.all([
      supabase.from("courses").select("id,name,sort_position").order("sort_position"),
      supabase.from("chapters").select("id,course_id,name,sort_position").order("sort_position"),
      supabase.from("topics").select("*").order("sort_position"),
      supabase.from("flashcard_reviews").select("flashcard_key,repetitions,interval_days,ease_factor,next_review_at,last_result"),
    ]);
    setCourses(c ?? []); setChapters(ch ?? []); setTopics((t ?? []) as unknown as StudyTopic[]); setReviews(r ?? []);
  }
  useEffect(() => {
    setOnline(navigator.onLine); void load();
    const on = () => { setOnline(true); void load(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function openTopic(topic: StudyTopic) {
    const resolved = online ? topic : await readCachedTopic(userId, topic.id);
    if (!resolved) return setError("This topic is not available offline yet.");
    setActive(resolved); setScreen("topic"); setDrawerOpen(false); setError("");
    if (online) await cacheTopic(userId, resolved);
  }
  async function signOut() {
    await supabase.auth.signOut(); await navigate({ to: "/", replace: true });
  }
  const dueCards = topics.flatMap((topic) => topic.generated_payload.flashcards.map((card) => ({ ...card, topic }))).filter(({ key }) => {
    const review = reviews.find((item) => item.flashcard_key === key);
    return !review || new Date(review.next_review_at) <= new Date();
  });
  const accuracy = reviews.length ? Math.round((reviews.filter((r) => r.last_result === "good").length / reviews.length) * 100) : 0;

  const tree = <Tree courses={courses} chapters={chapters} topics={topics} expandedCourses={expandedCourses} expandedChapters={expandedChapters} setExpandedCourses={setExpandedCourses} setExpandedChapters={setExpandedChapters} onOpen={openTopic} onChanged={load} online={online} />;
  return <div className="h-dvh overflow-hidden bg-background text-foreground">
    <header className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-3 sm:px-5">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 lg:hidden" aria-label="Open folders"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-4"><SheetHeader><SheetTitle>Study Shelf</SheetTitle></SheetHeader><div className="mt-5">{tree}</div></SheetContent></Sheet>
      <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => setScreen("home")}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><GraduationCap className="h-5 w-5" /></span><span className="truncate font-bold">Study Shelf</span></button>
      <div className="flex shrink-0 items-center gap-1"><span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">{online ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}{online ? "Synced" : "Offline"}</span><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Sign out" onClick={signOut}><LogOut /></Button></div>
    </header>
    {!online && <div className="bg-warning px-4 py-2 text-center text-xs font-medium text-warning-foreground">Offline — saved topics are read-only</div>}
    <div className="grid h-[calc(100dvh-3.5rem)] min-w-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden overflow-y-auto border-r bg-sidebar p-4 lg:block">{tree}<p className="mt-8 truncate px-2 text-xs text-muted-foreground">{email}</p></aside>
      <main className="min-w-0 overflow-y-auto overflow-x-hidden pb-24">
        {error && <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {screen === "home" && <Dashboard topics={topics} dueCount={dueCards.length} accuracy={accuracy} onNew={() => setScreen("new")} onTopic={openTopic} onReview={() => setScreen("review")} onProgress={() => setScreen("progress")} />}
        {screen === "new" && <NewMaterial courses={courses} chapters={chapters} topics={topics} online={online} generate={generate} onSaved={async (topic) => { await cacheTopic(userId, topic); await load(); setActive(topic); setScreen("topic"); }} onError={setError} />}
        {screen === "topic" && active && <TopicView topic={active} chapters={chapters} online={online} regenerate={regenerate} onUpdate={async (payload) => { const next = { ...active, generated_payload: payload }; setActive(next); setTopics((all) => all.map((t) => t.id === next.id ? next : t)); await cacheTopic(userId, next); }} onChanged={load} onReview={() => setScreen("review")} />}
        {screen === "review" && <ReviewView cards={dueCards} online={online} onReviewed={load} />}
        {screen === "progress" && <ProgressView topics={topics} reviews={reviews} accuracy={accuracy} dueCount={dueCards.length} />}
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t bg-card lg:left-[280px]">
      {([ ["home", BookOpen, "Home"], ["new", Plus, "New"], ["review", RefreshCw, "Review"], ["progress", GraduationCap, "Progress"] ] as const).map(([id, Icon, label]) => <button key={id} onClick={() => setScreen(id)} className={`grid min-w-0 place-items-center text-xs ${screen === id ? "text-primary" : "text-muted-foreground"}`}><span className="flex flex-col items-center gap-1"><Icon className="h-5 w-5" />{label}</span></button>)}
    </nav>
  </div>;
}

function Tree({ courses, chapters, topics, expandedCourses, expandedChapters, setExpandedCourses, setExpandedChapters, onOpen, onChanged, online }: any) {
  async function addCourse() { const name = window.prompt("Course name"); if (!name) return; await supabase.from("courses").insert({ name, sort_position: Date.now() }); await onChanged(); }
  async function addChapter(courseId: string) { const name = window.prompt("Chapter name"); if (!name) return; await supabase.from("chapters").insert({ course_id: courseId, name, sort_position: Date.now() }); await onChanged(); }
  async function rename(table: "courses" | "chapters" | "topics", id: string, current: string) { const name = window.prompt("New name", current); if (!name) return; await supabase.from(table).update(table === "topics" ? { title: name } : { name }).eq("id", id); await onChanged(); }
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => { const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); update(next); };
  return <div className="min-w-0"><div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center"><p className="truncate text-xs font-bold uppercase text-muted-foreground">Library</p><Button variant="ghost" size="icon" className="h-11 w-11" disabled={!online} onClick={addCourse} aria-label="Add course"><FolderPlus /></Button></div>{courses.length === 0 && <p className="px-2 text-sm text-muted-foreground">Create a course to organize topics.</p>}{courses.map((course: Course) => <div key={course.id} className="min-w-0"><div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center"><button className="grid h-11 place-items-center" onClick={() => toggle(expandedCourses, course.id, setExpandedCourses)}>{expandedCourses.has(course.id) ? <ChevronDown /> : <ChevronRight />}</button><span className="truncate text-sm font-semibold">{course.name}</span><button className="grid h-11 place-items-center" disabled={!online} onClick={() => addChapter(course.id)} aria-label="Add chapter"><Plus className="h-4 w-4" /></button></div>{expandedCourses.has(course.id) && chapters.filter((ch: Chapter) => ch.course_id === course.id).map((chapter: Chapter) => <div className="ml-5 min-w-0" key={chapter.id}><div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center"><button className="grid h-11 place-items-center" onClick={() => toggle(expandedChapters, chapter.id, setExpandedChapters)}>{expandedChapters.has(chapter.id) ? <ChevronDown /> : <ChevronRight />}</button><span className="truncate text-sm">{chapter.name}</span><button className="grid h-11 place-items-center" disabled={!online} onClick={() => rename("chapters", chapter.id, chapter.name)} aria-label="Rename chapter"><MoreVertical className="h-4 w-4" /></button></div>{expandedChapters.has(chapter.id) && topics.filter((t: StudyTopic) => t.chapter_id === chapter.id).map((topic: StudyTopic) => <div key={topic.id} className="grid grid-cols-[minmax(0,1fr)_44px] pl-7"><button className="flex h-11 min-w-0 items-center gap-2 text-left text-sm" onClick={() => onOpen(topic)}><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{topic.title} <span className="text-xs text-muted-foreground">v{topic.version_number}</span></span></button><button className="grid h-11 place-items-center" disabled={!online} onClick={() => rename("topics", topic.id, topic.title)} aria-label="Rename topic"><MoreVertical className="h-4 w-4" /></button></div>)}</div>)}</div>)}</div>;
}

function Dashboard({ topics, dueCount, accuracy, onNew, onTopic, onReview, onProgress }: any) {
  return <div className="mx-auto w-full max-w-4xl p-4 sm:p-7"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><p className="text-sm text-muted-foreground">Your learning workspace</p><h1 className="mt-1 text-2xl font-bold">Pick up where you left off</h1></div><Button size="icon" className="h-11 w-11 shrink-0" onClick={onNew} aria-label="Add material"><Plus /></Button></div><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={onReview} className="rounded-lg border bg-card p-4 text-left"><p className="text-2xl font-bold">{dueCount}</p><p className="text-sm text-muted-foreground">Cards due</p></button><button onClick={onProgress} className="rounded-lg border bg-card p-4 text-left"><p className="text-2xl font-bold">{accuracy}%</p><p className="text-sm text-muted-foreground">Recall accuracy</p></button></div><div className="mt-8"><h2 className="text-base font-bold">Recent topics</h2><div className="mt-3 space-y-2">{topics.slice().reverse().slice(0, 8).map((topic: StudyTopic) => <button key={topic.id} onClick={() => onTopic(topic)} className="grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-3 text-left"><span className="grid h-10 w-10 place-items-center rounded-md bg-secondary"><FileText /></span><span className="min-w-0"><span className="block truncate font-medium">{topic.title}</span><span className="block truncate text-xs text-muted-foreground">{topic.generated_payload.concepts.length} concepts · version {topic.version_number}</span></span><ChevronRight className="h-4 w-4" /></button>)}{topics.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">No study topics yet</p><p className="mt-1 text-sm text-muted-foreground">Add notes or a document to begin.</p><Button className="mt-4 h-11" onClick={onNew}><Sparkles />Create your first topic</Button></div>}</div></div></div>;
}

function NewMaterial({ courses, chapters, topics, online, generate, onSaved, onError }: any) {
  const [title, setTitle] = useState(""); const [text, setText] = useState(""); const [sourceType, setSourceType] = useState("notes"); const [sourceName, setSourceName] = useState<string | null>(null); const [chapterId, setChapterId] = useState(""); const [busy, setBusy] = useState(false);
  async function fileChanged(file?: File) { if (!file) return; setSourceName(file.name); const ext = file.name.split(".").pop()?.toLowerCase(); setSourceType(ext === "pdf" ? "pdf" : ext === "md" ? "md" : "txt"); if (!title) setTitle(file.name.replace(/\.[^.]+$/, "")); if (ext === "pdf") { try { const pdfjs = await import("pdfjs-dist"); const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), disableWorker: true }).promise; let value = ""; for (let i = 1; i <= doc.numPages; i++) { const page = await doc.getPage(i); const content = await page.getTextContent(); value += content.items.map((item) => "str" in item ? item.str : "").join(" ") + "\n"; } if (!value.trim()) throw new Error(); setText(value); } catch { onError("This PDF is encrypted, scanned, or has no selectable text."); } } else setText(await file.text()); }
  async function createFolders() { let courseId = courses[0]?.id; if (!courseId) { const name = window.prompt("Course name"); if (!name) return; const { data } = await supabase.from("courses").insert({ name }).select().single(); courseId = data?.id; } const name = window.prompt("Chapter name"); if (!name || !courseId) return; const { data } = await supabase.from("chapters").insert({ course_id: courseId, name }).select().single(); if (data) setChapterId(data.id); }
  async function submit() { if (!online) return onError("Connect to the internet to generate study material."); if (!chapterId) return onError("Choose or create a chapter first."); setBusy(true); onError(""); try { const payload = await generate({ data: { title, sourceText: text } }); const matching = topics.filter((t: StudyTopic) => t.title.trim().toLowerCase() === title.trim().toLowerCase()).sort((a: StudyTopic,b: StudyTopic) => b.version_number-a.version_number)[0]; const { data, error } = await supabase.from("topics").insert({ chapter_id: chapterId, title, source_type: sourceType, source_name: sourceName, source_text: text, generated_payload: payload as any, version_family: matching?.version_family, version_number: matching ? matching.version_number + 1 : 1, sort_position: Date.now(), cached_at: new Date().toISOString() }).select().single(); if (error) throw error; await onSaved(data as unknown as StudyTopic); } catch (e) { onError(e instanceof Error ? e.message : "Generation failed."); } finally { setBusy(false); } }
  return <div className="mx-auto max-w-3xl p-4 sm:p-7"><p className="text-sm font-semibold text-primary">NEW MATERIAL</p><h1 className="mt-1 text-2xl font-bold">Turn material into a study guide</h1><div className="mt-6 space-y-5"><label className="block"><span className="mb-2 block text-sm font-medium">Topic title</span><Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Photosynthesis" /></label><label className="block"><span className="mb-2 block text-sm font-medium">Paste notes or text</span><Textarea className="min-h-64 resize-y" value={text} onChange={(e) => { setText(e.target.value); setSourceType("notes"); }} placeholder="Paste the material you want to study…" /></label><label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4"><FileText className="shrink-0" /><span className="min-w-0 flex-1 truncate text-sm">{sourceName ?? "Choose .txt, .md, or text-based .pdf"}</span><input className="sr-only" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" onChange={(e) => fileChanged(e.target.files?.[0])} /></label><div><span className="mb-2 block text-sm font-medium">Save in chapter</span>{chapters.length ? <Select value={chapterId} onValueChange={setChapterId}><SelectTrigger className="h-11"><SelectValue placeholder="Choose a chapter" /></SelectTrigger><SelectContent>{courses.flatMap((course: Course) => chapters.filter((ch: Chapter) => ch.course_id === course.id).map((chapter: Chapter) => <SelectItem key={chapter.id} value={chapter.id}>{course.name} / {chapter.name}</SelectItem>))}</SelectContent></Select> : <Button variant="outline" className="h-11 w-full" onClick={createFolders}><FolderPlus />Create course and chapter</Button>}</div><Button className="h-12 w-full" disabled={busy || !title.trim() || text.trim().length < 20 || !online} onClick={submit}>{busy ? <><RefreshCw className="animate-spin" />Building your lesson…</> : <><Sparkles />Generate study guide</>}</Button></div></div>;
}

function TopicView({ topic, chapters, online, regenerate, onUpdate, onChanged, onReview }: any) {
  const [busyKey, setBusyKey] = useState("");
  async function redo(key: string, action: "explain" | "example") { setBusyKey(`${key}-${action}`); try { onUpdate(await regenerate({ data: { topicId: topic.id, conceptKey: key, action } })); } finally { setBusyKey(""); } }
  async function move(chapterId: string) { await supabase.from("topics").update({ chapter_id: chapterId }).eq("id", topic.id); await onChanged(); }
  async function shift(delta: number) { await supabase.from("topics").update({ sort_position: topic.sort_position + delta }).eq("id", topic.id); await onChanged(); }
  return <article className="mx-auto max-w-3xl p-4 sm:p-7"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-primary">TOPIC · VERSION {topic.version_number}</p><h1 className="mt-1 break-words text-2xl font-bold">{topic.title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.generated_payload.summary}</p></div><Button size="icon" className="h-11 w-11" onClick={onReview} aria-label="Review flashcards"><BookOpen /></Button></div>{online && <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><Select value={topic.chapter_id} onValueChange={move}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{chapters.map((ch: Chapter) => <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" className="h-11" onClick={() => shift(-1500)}>Move up</Button><Button variant="outline" className="h-11" onClick={() => shift(1500)}>Move down</Button></div>}<div className="mt-8 space-y-4">{topic.generated_payload.concepts.map((concept: any, index: number) => <section key={concept.key} className="rounded-lg border bg-card p-4 sm:p-5"><p className="text-xs font-bold text-primary">CONCEPT {index + 1}</p><h2 className="mt-1 text-lg font-bold">{concept.title}</h2><p className="mt-3 leading-7">{concept.explanation}</p><div className="mt-4 rounded-md bg-secondary p-3"><p className="text-xs font-bold">REAL-LIFE EXAMPLE</p><p className="mt-1 text-sm leading-6">{concept.example}</p></div><div className="mt-4 border-l-2 border-primary pl-3"><p className="text-xs font-bold text-muted-foreground">QUICK RECALL</p><p className="mt-1 text-sm font-medium">{concept.recallQuestion}</p></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="outline" className="min-h-11 whitespace-normal" disabled={!online || !!busyKey} onClick={() => redo(concept.key, "explain")}>{busyKey === `${concept.key}-explain` ? "Rewriting…" : "Explain differently"}</Button><Button variant="outline" className="min-h-11 whitespace-normal" disabled={!online || !!busyKey} onClick={() => redo(concept.key, "example")}>{busyKey === `${concept.key}-example` ? "Creating…" : "Another example"}</Button></div></section>)}</div></article>;
}

function ReviewView({ cards, online, onReviewed }: any) { const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false); const card = cards[index]; async function rate(result: "again"|"hard"|"good") { if (!card || !online) return; const { data: existing } = await supabase.from("flashcard_reviews").select("*").eq("topic_id", card.topic.id).eq("flashcard_key", card.key).maybeSingle(); const reps = result === "again" ? 0 : (existing?.repetitions ?? 0) + 1; const interval = result === "again" ? 1 : result === "hard" ? Math.max(2, Math.round((existing?.interval_days ?? 1) * 1.2)) : reps === 1 ? 1 : reps === 2 ? 6 : Math.round((existing?.interval_days ?? 6) * (existing?.ease_factor ?? 2.5)); await supabase.from("flashcard_reviews").upsert({ topic_id: card.topic.id, flashcard_key: card.key, repetitions: reps, interval_days: interval, ease_factor: existing?.ease_factor ?? 2.5, last_result: result, last_reviewed_at: new Date().toISOString(), next_review_at: new Date(Date.now()+interval*86400000).toISOString() }, { onConflict: "user_id,topic_id,flashcard_key" }); setFlipped(false); setIndex((i) => Math.min(i+1, cards.length)); await onReviewed(); }
  if (!card) return <div className="mx-auto max-w-xl p-4 text-center sm:p-7"><div className="mt-20 rounded-lg border border-dashed p-8"><h1 className="text-2xl font-bold">You’re caught up</h1><p className="mt-2 text-muted-foreground">No flashcards are due right now.</p></div></div>;
  return <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col p-4 sm:p-7"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center"><h1 className="truncate text-xl font-bold">Review</h1><span className="text-sm text-muted-foreground">{index+1} / {cards.length}</span></div><Progress className="mt-3" value={((index+1)/cards.length)*100} /><button onClick={() => setFlipped(!flipped)} className="my-6 grid min-h-80 flex-1 place-items-center rounded-lg border bg-card p-6 text-center shadow-sm"><div><p className="text-xs font-bold text-primary">{flipped ? "ANSWER" : "QUESTION"}</p><p className="mt-4 text-xl font-semibold leading-8">{flipped ? card.back : card.front}</p><p className="mt-8 text-xs text-muted-foreground">Tap to {flipped ? "see question" : "reveal answer"}</p></div></button><div className="grid grid-cols-3 gap-2"><Button variant="outline" className="h-12" disabled={!flipped || !online} onClick={() => rate("again")}>Again</Button><Button variant="outline" className="h-12" disabled={!flipped || !online} onClick={() => rate("hard")}>Hard</Button><Button className="h-12" disabled={!flipped || !online} onClick={() => rate("good")}>Good</Button></div></div>;
}

function ProgressView({ topics, reviews, accuracy, dueCount }: any) { const concepts = topics.reduce((sum: number, t: StudyTopic) => sum + t.generated_payload.concepts.length, 0); return <div className="mx-auto max-w-3xl p-4 sm:p-7"><p className="text-sm font-semibold text-primary">PROGRESS</p><h1 className="mt-1 text-2xl font-bold">Your study activity</h1><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[[topics.length,"Topics"],[concepts,"Concepts"],[`${accuracy}%`,"Accuracy"],[dueCount,"Cards due"]].map(([value,label]) => <div key={label} className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>)}</div><section className="mt-8"><h2 className="font-bold">Review consistency</h2><Progress className="mt-3 h-3" value={Math.min(100, reviews.length*5)} /><p className="mt-2 text-sm text-muted-foreground">{reviews.length} review records completed</p></section></div>; }