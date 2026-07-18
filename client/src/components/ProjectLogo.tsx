import { FolderKanban } from "lucide-react";
import type { Project } from "../../../shared/types";
import { cn } from "@/lib/utils";

type ProjectLogoProps = {
  project?: Pick<Project, "name" | "logoUrl"> | null;
  className?: string;
};

export function ProjectLogo({ project, className }: ProjectLogoProps) {
  return (
    <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white", className)}>
      {project?.logoUrl ? (
        <img src={project.logoUrl} alt={`Logotipo de ${project.name}`} className="h-full w-full object-contain p-0.5" />
      ) : (
        <FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

export function ProjectName({ project, className }: ProjectLogoProps) {
  if (!project) return null;
  return <span className={cn("inline-flex min-w-0 items-center gap-2", className)}><ProjectLogo project={project} /><span className="truncate">{project.name}</span></span>;
}
