import { ProjectTasksPage } from "@/components/project-tasks-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;

  return <ProjectTasksPage workspaceId={workspaceId} projectId={projectId} />;
}
