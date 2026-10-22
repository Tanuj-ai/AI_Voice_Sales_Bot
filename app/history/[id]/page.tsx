import { CallDetail } from "@/components/call-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function CallDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CallDetail callId={id} />;
}
