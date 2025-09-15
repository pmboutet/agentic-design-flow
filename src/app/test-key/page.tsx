"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateAskKey, isValidAskKey } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, Sparkles, Copy, ArrowLeft } from "lucide-react";

/**
 * Beautiful ASK Key Validation Test Page
 * Helps users debug ASK key format issues with glassmorphic design
 */
export default function TestKeyPage() {
  const [testKey, setTestKey] = useState("");
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    suggestion?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const exampleKeys = [
    { key: "test-key-123", valid: true, desc: "Standard format" },
    { key: "user_session_456", valid: true, desc: "With underscores" },
    { key: "session.id.789", valid: true, desc: "With dots" },
    { key: "ASK-2024-001", valid: true, desc: "Year-based ID" },
    { key: "very-long-key-name-that-works-fine-123456", valid: true, desc: "Long descriptive" },
    // Invalid examples
    { key: "ab", valid: false, desc: "Too short" },
    { key: "key with spaces", valid: false, desc: "Contains spaces" },
    { key: "key@domain.com", valid: false, desc: "Invalid characters" },
    { key: "", valid: false, desc: "Empty string" },
    { key: "---", valid: false, desc: "No alphanumeric" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <Button
            variant="ghost"
            onClick={() => window.location.href = '/'}
            className="absolute top-6 left-6 neumorphic-shadow border-0"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-xl"
          >
            <AlertCircle className="h-10 w-10 text-white" />
          </motion.div>
          
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              ASK Key Validator
            </h1>
            <p className="text-lg text-muted-foreground mt-2">
              Test and debug your ASK key formats with our beautiful validator
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Test Input Section */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Card className="glass-card border-0 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  Test Your ASK Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="test-key" className="text-sm font-medium">
                    Enter ASK Key to Validate
                  </Label>
                  <div className="relative">
                    <Input
                      id="test-key"
                      placeholder="e.g., test-key-123"
                      value={testKey}
                      onChange={(e) => setTestKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleTestKey()}
                      className="form-input pr-12"
                    />
                    <Button
                      onClick={handleTestKey}
                      disabled={!testKey.trim()}
                      className="absolute right-1 top-1 h-8 btn-primary"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Validation Result */}
                {validationResult && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Alert className={`border-0 ${validationResult.isValid 
                      ? "bg-gradient-to-r from-green-50 to-emerald-50 neumorphic-shadow" 
                      : "bg-gradient-to-r from-red-50 to-rose-50 neumorphic-shadow"
                    }`}>
                      <div className="flex items-center gap-3">
                        {validationResult.isValid ? (
                          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-white" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-red-400 to-rose-500 rounded-full flex items-center justify-center">
                            <XCircle className="h-5 w-5 text-white" />
                          </div>
                        )}
                        <AlertDescription className="flex-1">
                          {validationResult.isValid ? (
                            <div>
                              <span className="font-semibold text-green-700">✓ Valid ASK key format!</span>
                              <p className="text-sm text-green-600 mt-1">
                                This key meets all format requirements and can be used safely.
                              </p>
                            </div>
                          ) : (
                            <div>
                              <span className="font-semibold text-red-700">✗ {validationResult.error}</span>
                              {validationResult.suggestion && (
                                <p className="text-sm text-red-600 mt-1">
                                  💡 {validationResult.suggestion}
                                </p>
                              )}
                            </div>
                          )}
                        </AlertDescription>
                      </div>
                    </Alert>
                  </motion.div>
                )}

                {/* Generated URL */}
                {testKey.trim() && validationResult?.isValid && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                  >
                    <Label className="text-sm font-medium">Generated Test URL</Label>
                    <div className="neumorphic-shadow p-4 rounded-lg bg-white/50 space-y-3">
                      <code className="text-sm break-all block bg-white/70 p-3 rounded border">
                        {generateTestUrl()}
                      </code>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(generateTestUrl())}
                          className="neumorphic-raised border-0 flex-1"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          {copied ? 'Copied!' : 'Copy URL'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => window.open(generateTestUrl() + '&mode=test', '_blank')}
                          className="btn-primary flex-1"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Test Now
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Format Requirements */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card className="glass-card border-0 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                  Format Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    { icon: CheckCircle, text: "At least 3 characters long", valid: true },
                    { icon: CheckCircle, text: "Less than 100 characters", valid: true },
                    { icon: CheckCircle, text: "Letters, numbers, dots (.), dashes (-), underscores (_)", valid: true },
                    { icon: CheckCircle, text: "Must contain at least one letter or number", valid: true },
                    { icon: XCircle, text: "No spaces or special characters (@, #, %, etc.)", valid: false },
                  ].map((req, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-3 p-3 neumorphic-shadow rounded-lg bg-white/30"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        req.valid 
                          ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                          : 'bg-gradient-to-br from-red-400 to-rose-500'
                      }`}>
                        <req.icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm text-foreground">{req.text}</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Example Keys Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                Example ASK Keys
                <span className="text-sm text-muted-foreground font-normal">
                  Click any example to test it
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exampleKeys.map((example, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`p-4 rounded-xl cursor-pointer transition-all duration-300 ${
                      example.valid 
                        ? "neumorphic-shadow bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100" 
                        : "neumorphic-shadow bg-gradient-to-br from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100"
                    }`}
                    onClick={() => {
                      setTestKey(example.key);
                      setValidationResult(validateAskKey(example.key));
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        example.valid 
                          ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                          : 'bg-gradient-to-br from-red-400 to-rose-500'
                      }`}>
                        {example.valid ? (
                          <CheckCircle className="h-4 w-4 text-white" />
                        ) : (
                          <XCircle className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <code className="text-sm font-mono block truncate">
                          {example.key || '(empty)'}
                        </code>
                        <p className="text-xs text-muted-foreground mt-1">
                          {example.desc}
                        </p>
                        <span className={`text-xs font-medium ${
                          example.valid ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {example.valid ? 'Valid' : 'Invalid'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center space-y-4"
        >
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setTestKey("test-key-123");
                setValidationResult(validateAskKey("test-key-123"));
              }}
              className="neumorphic-raised border-0"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Try Valid Example
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                setTestKey("invalid key");
                setValidationResult(validateAskKey("invalid key"));
              }}
              className="neumorphic-raised border-0"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Try Invalid Example
            </Button>
            
            <Button
              onClick={() => window.location.href = '/'}
              className="btn-primary"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Main App
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Need help? Check the format requirements above or try our examples.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
