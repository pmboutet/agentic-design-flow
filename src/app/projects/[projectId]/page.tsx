import { ProjectJourneyBoard } from "@/components/project/ProjectJourneyBoard";

type ProjectPageProps = {
  params: {
    projectId: string;
  };
};

export default function ProjectPage({ params }: ProjectPageProps) {
  return <ProjectJourneyBoard projectId={params.projectId} />;
}
