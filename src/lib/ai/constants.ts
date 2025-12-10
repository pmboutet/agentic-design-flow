import type { PromptVariableDefinition } from "@/types";

/**
 * Variables disponibles pour les templates Handlebars des agents IA
 * 
 * Ces variables peuvent être utilisées dans les prompts avec la syntaxe {{variable}}
 * Elles sont automatiquement compilées dans les prompts via Handlebars avant envoi au LLM
 * 
 * Helpers Handlebars disponibles:
 * - {{#if variable}}...{{/if}} - Condition
 * - {{#each array}}...{{/each}} - Boucle
 * - {{#unless variable}}...{{/unless}} - Condition inverse
 * - {{default value "fallback"}} - Valeur par défaut
 * - {{length array}} - Longueur d'un tableau
 * - {{formatDate date}} - Formater une date ISO
 */
export const PROMPT_VARIABLES: PromptVariableDefinition[] = [
  // Session ASK
  {
    key: "ask_key",
    label: "Clé ASK",
    description: "Identifiant unique de la session ASK en cours",
    example: "ask-2024-onboarding",
    type: "string",
    category: "session",
  },
  {
    key: "ask_question",
    label: "Question de l'ASK",
    description: "Texte principal de la question posée aux participants",
    example: "Comment améliorer notre processus d'onboarding?",
    type: "string",
    category: "session",
  },
  {
    key: "ask_description",
    label: "Description de l'ASK",
    description: "Contexte additionnel associé à la session ASK",
    example: "Session de brainstorming pour identifier les points de friction",
    type: "string",
    category: "session",
  },
  
  // System Prompts (contexte)
  {
    key: "system_prompt_project",
    label: "System Prompt Projet",
    description: "Prompt spécifique au projet, défini dans la configuration du projet",
    example: "Ce projet vise à transformer notre expérience utilisateur",
    type: "string",
    category: "context",
  },
  {
    key: "system_prompt_challenge",
    label: "System Prompt Challenge",
    description: "Prompt spécifique au challenge rattaché à l'ASK",
    example: "Challenge: Optimiser le temps d'onboarding de 30%",
    type: "string",
    category: "context",
  },
  {
    key: "system_prompt_ask",
    label: "System Prompt ASK",
    description: "Prompt spécifique à la session ASK en cours",
    example: "Concentrez-vous sur les idées innovantes et réalisables",
    type: "string",
    category: "context",
  },
  
  // Messages et conversation
  {
    key: "message_history",
    label: "Historique des messages",
    description: "Historique complet des échanges au format texte prêt à être injecté",
    example: "User: Bonjour\nAgent: Comment puis-je vous aider?",
    type: "string",
    category: "conversation",
  },
  {
    key: "messages_json",
    label: "Messages (JSON)",
    description: "Historique des messages au format JSON pour utilisation avec {{#each}} et {{jsonParse}}",
    example: '[{"role":"user","content":"Bonjour"}]',
    type: "string",
    category: "conversation",
  },
  {
    key: "latest_user_message",
    label: "Dernier message utilisateur",
    description: "Contenu du dernier message envoyé par l'utilisateur",
    example: "Je pense qu'on devrait simplifier l'interface",
    type: "string",
    category: "conversation",
  },
  {
    key: "latest_ai_response",
    label: "Dernière réponse IA",
    description: "Contenu généré par l'agent IA lors du dernier appel",
    example: "Excellente suggestion! Pouvez-vous préciser quels éléments simplifier?",
    type: "string",
    category: "conversation",
  },
  {
    key: "conversation_plan",
    label: "Plan de conversation",
    description: "Plan structuré de la conversation avec les étapes, leur statut et objectifs",
    example: "Plan de conversation (5 étapes) :\n\n1. ▶️ Contexte et situation actuelle (step_1)\n   Objectif: Comprendre le contexte actuel...",
    type: "string",
    category: "conversation",
  },
  {
    key: "current_step",
    label: "Étape courante",
    description: "Détails de l'étape active dans le plan de conversation",
    example: "Étape courante: Contexte et situation actuelle (step_1)\nObjectif: Comprendre le contexte actuel\nStatut: active",
    type: "string",
    category: "conversation",
  },
  {
    key: "current_step_id",
    label: "ID de l'étape courante",
    description: "Identifiant unique de l'étape active dans le plan (utilisé pour marquer la fin d'étape avec STEP_COMPLETE:<ID>)",
    example: "step_1",
    type: "string",
    category: "conversation",
  },
  {
    key: "completed_steps_summary",
    label: "Résumés des étapes complétées",
    description: "Liste des étapes complétées avec leurs résumés générés par IA",
    example: "Étapes complétées (2/5) :\n\n1. ✅ Contexte (step_1)\n   Résumé: L'équipe a partagé le contexte du projet...\n\n2. ✅ Défis (step_2)\n   Résumé: 3 défis majeurs identifiés...",
    type: "string",
    category: "conversation",
  },
  {
    key: "plan_progress",
    label: "Progression du plan",
    description: "Progression du plan en pourcentage et nombre d'étapes",
    example: "Progression du plan: 2/5 étapes (40%)",
    type: "string",
    category: "conversation",
  },
  {
    key: "step_messages",
    label: "Messages du step courant",
    description: "Uniquement les messages de l'étape en cours (filtrés par plan_step_id), format texte formaté",
    example: "[15/01/2024 10:30:00] Participant:\nJe pense que...\n\n---\n\n[15/01/2024 10:31:00] Agent:\nMerci pour ce point...",
    type: "string",
    category: "conversation",
  },
  {
    key: "step_messages_json",
    label: "Messages du step courant (JSON)",
    description: "Uniquement les messages de l'étape en cours au format JSON, utilisable avec {{#each}} et {{jsonParse}}",
    example: '[{"id":"msg1","senderType":"user","senderName":"Alice","content":"Mon idée...","timestamp":"2024-01-15T10:30:00Z"}]',
    type: "string",
    category: "conversation",
  },

  // Participants
  {
    key: "participant_name",
    label: "Nom du participant",
    description: "Nom du participant qui vient d'envoyer le message",
    example: "Alice Martin",
    type: "string",
    category: "participants",
  },
  {
    key: "participant_description",
    label: "Description du participant",
    description: "Description/bio du participant qui vient d'envoyer le message (depuis son profil utilisateur)",
    example: "Product Manager avec 5 ans d'expérience dans la transformation digitale",
    type: "string",
    category: "participants",
  },
  {
    key: "participant_details",
    label: "Détails complets du participant",
    description: "Informations complètes du participant (nom, rôle, description) formatées sur plusieurs lignes",
    example: "Nom: Alice Martin\nRôle: Product Manager\nDescription: 5 ans d'expérience en transformation digitale",
    type: "string",
    category: "participants",
  },
  {
    key: "participants",
    label: "Participants (texte)",
    description: "Participants sérialisés au format texte (obsolète, préférer participants_list)",
    example: "Alice Martin (Manager), Bob Dupont (Developer)",
    type: "string",
    category: "participants",
  },
  {
    key: "participants_list",
    label: "Participants (array)",
    description: "Tableau d'objets {name, role} pour itération avec {{#each}}",
    example: '[{"name":"Alice","role":"Manager"}]',
    type: "array",
    category: "participants",
  },
  
  // Insights et données
  {
    key: "existing_insights_json",
    label: "Insights existants (JSON)",
    description: "Insights déjà enregistrés au format JSON, utilisable avec {{jsonParse}}",
    example: '[{"type":"pain","description":"Processus trop long"}]',
    type: "string",
    category: "insights",
  },
  {
    key: "insights_json",
    label: "Insights bruts (JSON)",
    description: "Données d'insights pour les agents de génération/construction",
    type: "string",
    category: "insights",
  },
  {
    key: "insight_types",
    label: "Types d'insights",
    description: "Liste des types d'insights disponibles pour la détection",
    example: "pain,idea,solution,question",
    type: "string",
    category: "insights",
  },
  
  // Projet et Challenge (pour générateurs)
  {
    key: "project_name",
    label: "Nom du projet",
    description: "Nom du projet en cours",
    example: "Transformation Digitale 2024",
    type: "string",
    category: "project",
  },
  {
    key: "project_goal",
    label: "Objectif du projet",
    description: "Objectif principal du projet",
    type: "string",
    category: "project",
  },
  {
    key: "project_status",
    label: "Statut du projet",
    description: "Statut actuel du projet",
    example: "in_progress",
    type: "string",
    category: "project",
  },
  {
    key: "challenge_id",
    label: "ID du challenge",
    description: "Identifiant unique du challenge",
    type: "string",
    category: "challenge",
  },
  {
    key: "challenge_title",
    label: "Titre du challenge",
    description: "Titre du challenge en cours",
    example: "Améliorer l'onboarding",
    type: "string",
    category: "challenge",
  },
  {
    key: "challenge_description",
    label: "Description du challenge",
    description: "Description détaillée du challenge",
    type: "string",
    category: "challenge",
  },
  {
    key: "challenge_status",
    label: "Statut du challenge",
    description: "Statut actuel du challenge",
    example: "active",
    type: "string",
    category: "challenge",
  },
  {
    key: "challenge_impact",
    label: "Impact du challenge",
    description: "Impact attendu ou mesuré du challenge",
    type: "string",
    category: "challenge",
  },
  {
    key: "challenge_context_json",
    label: "Contexte du challenge (JSON)",
    description: "Données de contexte du challenge au format JSON",
    type: "string",
    category: "challenge",
  },
  {
    key: "existing_asks_json",
    label: "ASKs existants (JSON)",
    description: "Liste des ASKs déjà créés pour le challenge",
    type: "string",
    category: "challenge",
  },
  {
    key: "current_date",
    label: "Date actuelle",
    description: "Date/heure actuelle au format ISO",
    example: "2024-01-15T10:30:00Z",
    type: "string",
    category: "utility",
  },
];

