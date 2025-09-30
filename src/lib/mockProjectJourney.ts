import { ProjectJourneyBoardData } from "@/types";

/**
 * Temporary mock data used to showcase the new project journey board UI.
 * In the future this should be replaced by a real API call.
 */
export function getMockProjectJourneyData(projectId: string): ProjectJourneyBoardData {
  return {
    projectId,
    projectName: "Programme Phygital Nova",
    clientName: "Nova Retail Europe",
    projectGoal:
      "Aligner les équipes magasins et e-commerce pour offrir une expérience client sans couture sur les canaux physiques et digitaux.",
    timeframe: "T2 2024",
    availableUsers: [
      { id: "user-alice", name: "Alice Martin", role: "Store Manager", avatarInitials: "AM", avatarColor: "bg-emerald-500" },
      { id: "user-leo", name: "Léo Dupont", role: "Digital Product Owner", avatarInitials: "LD", avatarColor: "bg-indigo-500" },
      { id: "user-fatou", name: "Fatou Ndiaye", role: "Experience Designer", avatarInitials: "FN", avatarColor: "bg-amber-500" },
      { id: "user-marc", name: "Marc Petit", role: "Logistics Lead", avatarInitials: "MP", avatarColor: "bg-sky-500" },
      { id: "user-julia", name: "Julia Costa", role: "Customer Care", avatarInitials: "JC", avatarColor: "bg-rose-500" },
      { id: "user-samir", name: "Samir Cohen", role: "Operations Analyst", avatarInitials: "SC", avatarColor: "bg-purple-500" },
    ],
    asks: [
      {
        id: "ask-observations",
        title: "ASK #1 · Observations terrain",
        summary:
          "Collecter les irritants terrain lors des pics d'activité pour comprendre les frictions des équipes magasin.",
        status: "active",
        theme: "Expérience magasin",
        dueDate: "2024-05-30",
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
                title: "Visibilité limitée sur les stocks e-commerce",
                type: "pain",
                description:
                  "Nous ne savons pas si l'article est réellement disponible en e-commerce. Nous promettons des retraits en magasin que nous ne pouvons pas honorer.",
                updatedAt: "2024-04-12T09:00:00Z",
                isCompleted: true,
                relatedChallengeIds: ["challenge-visibility", "challenge-data-stream"],
                kpis: [
                  {
                    id: "kpi-stockout",
                    label: "Ruptures / semaine",
                    current: "14 incidents",
                    target: "5 incidents",
                    delta: "-64%",
                  },
                ],
              },
              {
                id: "insight-pickup-waiting",
                title: "Attente client lors du retrait",
                type: "signal",
                description:
                  "Les clients attendent en moyenne 12 minutes pour récupérer leur commande click & collect pendant les pics.",
                updatedAt: "2024-04-14T10:30:00Z",
                isCompleted: true,
                relatedChallengeIds: ["challenge-omnichannel"],
                kpis: [
                  {
                    id: "kpi-waiting",
                    label: "Temps d'attente moyen",
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
                title: "Synchronisation des inventaires",
                type: "pain",
                description:
                  "La synchronisation entre notre WMS et la plateforme e-commerce se fait encore en batch toutes les 3 heures.",
                updatedAt: "2024-04-15T08:45:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-data-stream"],
                kpis: [
                  {
                    id: "kpi-sync",
                    label: "Fréquence d'actualisation",
                    current: "Toutes les 3h",
                    target: "Temps réel",
                  },
                  {
                    id: "kpi-orders",
                    label: "Commandes annulées",
                    current: "7%",
                    target: "2%",
                    delta: "-5 pts",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ask-experience",
        title: "ASK #2 · Expérience client",
        summary:
          "Identifier les moments critiques du parcours client phygital et les opportunités de réassurance.",
        status: "active",
        theme: "Parcours client",
        dueDate: "2024-06-10",
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
                title: "Latence de l'app vendeur",
                type: "pain",
                description:
                  "L'application vendeur met parfois plus de 8 secondes à charger le profil client avec l'historique d'achat.",
                updatedAt: "2024-04-16T16:20:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-data-stream", "challenge-employee-adoption"],
                kpis: [
                  {
                    id: "kpi-latency",
                    label: "Temps de chargement",
                    current: "8,4 s",
                    target: "2,5 s",
                    delta: "-70%",
                  },
                ],
              },
              {
                id: "insight-promised-date",
                title: "Promesse de date de livraison",
                type: "gain",
                description:
                  "Avec une meilleure visibilité des stocks, nous pourrions proposer des créneaux de livraison fiables et personnalisés.",
                updatedAt: "2024-04-17T09:10:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-omnichannel"],
                kpis: [
                  {
                    id: "kpi-nps",
                    label: "Impact sur NPS",
                    current: "+4 pts",
                    comment: "Projection basée sur les feedbacks clients",
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
                id: "insight-dashboard-adoption",
                title: "Adoption des dashboards",
                type: "signal",
                description:
                  "Moins de 30% des managers consultent les dashboards phygitaux chaque semaine. Ils ne savent pas comment prioriser.",
                updatedAt: "2024-04-18T11:30:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-employee-adoption", "challenge-training"],
                kpis: [
                  {
                    id: "kpi-adoption",
                    label: "Taux d'usage hebdo",
                    current: "28%",
                    target: "75%",
                    delta: "+47 pts",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "ask-innovation",
        title: "ASK #3 · Laboratoire phygital",
        summary:
          "Explorer des idées innovantes avec les équipes mixtes pour fluidifier l'expérience de retrait en boutique.",
        status: "draft",
        theme: "Innovation",
        dueDate: "2024-06-28",
        participants: [
          {
            id: "user-leo",
            name: "Léo Dupont",
            role: "Digital Product Owner",
            avatarInitials: "LD",
            avatarColor: "bg-indigo-500",
            insights: [
              {
                id: "insight-voice-assistant",
                title: "Assistant vocal de préparation",
                type: "idea",
                description:
                  "Tester un assistant vocal pour guider les préparateurs durant la constitution des commandes express.",
                updatedAt: "2024-04-20T14:00:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-omnichannel"],
                kpis: [
                  {
                    id: "kpi-prep-time",
                    label: "Temps de préparation",
                    current: "11 min",
                    target: "7 min",
                  },
                ],
              },
            ],
          },
          {
            id: "user-samir",
            name: "Samir Cohen",
            role: "Operations Analyst",
            avatarInitials: "SC",
            avatarColor: "bg-purple-500",
            insights: [
              {
                id: "insight-data-governance",
                title: "Gouvernance données phygital",
                type: "pain",
                description:
                  "Les règles de gouvernance ne sont pas alignées entre les équipes SI magasin et e-commerce, d'où des conflits de priorités.",
                updatedAt: "2024-04-19T17:40:00Z",
                isCompleted: false,
                relatedChallengeIds: ["challenge-visibility", "challenge-data-stream"],
                kpis: [
                  {
                    id: "kpi-governance",
                    label: "Comité transverse",
                    current: "1/mois",
                    target: "2/mois",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    challenges: [
      {
        id: "challenge-visibility",
        title: "Unifier la visibilité stock",
        description:
          "Les équipes magasin et e-commerce disposent de vues différentes et parfois contradictoires sur les niveaux de stocks.",
        status: "in_progress",
        impact: "high",
        owner: "Léo Dupont",
        relatedInsightIds: ["insight-stock-visibility", "insight-data-governance"],
        children: [
          {
            id: "challenge-data-stream",
            title: "Construire un flux de données temps réel",
            description:
              "Mettre en place une synchronisation continue entre WMS, ERP et plateforme e-commerce pour réduire l'écart de visibilité.",
            status: "exploring",
            impact: "critical",
            owner: "Samir Cohen",
            relatedInsightIds: [
              "insight-stock-visibility",
              "insight-inventory-sync",
              "insight-app-latency",
              "insight-data-governance",
            ],
            children: [
              {
                id: "challenge-training",
                title: "Former les équipes aux dashboards",
                description:
                  "Accompagner les managers magasin dans la lecture des nouveaux indicateurs temps réel.",
                status: "planned",
                impact: "medium",
                owner: "Fatou Ndiaye",
                relatedInsightIds: ["insight-dashboard-adoption"],
              },
            ],
          },
          {
            id: "challenge-order-promise",
            title: "Sécuriser la promesse de retrait",
            description:
              "Garantir qu'une commande promise en retrait magasin soit réellement disponible au moment choisi par le client.",
            status: "in_progress",
            impact: "high",
            owner: "Marc Petit",
            relatedInsightIds: ["insight-pickup-waiting", "insight-promised-date"],
          },
        ],
      },
      {
        id: "challenge-omnichannel",
        title: "Fluidifier le parcours omnicanal",
        description:
          "Créer une expérience sans rupture entre commande en ligne, retrait magasin et support client.",
        status: "in_progress",
        impact: "high",
        owner: "Julia Costa",
        relatedInsightIds: [
          "insight-pickup-waiting",
          "insight-promised-date",
          "insight-voice-assistant",
        ],
        children: [
          {
            id: "challenge-employee-adoption",
            title: "Favoriser l'adoption des outils collaborateurs",
            description:
              "Donner envie aux équipes de s'approprier les outils phygitaux en magasin pour mieux servir les clients.",
            status: "exploring",
            impact: "medium",
            owner: "Alice Martin",
            relatedInsightIds: ["insight-app-latency", "insight-dashboard-adoption"],
          },
        ],
      },
    ],
  };
}
