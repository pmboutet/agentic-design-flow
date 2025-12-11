/**
 * Constants and configuration for AdminDashboard
 * Extracted for better maintainability
 */

import {
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Network,
  Settings,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SearchResultType } from "../AdminSearchContext";

// ===== Layout Constants =====

export type ColumnWidths = [number, number];

export const defaultColumnWidths: ColumnWidths = [400, 560];
export const minColumnWidths: ColumnWidths = [320, 400];
export const maxColumnWidths: ColumnWidths = [600, 800];

// ===== Button Classes =====

export const gradientButtonClasses = "btn-gradient";

// ===== Navigation =====

export const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, targetId: "section-dashboard" },
  { label: "Projects", icon: FolderKanban, targetId: "section-projects" },
  { label: "Challenges", icon: Target, targetId: "section-challenges" },
  { label: "ASK Sessions", icon: MessageSquare, targetId: "section-asks" },
  { label: "Users", icon: Users, targetId: "section-users" },
  { label: "Insights", icon: ClipboardList, targetId: "section-insights" },
  { label: "Graph RAG", icon: Network, targetId: "section-graph-rag" },
  { label: "Settings", icon: Settings, targetId: "section-settings" }
] as const;

export type SectionId = (typeof navigationItems)[number]["targetId"];
export type SectionLabel = (typeof navigationItems)[number]["label"];

// ===== Search Result Configuration =====

export const searchResultTypeConfig: Record<SearchResultType, { label: string; icon: LucideIcon }> = {
  client: { label: "Client", icon: Building2 },
  project: { label: "Project", icon: FolderKanban },
  challenge: { label: "Challenge", icon: Target },
  ask: { label: "ASK Session", icon: MessageSquare },
  user: { label: "User", icon: Users }
};
