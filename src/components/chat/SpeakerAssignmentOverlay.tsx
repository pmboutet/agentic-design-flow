"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Participant option for the dropdown
 */
export interface ParticipantOption {
  id: string;
  userId: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
}

/**
 * Props for the SpeakerAssignmentOverlay component
 */
export interface SpeakerAssignmentOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** The speaker identifier (S1, S2, etc.) detected by diarization */
  speaker: string;
  /** The order in which this speaker was detected (1 = first, 2 = second, etc.) */
  speakerOrder: number;
  /** List of available participants from the ASK session */
  participants: ParticipantOption[];
  /** List of speaker IDs that are already assigned to a participant */
  assignedSpeakers: string[];
  /** Callback when the user confirms assignment */
  onConfirm: (decision: SpeakerAssignmentDecision) => void;
  /** Callback when the user closes/cancels the overlay (receives the speaker being closed) */
  onClose: (speaker: string) => void;
}

/**
 * Decision returned when the user confirms the speaker assignment
 */
export interface SpeakerAssignmentDecision {
  /** The speaker identifier (S1, S2, etc.) */
  speaker: string;
  /** Whether to transcribe this speaker's audio */
  shouldTranscribe: boolean;
  /** Selected participant (null if creating a new guest) */
  selectedParticipant: ParticipantOption | null;
  /** New guest data (only if "Autre" is selected) */
  newGuest?: {
    firstName: string;
    lastName: string;
  };
}

/**
 * Overlay component for assigning newly detected speakers to participants
 *
 * This component appears when a new speaker is detected in consultant mode,
 * allowing the user to:
 * 1. Choose to transcribe or ignore the speaker
 * 2. Assign the speaker to an existing participant
 * 3. Create a new guest participant if "Autre" is selected
 */
