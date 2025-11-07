import { ProjectJourneyBoard } from "@/components/project/ProjectJourneyBoard";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  return <ProjectJourneyBoard projectId={projectId} />;
}
