"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAskKey, isValidAskKey } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

/**
 * ASK Key Validation Test Page
 * Helps users debug ASK key format issues
 */
export default function TestKeyPage() {
  const [testKey, setTestKey] = useState("");
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    suggestion?: string;
  } | null>(null);

  const handleTestKey = () => {
    const result = validateAskKey(testKey);
    setValidationResult(result);
  };

  const generateTestUrl = () => {
    if (testKey.trim()) {
      const currentUrl = window.location.origin;
      return `${currentUrl}/?key=${encodeURIComponent(testKey.trim())}`;
    }
    return "";
  };

  const exampleKeys = [
    "test-key-123",
    "user_session_456",
    "abc123",
    "session.id.789",
    "ASK-2024-001",
    "very-long-key-name-that-should-work-fine-123456789",
    // Invalid examples
    "ab", // too short
    "key with spaces", // invalid characters
    "key@domain.com", // invalid characters
    "", // empty
    "---", // no alphanumeric
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-primary" />
              ASK Key Validation Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Use this page to test ASK key formats and debug validation issues.
              Enter an ASK key below to check if it meets the format requirements.
            </p>
          </CardContent>
        </Card>

        {/* Test Input */}
        <Card>
          <CardHeader>
            <CardTitle>Test Your ASK Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-key">ASK Key</Label>
              <div className="flex gap-2">
                <Input
                  id="test-key"
                  placeholder="Enter ASK key to test..."
                  value={testKey}
                  onChange={(e) => setTestKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestKey()}
                />
                <Button onClick={handleTestKey}>Test</Button>
              </div>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <Alert className={validationResult.isValid ? "border-green-500" : "border-destructive"}>
                <div className="flex items-center gap-2">
                  {validationResult.isValid ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <AlertDescription>
                    {validationResult.isValid ? (
                      <span className="text-green-600 font-medium">✓ Valid ASK key format</span>
                    ) : (
                      <div>
                        <span className="text-destructive font-medium">✗ {validationResult.error}</span>
                        {validationResult.suggestion && (
                          <div className="mt-1 text-muted-foreground text-sm">
                            {validationResult.suggestion}
                          </div>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {/* Generated URL */}
            {testKey.trim() && validationResult?.isValid && (
              <div className="space-y-2">
                <Label>Generated URL (for testing)</Label>
                <div className="p-3 bg-muted rounded-md">
                  <code className="text-sm break-all">
                    {generateTestUrl()}
                  </code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(generateTestUrl())}
                >
                  Copy URL
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Format Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>ASK Key Format Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">At least 3 characters long</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">Less than 100 characters</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">Contains only: letters, numbers, dots (.), dashes (-), underscores (_)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">Must contain at least one letter or number</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">No spaces or special characters (@, #, %, etc.)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Example Keys */}
        <Card>
          <CardHeader>
            <CardTitle>Example ASK Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exampleKeys.map((key, index) => {
                const isValid = isValidAskKey(key);
                return (
                  <div
                    key={index}
                    className={`p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 ${
                      isValid ? "border-green-500 bg-green-50/50" : "border-red-500 bg-red-50/50"
                    }`}
                    onClick={() => {
                      setTestKey(key);
                      setValidationResult(validateAskKey(key));
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {isValid ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <code className="text-sm">{key || '(empty)'}</code>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {isValid ? "Valid format" : "Invalid format"}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="text-center">
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