export function SpeakerAssignmentOverlay({
  isOpen,
  speaker,
  speakerOrder,
  participants,
  assignedSpeakers,
  onConfirm,
  onClose,
}: SpeakerAssignmentOverlayProps) {
  // State for the form
  const [shouldTranscribe, setShouldTranscribe] = useState(true);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | 'other' | ''>('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filter out participants that are already assigned to a speaker
  const availableParticipants = useMemo(() => {
    // For now, show all participants - we could filter by already-assigned later
    return participants;
  }, [participants]);

  // Check if "Autre" (other/guest) is selected
  const isGuestSelected = selectedParticipantId === 'other';

  // Get the selected participant object
  const selectedParticipant = useMemo(() => {
    if (!selectedParticipantId || selectedParticipantId === 'other') return null;
    return participants.find(p => p.id === selectedParticipantId) || null;
  }, [selectedParticipantId, participants]);

  // Validate the form
  const isValid = useMemo(() => {
    if (!shouldTranscribe) return true; // Can submit if ignoring
    if (!selectedParticipantId) return false; // Must select something
    if (isGuestSelected) {
      return guestFirstName.trim().length > 0 && guestLastName.trim().length > 0;
    }
    return true;
  }, [shouldTranscribe, selectedParticipantId, isGuestSelected, guestFirstName, guestLastName]);

  // Handle form submission
  const handleConfirm = () => {
    const decision: SpeakerAssignmentDecision = {
      speaker,
      shouldTranscribe,
      selectedParticipant: shouldTranscribe ? selectedParticipant : null,
      newGuest: shouldTranscribe && isGuestSelected ? {
        firstName: guestFirstName.trim(),
        lastName: guestLastName.trim(),
      } : undefined,
    };
    onConfirm(decision);
  };

  // Get display text for the dropdown
  const getDropdownDisplayText = () => {
    if (!selectedParticipantId) return 'Choisir un participant...';
    if (isGuestSelected) return 'Autre (invit)';
    return selectedParticipant?.name || 'Choisir un participant...';
  };

  // Get speaker display name with explicit order (1er utilisateur, 2ème utilisateur)
  const speakerDisplayName = useMemo(() => {
    if (speakerOrder === 1) return '1er utilisateur à parler';
    if (speakerOrder === 2) return '2ème utilisateur à parler';
    return `${speakerOrder}ème utilisateur à parler`;
  }, [speakerOrder]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-xl font-semibold">
                New participant detected
              </h2>
              <button
                onClick={() => onClose(speaker)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Speaker info */}
            <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <p className="text-white font-medium">{speakerDisplayName}</p>
                <p className="text-white/60 text-sm">Detected by voice recognition</p>
              </div>
            </div>

            {/* Transcribe/Ignore Toggle */}
            <div className="mb-6">
              <label className="text-white/70 text-sm block mb-3">Action</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShouldTranscribe(true)}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-xl font-medium transition-all",
                    shouldTranscribe
                      ? "bg-blue-500/30 text-blue-100 border-2 border-blue-400/50"
                      : "bg-white/5 text-white/70 border-2 border-transparent hover:bg-white/10"
                  )}
                >
                  Transcribe
                </button>
                <button
                  onClick={() => setShouldTranscribe(false)}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-xl font-medium transition-all",
                    !shouldTranscribe
                      ? "bg-slate-500/30 text-slate-100 border-2 border-slate-400/50"
                      : "bg-white/5 text-white/70 border-2 border-transparent hover:bg-white/10"
                  )}
                >
                  Ignore
                </button>
              </div>
            </div>

            {/* Participant Selection (only shown if transcribing) */}
            <AnimatePresence>
              {shouldTranscribe && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-6 relative z-20">
                    <label className="text-white/70 text-sm block mb-3">Assign to participant</label>

                    {/* Custom Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={cn(
                          "w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20",
                          "text-white text-left flex items-center justify-between",
                          "hover:bg-white/15 transition-colors",
                          isDropdownOpen && "ring-2 ring-blue-400/50"
                        )}
                      >
                        <span className={selectedParticipantId ? "text-white" : "text-white/50"}>
                          {getDropdownDisplayText()}
                        </span>
                        <ChevronDown className={cn(
                          "h-5 w-5 text-white/60 transition-transform",
                          isDropdownOpen && "rotate-180"
                        )} />
                      </button>

                      {/* Dropdown Menu */}
                      <AnimatePresence>
                        {isDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-gray-900/95 border border-white/20 shadow-2xl overflow-hidden z-50"
                          >
                            <div className="max-h-48 overflow-y-auto">
                              {availableParticipants.map((participant) => (
                                <button
                                  key={participant.id}
                                  onClick={() => {
                                    setSelectedParticipantId(participant.id);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full py-3 px-4 text-left hover:bg-white/10 transition-colors",
                                    "flex items-center gap-3",
                                    selectedParticipantId === participant.id && "bg-blue-500/20"
                                  )}
                                >
                                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
                                    {participant.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium truncate">{participant.name}</p>
                                    {participant.role && (
                                      <p className="text-white/50 text-xs truncate">{participant.role}</p>
                                    )}
                                  </div>
                                  {selectedParticipantId === participant.id && (
                                    <Check className="h-4 w-4 text-blue-400" />
                                  )}
                                </button>
                              ))}

                              {/* Separator */}
                              <div className="border-t border-white/10 my-1" />

                              {/* "Autre" option */}
                              <button
                                onClick={() => {
                                  setSelectedParticipantId('other');
                                  setIsDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full py-3 px-4 text-left hover:bg-white/10 transition-colors",
                                  "flex items-center gap-3",
                                  isGuestSelected && "bg-blue-500/20"
                                )}
                              >
                                <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center">
                                  <User className="h-4 w-4 text-purple-300" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-white font-medium">Autre (invit)</p>
                                  <p className="text-white/50 text-xs">Create a new guest participant</p>
                                </div>
                                {isGuestSelected && (
                                  <Check className="h-4 w-4 text-blue-400" />
                                )}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Guest Name Fields (only shown if "Autre" is selected) */}
                  <AnimatePresence>
                    {isGuestSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div>
                            <label className="text-white/70 text-sm block mb-2">First name</label>
                            <input
                              type="text"
                              value={guestFirstName}
                              onChange={(e) => setGuestFirstName(e.target.value)}
                              placeholder="John"
                              className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                            />
                          </div>
                          <div>
                            <label className="text-white/70 text-sm block mb-2">Last name</label>
                            <input
                              type="text"
                              value={guestLastName}
                              onChange={(e) => setGuestLastName(e.target.value)}
                              placeholder="Doe"
                              className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Confirm Button */}
            <Button
              onClick={handleConfirm}
              disabled={!isValid}
              className={cn(
                "w-full py-3 rounded-xl font-semibold transition-all",
                isValid
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              )}
            >
              <Check className="h-4 w-4 mr-2" />
              Validate
            </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
