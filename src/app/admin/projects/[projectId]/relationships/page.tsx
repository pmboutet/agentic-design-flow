import { AdminDashboard } from "@/components/admin/AdminDashboard";

type ProjectRelationshipsPageProps = {
  params: {
    projectId: string;
  };
};

export default function ProjectRelationshipsPage({ params }: ProjectRelationshipsPageProps) {
  return <AdminDashboard mode="project-relationships" initialProjectId={params.projectId} />;
}
