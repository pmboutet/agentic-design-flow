import { ProjectJourneyBoardData } from "@/types";

/**
 * Temporary mock data used to showcase the project journey board UI.
 * The real admin experience should rely on `/api/admin/projects/[id]/journey`.
 */
export function getMockProjectJourneyData(projectId: string): ProjectJourneyBoardData {
  return {
    projectId,
    projectName: "Nova Retail Transformation",
    clientName: "Nova Retail Europe",
    projectGoal:
      "Align store and e-commerce teams to deliver a seamless hybrid customer experience across physical and digital channels.",
    projectDescription:
      "A cross-functional acceleration initiative combining store operations, digital product and customer care to remove the most painful moments of the click & collect journey.",
    projectStatus: "active",
    projectStartDate: "2024-04-01T09:00:00Z",
    projectEndDate: "2024-07-31T17:00:00Z",
    projectSystemPrompt:
      "You are the lead AI facilitator for the Nova Retail Transformation program. Your role is to help the core team surface insights, synthesise challenges and design interventions that improve the unified customer promise across online and in-store touchpoints.",
    timeframe: "Apr 2024 – Jul 2024",
    availableUsers: [
      { id: "user-alice", name: "Alice Martin", role: "Store Manager", avatarInitials: "AM", avatarColor: "bg-emerald-500" },
      { id: "user-leo", name: "Leo Dupont", role: "Digital Product Owner", avatarInitials: "LD", avatarColor: "bg-indigo-500" },
      { id: "user-fatou", name: "Fatou Ndiaye", role: "Experience Designer", avatarInitials: "FN", avatarColor: "bg-amber-500" },
      { id: "user-marc", name: "Marc Petit", role: "Logistics Lead", avatarInitials: "MP", avatarColor: "bg-sky-500" },
      { id: "user-julia", name: "Julia Costa", role: "Customer Care", avatarInitials: "JC", avatarColor: "bg-rose-500" },
      { id: "user-samir", name: "Samir Cohen", role: "Operations Analyst", avatarInitials: "SC", avatarColor: "bg-purple-500" },
    ],
    asks: [
      {
        id: "ask-field-observation",
        askKey: "ask-field-observation",
        title: "ASK #1 · Store field observations",
        summary:
          "Capture the top operational blockers observed during peak hours to understand where store and digital workflows conflict.",
        status: "active",
        theme: "Store experience",
        dueDate: "2024-05-30",
        originatingChallengeIds: ["challenge-inventory-sync", "challenge-stock-visibility", "challenge-promise-accuracy"],
        relatedProjects: [
          { id: projectId, name: "Nova Retail Transformation" },
          { id: "project-click-collect", name: "Click & Collect 2024" },
        ],
        participants: [
          {
            id: "user-alice",
            name: "Alice Martin",
            role: "Store Manager",
            avatarInitials: "AM",
            avatarColor: "bg-emerald-500",
            insights: [
              {
                id: "insight-stock-visibility",
                title: "Limited visibility on online inventory",
                type: "pain",
                description:
                  "Store teams cannot confirm online stock availability in real time, leading to broken promises for in-store pickup.",
                updatedAt: "2024-04-12T09:00:00Z",
                isCompleted: true,
                relatedChallengeIds: ["challenge-stock-visibility", "challenge-inventory-sync"],
                contributors: [
                  { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
                  { id: "user-marc", name: "Marc Petit", role: "Logistics Lead" },
                ],
                kpis: [
                  {
                    id: "kpi-stockout",
                    label: "Pickup failures per week",
                    current: "14 incidents",
                    target: "5 incidents",
                    delta: "-64%",
                  },
                ],
              },
              {
                id: "insight-pickup-waiting",
                title: "Customer waiting time at pickup counter",
                type: "signal",
                description:
                  "Customers wait an average of 12 minutes to collect orders during the evening peaks, generating negative NPS comments about the pickup promise.",
                updatedAt: "2024-04-14T10:30:00Z",
                isCompleted: true,
                relatedChallengeIds: ["challenge-omnichannel-delivery"],
                contributors: [
                  { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
                  { id: "user-julia", name: "Julia Costa", role: "Customer Care" },
                ],
                kpis: [
                  {
                    id: "kpi-waiting",
                    label: "Average pickup waiting time",
                    current: "12 min",
                    target: "6 min",
                    delta: "-50%",
                  },
                ],
              },
            ],
          },
          {
            id: "user-marc",
            name: "Marc Petit",
            role: "Logistics Lead",
            avatarInitials: "MP",
            avatarColor: "bg-sky-500",
            insights: [
              {
                id: "insight-inventory-sync",
                title: "Inventory synchronisation still batch based",
                type: "pain",
                description:
                  "The warehouse management system only synchronises with the e-commerce platform every three hours, creating inventory mismatches during peak demand.",
                updatedAt: "2024-04-15T08:45:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-inventory-sync"],
                contributors: [
                  { id: "user-marc", name: "Marc Petit", role: "Logistics Lead" },
                  { id: "user-samir", name: "Samir Cohen", role: "Operations Analyst" },
                ],
                kpis: [
                  {
                    id: "kpi-sync",
                    label: "Refresh frequency",
                    current: "Every 3h",
                    target: "Real time",
                  },
                  {
                    id: "kpi-orders",
                    label: "Cancelled pickup orders",
                    current: "7%",
                    target: "2%",
                    delta: "-5 pts",
                  },
                ],
              },
            ],
          },
        ],
        insights: [
          {
            id: "insight-stock-visibility",
            title: "Limited visibility on online inventory",
            type: "pain",
            description:
              "Store teams cannot confirm online stock availability in real time, leading to broken promises for in-store pickup.",
            updatedAt: "2024-04-12T09:00:00Z",
            isCompleted: true,
            relatedChallengeIds: ["challenge-stock-visibility", "challenge-inventory-sync"],
            contributors: [
              { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
              { id: "user-marc", name: "Marc Petit", role: "Logistics Lead" },
            ],
            kpis: [
              {
                id: "kpi-stockout",
                label: "Pickup failures per week",
                current: "14 incidents",
                target: "5 incidents",
                delta: "-64%",
              },
            ],
          },
          {
            id: "insight-pickup-waiting",
            title: "Customer waiting time at pickup counter",
            type: "signal",
            description:
              "Customers wait an average of 12 minutes to collect orders during the evening peaks, generating negative NPS comments about the pickup promise.",
            updatedAt: "2024-04-14T10:30:00Z",
            isCompleted: true,
            relatedChallengeIds: ["challenge-omnichannel-delivery"],
            contributors: [
              { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
              { id: "user-julia", name: "Julia Costa", role: "Customer Care" },
            ],
            kpis: [
              {
                id: "kpi-waiting",
                label: "Average pickup waiting time",
                current: "12 min",
                target: "6 min",
                delta: "-50%",
              },
            ],
          },
          {
            id: "insight-inventory-sync",
            title: "Inventory synchronisation still batch based",
            type: "pain",
            description:
              "The warehouse management system only synchronises with the e-commerce platform every three hours, creating inventory mismatches during peak demand.",
            updatedAt: "2024-04-15T08:45:00Z",
            isCompleted: false,
            relatedChallengeIds: ["challenge-inventory-sync"],
            contributors: [
              { id: "user-marc", name: "Marc Petit", role: "Logistics Lead" },
              { id: "user-samir", name: "Samir Cohen", role: "Operations Analyst" },
            ],
            kpis: [
              {
                id: "kpi-sync",
                label: "Refresh frequency",
                current: "Every 3h",
                target: "Real time",
              },
              {
                id: "kpi-orders",
                label: "Cancelled pickup orders",
                current: "7%",
                target: "2%",
                delta: "-5 pts",
              },
            ],
          },
        ],
      },
      {
        id: "ask-journey-reassurance",
        askKey: "ask-journey-reassurance",
        title: "ASK #2 · Phygital journey reassurance",
        summary:
          "Identify the reassurance moments needed through the hybrid journey to reduce anxiety and improve loyalty for first-time customers.",
        status: "active",
        theme: "Customer journey",
        dueDate: "2024-06-10",
        originatingChallengeIds: ["challenge-omnichannel-delivery", "challenge-change-adoption"],
        relatedProjects: [
          { id: projectId, name: "Nova Retail Transformation" },
          { id: "project-cx-2024", name: "CX Omnichannel 2024" },
        ],
        participants: [
          {
            id: "user-julia",
            name: "Julia Costa",
            role: "Customer Care",
            avatarInitials: "JC",
            avatarColor: "bg-rose-500",
            insights: [
              {
                id: "insight-app-latency",
                title: "Associate app latency at the counter",
                type: "pain",
                description:
                  "Associates wait up to 45 seconds when searching for an order in the store app while the customer is in front of them, causing visible frustration.",
                updatedAt: "2024-05-05T16:20:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-omnichannel-delivery"],
                contributors: [
                  { id: "user-julia", name: "Julia Costa", role: "Customer Care" },
                  { id: "user-leo", name: "Leo Dupont", role: "Digital Product Owner" },
                ],
                kpis: [
                  {
                    id: "kpi-latency",
                    label: "Search latency",
                    current: "45 s",
                    target: "15 s",
                    delta: "-30 s",
                  },
                ],
              },
            ],
          },
          {
            id: "user-fatou",
            name: "Fatou Ndiaye",
            role: "Experience Designer",
            avatarInitials: "FN",
            avatarColor: "bg-amber-500",
            insights: [
              {
                id: "insight-onboarding",
                title: "Associates lack guidance on hybrid promises",
                type: "idea",
                description:
                  "Teams asked for a simple one-pager summarising the hybrid promise and escalation rules for out-of-stock scenarios.",
                updatedAt: "2024-05-08T13:00:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-change-adoption"],
                contributors: [
                  { id: "user-fatou", name: "Fatou Ndiaye", role: "Experience Designer" },
                  { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
                ],
                kpis: [],
              },
            ],
          },
        ],
        insights: [
          {
            id: "insight-app-latency",
            title: "Associate app latency at the counter",
            type: "pain",
            description:
              "Associates wait up to 45 seconds when searching for an order in the store app while the customer is in front of them, causing visible frustration.",
            updatedAt: "2024-05-05T16:20:00Z",
            isCompleted: false,
            relatedChallengeIds: ["challenge-omnichannel-delivery"],
            contributors: [
              { id: "user-julia", name: "Julia Costa", role: "Customer Care" },
              { id: "user-leo", name: "Leo Dupont", role: "Digital Product Owner" },
            ],
            kpis: [
              {
                id: "kpi-latency",
                label: "Search latency",
                current: "45 s",
                target: "15 s",
                delta: "-30 s",
              },
            ],
          },
          {
            id: "insight-onboarding",
            title: "Associates lack guidance on hybrid promises",
            type: "idea",
            description:
              "Teams asked for a simple one-pager summarising the hybrid promise and escalation rules for out-of-stock scenarios.",
            updatedAt: "2024-05-08T13:00:00Z",
            isCompleted: false,
            relatedChallengeIds: ["challenge-change-adoption"],
            contributors: [
              { id: "user-fatou", name: "Fatou Ndiaye", role: "Experience Designer" },
              { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
            ],
            kpis: [],
          },
        ],
      },
    ],
    challenges: [
      {
        id: "challenge-omnichannel-delivery",
        title: "Deliver a reliable hybrid order promise",
        description:
          "Ensure promises made online can be honoured in store with consistent communication to customers and associates.",
        status: "active",
        impact: "high",
        owners: [
          { id: "user-leo", name: "Leo Dupont", role: "Digital Product Owner" },
          { id: "user-alice", name: "Alice Martin", role: "Store Manager" },
        ],
        relatedInsightIds: ["insight-pickup-waiting", "insight-app-latency"],
        children: [
          {
            id: "challenge-stock-visibility",
            title: "Share real-time inventory confidence",
            description:
              "Expose dependable inventory signals to store teams and the e-commerce platform to keep the promise reliable.",
            status: "in_progress",
            impact: "critical",
            owners: [{ id: "user-marc", name: "Marc Petit", role: "Logistics Lead" }],
            relatedInsightIds: ["insight-stock-visibility"],
            children: [],
          },
          {
            id: "challenge-inventory-sync",
            title: "Move from batch to streaming inventory sync",
            description:
              "Reduce the synchronisation lag between the warehouse and the digital storefront to keep availability promises accurate.",
            status: "active",
            impact: "high",
            owners: [
              { id: "user-marc", name: "Marc Petit", role: "Logistics Lead" },
              { id: "user-samir", name: "Samir Cohen", role: "Operations Analyst" },
            ],
            relatedInsightIds: ["insight-inventory-sync"],
            children: [],
          },
        ],
      },
      {
        id: "challenge-change-adoption",
        title: "Help associates embrace hybrid rituals",
        description:
          "Equip store teams with clear rituals, language and tools so that the hybrid promise becomes part of daily operations.",
        status: "open",
        impact: "medium",
        owners: [{ id: "user-fatou", name: "Fatou Ndiaye", role: "Experience Designer" }],
        relatedInsightIds: ["insight-onboarding"],
        children: [
          {
            id: "challenge-promise-accuracy",
            title: "Make the promise visible at the counter",
            description:
              "Give store teams quick scripts and escalation rules to respond when the promise cannot be fulfilled.",
            status: "open",
            impact: "medium",
            owners: [{ id: "user-alice", name: "Alice Martin", role: "Store Manager" }],
            relatedInsightIds: ["insight-onboarding"],
            children: [],
          },
        ],
      },
    ],
  };
}
