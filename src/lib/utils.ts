import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for proper overrides
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format time remaining until a given date
 * Returns a human-readable string showing time left
 */
export function formatTimeRemaining(endDate: string): string {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) {
    return "Expired";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  } else if (minutes > 0) {
    return `${minutes}m remaining`;
  } else {
    return "Less than 1m remaining";
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Generate a unique ID for use in components
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Validate if a string is a valid ASK key format
 * Updated to be more flexible with different key formats
 */
export function isValidAskKey(key: string): boolean {
  // Remove whitespace
  const trimmedKey = key.trim();
  
  // Must not be empty
  if (!trimmedKey) {
    return false;
  }
  
  // Must be at least 3 characters (more flexible than before)
  if (trimmedKey.length < 3) {
    return false;
  }
  
  // Allow alphanumeric, dashes, underscores, and periods (common in IDs)
  // This is more flexible to accommodate different backend ID formats
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  
  if (!validPattern.test(trimmedKey)) {
    return false;
  }
  
  // Additional checks: should not be all special characters
  const hasAlphanumeric = /[a-zA-Z0-9]/.test(trimmedKey);
  if (!hasAlphanumeric) {
    return false;
  }
  
  return true;
}

/**
 * Parse error messages for user-friendly display
 */
export function parseErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  
  return "An unexpected error occurred";
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Check if ASK is still active based on end date
 */
export function isAskActive(endDate: string): boolean {
  return new Date(endDate).getTime() > Date.now();
}

/**
 * Validate file type for uploads
 */
export function validateFileType(file: File): { 
  isValid: boolean; 
  type: 'audio' | 'image' | 'document' | null;
  error?: string;
} {
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];
  const documentTypes = ['application/pdf', 'text/plain', 'application/msword', 
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  if (imageTypes.includes(file.type)) {
    return { isValid: true, type: 'image' };
  }
  
  if (audioTypes.includes(file.type)) {
    return { isValid: true, type: 'audio' };
  }
  
  if (documentTypes.includes(file.type)) {
    return { isValid: true, type: 'document' };
  }

  return { 
    isValid: false, 
    type: null, 
    error: 'File type not supported. Please upload images, audio files, or documents.' 
  };
}

/**
 * Create a safe JSON parser that handles potential errors
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

/**
 * Deep clone an object safely
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * Enhanced ASK key validation with detailed error messages
 */
export function validateAskKey(key: string): {
  isValid: boolean;
  error?: string;
  suggestion?: string;
} {
  const trimmedKey = key.trim();
  
  if (!trimmedKey) {
    return { 
      isValid: false, 
      error: 'ASK key cannot be empty', 
      suggestion: 'Please provide a valid ASK key in the URL parameter' 
    };
  }
  
  if (trimmedKey.length < 3) {
    return { 
      isValid: false, 
      error: 'ASK key is too short', 
      suggestion: 'ASK key must be at least 3 characters long' 
    };
  }
  
  if (trimmedKey.length > 100) {
    return { 
      isValid: false, 
      error: 'ASK key is too long', 
      suggestion: 'ASK key must be less than 100 characters' 
    };
  }
  
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(trimmedKey)) {
    return { 
      isValid: false, 
      error: 'ASK key contains invalid characters', 
      suggestion: 'ASK key can only contain letters, numbers, dots, dashes, and underscores' 
    };
  }
  
  const hasAlphanumeric = /[a-zA-Z0-9]/.test(trimmedKey);
  if (!hasAlphanumeric) {
    return { 
      isValid: false, 
      error: 'ASK key must contain at least one letter or number', 
      suggestion: 'Please check your ASK key format' 
    };
  }

  return { isValid: true };
}

export function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return date.toLocaleDateString();
  }
  if (days >= 1) {
    return `${days} j`;
  }
  if (hours >= 1) {
    return `${hours} h`;
  }
  if (minutes >= 1) {
    return `${minutes} min`;
  }
  return "à l'instant";
}

export function getInsightTypeLabel(type: string): string {
  switch (type) {
    case "pain":
      return "Pain";
    case "gain":
      return "Gain";
    case "opportunity":
      return "Opportunité";
    case "risk":
      return "Risque";
    case "signal":
      return "Signal";
    case "idea":
      return "Idée";
    default:
      return type;
  }
}

export function getDeliveryModeLabel(mode: string | undefined): string {
  if (mode === "physical") {
    return "Session physique";
  }
  if (mode === "digital") {
    return "Session digitale";
  }
  return "Mode hybride";
}

export function getConversationModeDescription(conversationMode: string | undefined): string {
  switch (conversationMode) {
    case 'individual_parallel':
      return 'Réponses individuelles en parallèle';
    case 'collaborative':
      return 'Conversation collaborative';
    case 'group_reporter':
      return 'Groupe avec porte-parole';
    default:
      return 'Conversation collaborative';
  }
}

/**
 * Check if an error is a permission denied error from Supabase
 */
export function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  // Check for PostgrestError with code PGRST301 (permission denied)
  if ("code" in error && error.code === "PGRST301") {
    return true;
  }

  // Check for message containing permission denied
  if ("message" in error && typeof error.message === "string") {
    const message = error.message.toLowerCase();
    return (
      message.includes("permission denied") ||
      message.includes("new row violates row-level security policy") ||
      message.includes("row-level security policy violation")
    );
  }

  return false;
}