/**
 * Helpers Handlebars disponibles dans les templates
 */
export const HANDLEBARS_HELPERS_DOC = [
  {
    name: "if",
    syntax: "{{#if variable}}...{{/if}}",
    description: "Affiche le contenu si la variable est truthy (non vide, non null, non false)",
    example: "{{#if ask_description}}Description: {{ask_description}}{{/if}}",
  },
  {
    name: "else",
    syntax: "{{#if variable}}...{{else}}...{{/if}}",
    description: "Affiche un contenu alternatif si la condition est false",
    example: "{{#if participant_name}}Bonjour {{participant_name}}{{else}}Bonjour participant{{/if}}",
  },
  {
    name: "unless",
    syntax: "{{#unless variable}}...{{/unless}}",
    description: "Affiche le contenu si la variable est falsy (inverse de if)",
    example: "{{#unless participants}}Aucun participant{{/unless}}",
  },
  {
    name: "each",
    syntax: "{{#each array}}...{{/each}}",
    description: "Itère sur un tableau. Utilisez {{this}} pour l'élément courant",
    example: "{{#each participants_list}}- {{name}} ({{role}})\\n{{/each}}",
  },
  {
    name: "default",
    syntax: "{{default value \"fallback\"}}",
    description: "Retourne la valeur ou un fallback si vide",
    example: "Status: {{default challenge_status \"Non défini\"}}",
  },
  {
    name: "length",
    syntax: "{{length array}}",
    description: "Retourne la longueur d'un tableau ou d'une chaîne",
    example: "Nombre de participants: {{length participants_list}}",
  },
  {
    name: "notEmpty",
    syntax: "{{#if (notEmpty array)}}...{{/if}}",
    description: "Vérifie si un tableau/chaîne n'est pas vide",
    example: "{{#if (notEmpty participants_list)}}Il y a des participants{{/if}}",
  },
  {
    name: "jsonParse",
    syntax: "{{#with (jsonParse json_string)}}...{{/with}}",
    description: "Parse une chaîne JSON en objet pour manipulation",
    example: "{{#with (jsonParse messages_json)}}{{#each this}}{{content}}{{/each}}{{/with}}",
  },
  {
    name: "formatDate",
    syntax: "{{formatDate iso_date}}",
    description: "Formate une date ISO en format lisible",
    example: "Date: {{formatDate current_date}}",
  },
  {
    name: "truncate",
    syntax: "{{truncate string 100}}",
    description: "Tronque une chaîne à N caractères + '...'",
    example: "{{truncate description 150}}",
  },
  {
    name: "recentMessages",
    syntax: "{{recentMessages count}} ou {{recentMessages count format=\"json\"}}",
    description: "Retourne les N derniers messages de la conversation. Format 'text' (défaut) ou 'json'",
    example: "{{recentMessages 10}}\n{{recentMessages 5 format=\"json\"}}",
  },
];

export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
