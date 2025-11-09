"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, ShieldAlert, ShieldCheck, ShieldOff, Filter, X, CheckCircle2, XCircle } from "lucide-react";
import type { ApiResponse } from "@/types";

interface SecurityDetection {
  id: string;
  messageId: string;
  profileId: string | null;
  detectionType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  matchedPatterns: Record<string, unknown>;
  status: 'pending' | 'reviewed' | 'resolved' | 'false_positive';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface QuarantinedProfile {
  id: string;
  email: string;
  fullName?: string | null;
  isQuarantined: boolean;
  quarantinedAt?: string | null;
  quarantinedReason?: string | null;
}

export function SecurityPanel() {
  const [detections, setDetections] = useState<SecurityDetection[]>([]);
  const [quarantinedProfiles, setQuarantinedProfiles] = useState<QuarantinedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detections' | 'quarantined'>('detections');

  // Filters for detections
  const [detectionTypeFilter, setDetectionTypeFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [activeTab, detectionTypeFilter, severityFilter, statusFilter]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (activeTab === 'detections') {
        await loadDetections();
      } else {
        await loadQuarantinedProfiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetections = async () => {
    const params = new URLSearchParams();
    if (detectionTypeFilter) params.set('detectionType', detectionTypeFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', '50');

    const response = await fetch(`/api/admin/security/detections?${params.toString()}`);
    const data: ApiResponse<{ detections: SecurityDetection[]; total: number }> = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load detections');
    }

    setDetections(data.data?.detections ?? []);
  };

  const loadQuarantinedProfiles = async () => {
    const response = await fetch('/api/admin/security/quarantined-profiles?limit=50');
    const data: ApiResponse<{ profiles: QuarantinedProfile[]; total: number }> = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load quarantined profiles');
    }

    setQuarantinedProfiles(data.data?.profiles ?? []);
  };

  const handleQuarantine = async (profileId: string, reason: string) => {
    try {
      const response = await fetch(`/api/admin/security/profiles/${profileId}/quarantine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to quarantine profile');
      }

      await loadQuarantinedProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to quarantine profile');
    }
  };

  const handleRelease = async (profileId: string) => {
    try {
      const response = await fetch(`/api/admin/security/profiles/${profileId}/release`, {
        method: 'POST',
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to release profile');
      }

      await loadQuarantinedProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release profile');
    }
  };

  const handleReviewDetection = async (detectionId: string, status: 'reviewed' | 'resolved' | 'false_positive') => {
    try {
      const response = await fetch(`/api/admin/security/detections/${detectionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to review detection');
      }

      await loadDetections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review detection');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ShieldAlert className="w-4 h-4" />;
      case 'high': return <ShieldOff className="w-4 h-4" />;
      case 'medium': return <Shield className="w-4 h-4" />;
      case 'low': return <ShieldCheck className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('detections')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'detections'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Detections ({detections.length})
          </button>
          <button
            onClick={() => setActiveTab('quarantined')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'quarantined'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Quarantined ({quarantinedProfiles.length})
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : activeTab === 'detections' ? (
          <>
            {/* Filters */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="detection-type">Detection Type</Label>
                <select
                  id="detection-type"
                  value={detectionTypeFilter}
                  onChange={(e) => setDetectionTypeFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
                >
                  <option value="">All</option>
                  <option value="injection">Injection</option>
                  <option value="xss">XSS</option>
                  <option value="spam">Spam</option>
                  <option value="length">Length</option>
                  <option value="command_injection">Command Injection</option>
                </select>
              </div>
              <div>
                <Label htmlFor="severity">Severity</Label>
                <select
                  id="severity"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
                >
                  <option value="">All</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="resolved">Resolved</option>
                  <option value="false_positive">False Positive</option>
                </select>
              </div>
            </div>

            {/* Detections List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {detections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No detections found</p>
              ) : (
                detections.map((detection) => (
                  <div
                    key={detection.id}
                    className="neumorphic-shadow p-4 rounded-lg bg-white/60 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${getSeverityColor(detection.severity)}`}>
                          {getSeverityIcon(detection.severity)}
                          {detection.severity}
                        </span>
                        <span className="text-xs text-muted-foreground">{detection.detectionType}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          detection.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          detection.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                          detection.status === 'resolved' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {detection.status}
                        </span>
                      </div>
                      {detection.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReviewDetection(detection.id, 'reviewed')}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReviewDetection(detection.id, 'false_positive')}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            False Positive
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Message ID: {detection.messageId.substring(0, 8)}...
                    </p>
                    {detection.reviewedAt && (
                      <p className="text-xs text-muted-foreground">
                        Reviewed: {new Date(detection.reviewedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Quarantined Profiles List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {quarantinedProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No quarantined profiles</p>
              ) : (
                quarantinedProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="neumorphic-shadow p-4 rounded-lg bg-white/60 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{profile.fullName || profile.email}</p>
                        <p className="text-sm text-muted-foreground">{profile.email}</p>
                        {profile.quarantinedReason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Reason: {profile.quarantinedReason}
                          </p>
                        )}
                        {profile.quarantinedAt && (
                          <p className="text-xs text-muted-foreground">
                            Quarantined: {new Date(profile.quarantinedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRelease(profile.id)}
                      >
                        <ShieldCheck className="w-4 h-4 mr-1" />
                        Release
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

