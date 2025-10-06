import type { PromptVariableDefinition } from "@/types";

export const PROMPT_VARIABLES: PromptVariableDefinition[] = [
  {
    key: "ask_key",
    label: "Clé ASK",
    description: "Identifiant unique de la session ASK en cours.",
    example: "ask-2024-onboarding",
  },
  {
    key: "ask_question",
    label: "Question de l'ASK",
    description: "Texte principal de la question posée aux participants.",
  },
  {
    key: "ask_description",
    label: "Description de l'ASK",
    description: "Contexte additionnel associé à la session ASK.",
  },
  {
    key: "system_prompt_project",
    label: "System Prompt Projet",
    description: "Prompt spécifique au projet, défini dans la configuration du projet.",
  },
  {
    key: "system_prompt_challenge",
    label: "System Prompt Challenge",
    description: "Prompt spécifique au challenge rattaché à l'ASK.",
  },
  {
    key: "system_prompt_ask",
    label: "System Prompt ASK",
    description: "Prompt spécifique à la session ASK en cours.",
  },
  {
    key: "message_history",
    label: "Historique des messages",
    description: "Historique complet des échanges au format texte prêt à être injecté dans le modèle.",
  },
  {
    key: "latest_user_message",
    label: "Dernier message utilisateur",
    description: "Contenu du dernier message envoyé par l'utilisateur ayant déclenché l'appel à l'IA.",
  },
  {
    key: "latest_ai_response",
    label: "Dernière réponse IA",
    description: "Contenu généré par l'agent IA lors du dernier appel.",
  },
  {
    key: "participant_name",
    label: "Nom du participant",
    description: "Nom affiché du participant qui vient d'envoyer le message.",
  },
  {
    key: "participants",
    label: "Liste des participants",
    description: "Participants connus de la session, sérialisés au format lisible.",
  },
  {
    key: "existing_insights_json",
    label: "Insights existants (JSON)",
    description: "Sérialisation JSON complète des insights déjà enregistrés pour la session, incluant leurs identifiants.",
  },
];

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
