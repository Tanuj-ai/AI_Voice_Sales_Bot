import { AppHeader } from "@/components/app-header";
import { VoiceCall } from "@/components/voice-call";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <AppHeader
          title="Live sales call"
          subtitle="Speak with Aria and capture the conversation in one place."
          actionHref="/history"
          actionLabel="Call history"
        />
        <VoiceCall />
      </div>
    </main>
  );
}
