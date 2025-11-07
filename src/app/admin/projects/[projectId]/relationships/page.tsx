import { AdminDashboard } from "@/components/admin/AdminDashboard";

type ProjectRelationshipsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectRelationshipsPage({ params }: ProjectRelationshipsPageProps) {
  const { projectId } = await params;
  return <AdminDashboard mode="project-relationships" initialProjectId={projectId} />;
}
