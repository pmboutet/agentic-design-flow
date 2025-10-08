import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ProjectsAdminView } from "@/components/admin/ProjectsAdminView";

export const metadata = {
  title: "Projects | Admin",
};

export default function AdminProjectsPage() {
  return (
    <AdminPageLayout>
      <ProjectsAdminView />
    </AdminPageLayout>
  );
}

