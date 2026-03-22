"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "./supabase";
import { Project, Platform } from "./types";

interface NewProjectInput {
  name: string;
  slug: string;
  platforms: Platform[];
  weekly_kpi?: number;
}

interface UpdateProjectInput {
  id: string;
  name: string;
  platforms: Platform[];
  weekly_kpi: number;
}

interface ProjectContextValue {
  projects: Project[];
  current: Project | null;
  setCurrent: (project: Project) => void;
  addProject: (input: NewProjectInput) => Promise<Project | null>;
  updateProject: (input: UpdateProjectInput) => Promise<Project | null>;
  reload: () => Promise<void>;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  current: null,
  setCurrent: () => {},
  addProject: async () => null,
  updateProject: async () => null,
  reload: async () => {},
  loading: true,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("vb_projects")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (data && data.length > 0) {
      setProjects(data as Project[]);
      // 從 localStorage 恢復上次選擇
      const saved = localStorage.getItem("vb_project_slug");
      const found = data.find((p: Project) => p.slug === saved);
      if (!current || !data.find((p: Project) => p.id === current.id)) {
        setCurrent((found as Project) ?? (data[0] as Project));
      }
    } else {
      setProjects([]);
    }
    setLoading(false);
  }, [current]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSetCurrent(project: Project) {
    setCurrent(project);
    localStorage.setItem("vb_project_slug", project.slug);
  }

  async function addProject(input: NewProjectInput): Promise<Project | null> {
    const { data, error } = await supabase
      .from("vb_projects")
      .insert({
        name: input.name,
        slug: input.slug,
        platforms: input.platforms,
        weekly_kpi: input.weekly_kpi ?? 100,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) return null;

    const newProject = data as Project;

    // 為新專案建立預設門檻
    const thresholdRows = input.platforms.map((platform) => ({
      project_id: newProject.id,
      platform,
      min_likes: 10000,
      min_shares: 0,
      max_days_old: 30,
    }));
    await supabase.from("vb_thresholds").insert(thresholdRows);

    // 重新載入列表並切換到新專案
    await load();
    handleSetCurrent(newProject);
    return newProject;
  }

  async function updateProject(input: UpdateProjectInput): Promise<Project | null> {
    const { data, error } = await supabase
      .from("vb_projects")
      .update({
        name: input.name,
        platforms: input.platforms,
        weekly_kpi: input.weekly_kpi,
      })
      .eq("id", input.id)
      .select()
      .single();

    if (error || !data) return null;

    const updated = data as Project;

    // 同步門檻：為新增的平台建立預設門檻
    const { data: existingThresholds } = await supabase
      .from("vb_thresholds")
      .select("platform")
      .eq("project_id", input.id);
    const existingPlatforms = new Set(
      (existingThresholds || []).map((t: any) => t.platform)
    );
    const newPlatforms = input.platforms.filter(
      (p) => !existingPlatforms.has(p)
    );
    if (newPlatforms.length > 0) {
      const thresholdRows = newPlatforms.map((platform) => ({
        project_id: input.id,
        platform,
        min_likes: 10000,
        min_shares: 0,
        max_days_old: 30,
      }));
      await supabase.from("vb_thresholds").insert(thresholdRows);
    }

    // 重新載入列表並更新當前專案參照
    await load();
    if (current?.id === updated.id) {
      setCurrent(updated);
    }
    return updated;
  }

  return (
    <ProjectContext.Provider
      value={{
        projects,
        current,
        setCurrent: handleSetCurrent,
        addProject,
        updateProject,
        reload: load,
        loading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
