/**
 * Security detection library for analyzing message content
 * Detects malicious patterns including SQL injection, XSS, spam, and excessive length
 */

export type DetectionType = 'injection' | 'xss' | 'spam' | 'length' | 'command_injection';

export type DetectionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityDetection {
  type: DetectionType;
  severity: DetectionSeverity;
  pattern: string;
  details: Record<string, unknown>;
}

export interface DetectionResult {
  hasThreats: boolean;
  detections: SecurityDetection[];
  maxSeverity: DetectionSeverity | null;
}

const MAX_MESSAGE_LENGTH = 10000;

/**
 * SQL Injection patterns
 */
const SQL_INJECTION_PATTERNS = [
  /union\s+select/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /insert\s+into/i,
  /update\s+set/i,
  /exec\s*\(/i,
  /execute\s*\(/i,
  /'\s*or\s*'1'\s*=\s*'1/i,
  /'\s*or\s*1\s*=\s*1/i,
  /'\s*or\s*'a'\s*=\s*'a/i,
];

/**
 * XSS patterns
 */
const XSS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /onload\s*=/i,
  /eval\s*\(/i,
  /alert\s*\(/i,
];

/**
 * Command injection patterns
 */
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`]/,
  /\$\(/,
  /<\s*\(/,
  />\s*\(/,
  /cat\s+\/etc\/passwd/i,
  /rm\s+-rf/i,
  /wget\s+/i,
  /curl\s+/i,
];

/**
 * Suspicious URL patterns
 */
const SUSPICIOUS_URL_PATTERNS = [
  /http[s]?:\/\/[^\s]+/i,
  /www\.[^\s]+/i,
  /bit\.ly/i,
  /tinyurl/i,
  /t\.co/i,
];

/**
 * Check for SQL injection patterns
 */
function detectSQLInjection(content: string): SecurityDetection | null {
  const contentLower = content.toLowerCase();
  
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(contentLower)) {
      return {
        type: 'injection',
        severity: 'critical',
        pattern: 'SQL injection pattern detected',
        details: {
          matched: 'SQL injection keywords',
          pattern: pattern.toString(),
        },
      };
    }
  }
  
  return null;
}

/**
 * Check for XSS patterns
 */
function detectXSS(content: string): SecurityDetection | null {
  const contentLower = content.toLowerCase();
  
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(contentLower)) {
      return {
        type: 'xss',
        severity: 'high',
        pattern: 'XSS pattern detected',
        details: {
          matched: 'XSS keywords',
          pattern: pattern.toString(),
        },
      };
    }
  }
  
  return null;
}

/**
 * Check for command injection patterns
 */
function detectCommandInjection(content: string): SecurityDetection | null {
  const contentLower = content.toLowerCase();
  
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(contentLower)) {
      return {
        type: 'command_injection',
        severity: 'high',
        pattern: 'Command injection pattern detected',
        details: {
          matched: 'Command injection keywords',
          pattern: pattern.toString(),
        },
      };
    }
  }
  
  return null;
}

/**
 * Check for excessive message length
 */
function detectExcessiveLength(content: string): SecurityDetection | null {
  const length = content.length;
  
  if (length > MAX_MESSAGE_LENGTH) {
    return {
      type: 'length',
      severity: 'medium',
      pattern: `Message length: ${length} characters (max: ${MAX_MESSAGE_LENGTH})`,
      details: {
        length,
        max_length: MAX_MESSAGE_LENGTH,
      },
    };
  }
  
  return null;
}

/**
 * Check for spam patterns
 */
function detectSpam(content: string): SecurityDetection[] {
  const detections: SecurityDetection[] = [];
  const contentLower = content.toLowerCase();
  const length = content.length;
  
  // Only check spam patterns for longer messages
  if (length <= 100) {
    return detections;
  }
  
  // Check for excessive character repetition
  if (/(.)\1{20,}/.test(contentLower)) {
    detections.push({
      type: 'spam',
      severity: 'low',
      pattern: 'Excessive character repetition',
      details: {
        matched: 'Repeated characters',
      },
    });
  }
  
  // Check for suspicious URLs
  const urlMatches: string[] = [];
  for (const pattern of SUSPICIOUS_URL_PATTERNS) {
    const matches = contentLower.match(new RegExp(pattern, 'gi'));
    if (matches) {
      urlMatches.push(...matches);
    }
  }
  
  if (urlMatches.length > 3) {
    detections.push({
      type: 'spam',
      severity: 'medium',
      pattern: `Multiple suspicious URLs detected: ${urlMatches.length}`,
      details: {
        url_count: urlMatches.length,
        urls: urlMatches.slice(0, 10), // Limit to first 10 for storage
      },
    });
  }
  
  return detections;
}

/**
 * Main function to detect malicious content
 * Returns all detected threats with their severity levels
 */
export function detectMaliciousContent(content: string): DetectionResult {
  const detections: SecurityDetection[] = [];
  
  // Check length first (quick check)
  const lengthDetection = detectExcessiveLength(content);
  if (lengthDetection) {
    detections.push(lengthDetection);
  }
  
  // Check SQL injection
  const sqlDetection = detectSQLInjection(content);
  if (sqlDetection) {
    detections.push(sqlDetection);
  }
  
  // Check XSS
  const xssDetection = detectXSS(content);
  if (xssDetection) {
    detections.push(xssDetection);
  }
  
  // Check command injection
  const cmdDetection = detectCommandInjection(content);
  if (cmdDetection) {
    detections.push(cmdDetection);
  }
  
  // Check spam patterns
  const spamDetections = detectSpam(content);
  detections.push(...spamDetections);
  
  // Determine max severity
  const severityOrder: DetectionSeverity[] = ['low', 'medium', 'high', 'critical'];
  let maxSeverity: DetectionSeverity | null = null;
  let maxSeverityIndex = -1;
  
  for (const detection of detections) {
    const severityIndex = severityOrder.indexOf(detection.severity);
    if (severityIndex > maxSeverityIndex) {
      maxSeverityIndex = severityIndex;
      maxSeverity = detection.severity;
    }
  }
  
  return {
    hasThreats: detections.length > 0,
    detections,
    maxSeverity,
  };
}

/**
 * Get the highest severity level from a list of detections
 */
export function getMaxSeverity(detections: SecurityDetection[]): DetectionSeverity | null {
  if (detections.length === 0) {
    return null;
  }
  
  const severityOrder: DetectionSeverity[] = ['low', 'medium', 'high', 'critical'];
  let maxSeverity: DetectionSeverity = 'low';
  let maxIndex = 0;
  
  for (const detection of detections) {
    const index = severityOrder.indexOf(detection.severity);
    if (index > maxIndex) {
      maxIndex = index;
      maxSeverity = detection.severity;
    }
  }
  
  return maxSeverity;
}

/**
 * Check if severity requires automatic quarantine
 */
export function shouldQuarantine(severity: DetectionSeverity | null): boolean {
  if (!severity) {
    return false;
  }
  
  return severity === 'high' || severity === 'critical';
}

