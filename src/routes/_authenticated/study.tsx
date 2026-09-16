import { createFileRoute } from "@tanstack/react-router";
import { StudyApp } from "@/components/study-app";

export const Route = createFileRoute("/_authenticated/study")({
  head: () => ({ meta: [
    { title: "Study workspace — Study Shelf" },
    { name: "description", content: "Organize study topics, review concepts, and practice due flashcards." },
    { property: "og:title", content: "Study workspace — Study Shelf" },
    { property: "og:description", content: "Organize study topics, review concepts, and practice due flashcards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StudyRoute,
});

function StudyRoute() {
  const { user } = Route.useRouteContext();
  return <StudyApp userId={user.id} email={user.email ?? "Signed in"} />;
}