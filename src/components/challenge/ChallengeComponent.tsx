"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit, Save, X, Plus, Trash2, Target, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChallengeComponentProps, Challenge, Pain, Gain, KpiEstimation } from "@/types";
import { cn, generateId, deepClone } from "@/lib/utils";

/**
 * Challenge management component
 * Displays and allows editing of challenges, pains, gains, and KPI estimations
 * Includes visual feedback for updates from external webhooks
 */
export function ChallengeComponent({
  challenges,
  onUpdateChallenge,
  onDeleteChallenge,
  askKey
}: ChallengeComponentProps) {
  const [editingItem, setEditingItem] = useState<{
    type: 'challenge' | 'pain' | 'gain' | 'kpi';
    challengeId: string;
    itemId?: string;
    kpiIndex?: number;
  } | null>(null);
  
  const [editingValue, setEditingValue] = useState<any>(null);
  const [highlightedItems, setHighlightedItems] = useState<Set<string>>(new Set());

  // Handle highlighting of updated items
  useEffect(() => {
    const newHighlights = new Set<string>();
    challenges.forEach(challenge => {
      if (challenge.isHighlighted) {
        newHighlights.add(challenge.id);
      }
    });
    
    setHighlightedItems(newHighlights);
    
    // Remove highlights after animation
    if (newHighlights.size > 0) {
      const timer = setTimeout(() => {
        setHighlightedItems(new Set());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [challenges]);

  // Start editing an item
  const startEditing = (
    type: 'challenge' | 'pain' | 'gain' | 'kpi',
    challengeId: string,
    itemId?: string,
    kpiIndex?: number
  ) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    let value: any = null;
    
    switch (type) {
      case 'challenge':
        value = { name: challenge.name };
        break;
      case 'pain':
        const pain = challenge.pains.find(p => p.id === itemId);
        if (pain) value = { name: pain.name, description: pain.description };
        break;
      case 'gain':
        const gain = challenge.gains.find(g => g.id === itemId);
        if (gain) value = { name: gain.name, description: gain.description };
        break;
      case 'kpi':
        if (itemId && kpiIndex !== undefined) {
          const item = [...challenge.pains, ...challenge.gains].find(i => i.id === itemId);
          const kpi = item?.kpiEstimations[kpiIndex];
          if (kpi) {
            value = {
              description: kpi.description,
              value: JSON.stringify(kpi.value, null, 2)
            };
          }
        }
        break;
    }

    setEditingItem({ type, challengeId, itemId, kpiIndex });
    setEditingValue(value);
  };

  // Save edited item
  const saveEdit = async () => {
    if (!editingItem || !editingValue) return;

    const challenge = challenges.find(c => c.id === editingItem.challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);

    switch (editingItem.type) {
      case 'challenge':
        updatedChallenge.name = editingValue.name;
        break;
        
      case 'pain':
        const painIndex = updatedChallenge.pains.findIndex(p => p.id === editingItem.itemId);
        if (painIndex >= 0) {
          updatedChallenge.pains[painIndex].name = editingValue.name;
          updatedChallenge.pains[painIndex].description = editingValue.description;
        }
        break;
        
      case 'gain':
        const gainIndex = updatedChallenge.gains.findIndex(g => g.id === editingItem.itemId);
        if (gainIndex >= 0) {
          updatedChallenge.gains[gainIndex].name = editingValue.name;
          updatedChallenge.gains[gainIndex].description = editingValue.description;
        }
        break;
        
      case 'kpi':
        if (editingItem.itemId && editingItem.kpiIndex !== undefined) {
          const allItems = [...updatedChallenge.pains, ...updatedChallenge.gains];
          const item = allItems.find(i => i.id === editingItem.itemId);
          
          if (item && item.kpiEstimations[editingItem.kpiIndex]) {
            try {
              const parsedValue = JSON.parse(editingValue.value);
              item.kpiEstimations[editingItem.kpiIndex] = {
                description: editingValue.description,
                value: parsedValue
              };
              
              // Update the challenge with the modified item
              if (updatedChallenge.pains.some(p => p.id === editingItem.itemId)) {
                const painIndex = updatedChallenge.pains.findIndex(p => p.id === editingItem.itemId);
                updatedChallenge.pains[painIndex] = item;
              } else {
                const gainIndex = updatedChallenge.gains.findIndex(g => g.id === editingItem.itemId);
                updatedChallenge.gains[gainIndex] = item;
              }
            } catch (error) {
              console.error('Invalid JSON in KPI value:', error);
              return;
            }
          }
        }
        break;
    }

    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
    cancelEdit();
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingItem(null);
    setEditingValue(null);
  };

  // Add new items
  const addPain = (challengeId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    const newPain: Pain = {
      id: generateId(),
      name: "New Pain",
      description: "",
      kpiEstimations: []
    };
    
    updatedChallenge.pains.push(newPain);
    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  const addGain = (challengeId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    const newGain: Gain = {
      id: generateId(),
      name: "New Gain",
      description: "",
      kpiEstimations: []
    };
    
    updatedChallenge.gains.push(newGain);
    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  const addKpi = (challengeId: string, itemId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    const newKpi: KpiEstimation = {
      description: "New KPI",
      value: { metric: "value", unit: "units" }
    };

    // Find if it's a pain or gain and add KPI
    const painIndex = updatedChallenge.pains.findIndex(p => p.id === itemId);
    if (painIndex >= 0) {
      updatedChallenge.pains[painIndex].kpiEstimations.push(newKpi);
    } else {
      const gainIndex = updatedChallenge.gains.findIndex(g => g.id === itemId);
      if (gainIndex >= 0) {
        updatedChallenge.gains[gainIndex].kpiEstimations.push(newKpi);
      }
    }

    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  // Delete items
  const deletePain = (challengeId: string, painId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    updatedChallenge.pains = updatedChallenge.pains.filter(p => p.id !== painId);
    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  const deleteGain = (challengeId: string, gainId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    updatedChallenge.gains = updatedChallenge.gains.filter(g => g.id !== gainId);
    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  const deleteKpi = (challengeId: string, itemId: string, kpiIndex: number) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const updatedChallenge = deepClone(challenge);
    
    const painIndex = updatedChallenge.pains.findIndex(p => p.id === itemId);
    if (painIndex >= 0) {
      updatedChallenge.pains[painIndex].kpiEstimations.splice(kpiIndex, 1);
    } else {
      const gainIndex = updatedChallenge.gains.findIndex(g => g.id === itemId);
      if (gainIndex >= 0) {
        updatedChallenge.gains[gainIndex].kpiEstimations.splice(kpiIndex, 1);
      }
    }

    updatedChallenge.updatedAt = new Date().toISOString();
    onUpdateChallenge(updatedChallenge);
  };

  const handleDeleteChallenge = (challengeId: string) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const linkedSummaries = [
      challenge.pains.length > 0
        ? `${challenge.pains.length} pain${challenge.pains.length > 1 ? "s" : ""}`
        : null,
      challenge.gains.length > 0
        ? `${challenge.gains.length} gain${challenge.gains.length > 1 ? "s" : ""}`
        : null
    ].filter((value): value is string => Boolean(value));

    const confirmMessage = linkedSummaries.length > 0
      ? `Delete the challenge "${challenge.name}"? This will also remove ${linkedSummaries.join(" and ")}.`
      : `Delete the challenge "${challenge.name}"? This action cannot be undone.`;

    if (typeof window !== "undefined") {
      const isConfirmed = window.confirm(confirmMessage);
      if (!isConfirmed) {
        return;
      }
    }

    if (onDeleteChallenge) {
      onDeleteChallenge(challengeId);
    } else {
      console.warn("Delete challenge handler is not provided.");
    }
  };

  if (challenges.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Challenges Yet</h3>
          <p className="text-muted-foreground">
            Challenges will appear here as they are generated from the conversation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <AnimatePresence>
        {challenges.map((challenge) => (
          <motion.div
            key={challenge.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "transition-all duration-2000",
              highlightedItems.has(challenge.id) && "animate-highlight-change"
            )}
          >
            <ChallengeCard
              challenge={challenge}
              editingItem={editingItem}
              editingValue={editingValue}
              onStartEdit={startEditing}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onEditValueChange={setEditingValue}
              onAddPain={addPain}
              onAddGain={addGain}
              onAddKpi={addKpi}
              onDeletePain={deletePain}
              onDeleteGain={deleteGain}
              onDeleteKpi={deleteKpi}
              onDeleteChallenge={handleDeleteChallenge}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Individual challenge card component
 */
function ChallengeCard({
  challenge,
  editingItem,
  editingValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditValueChange,
  onAddPain,
  onAddGain,
  onAddKpi,
  onDeletePain,
  onDeleteGain,
  onDeleteKpi,
  onDeleteChallenge,
}: {
  challenge: Challenge;
  editingItem: any;
  editingValue: any;
  onStartEdit: (type: any, challengeId: string, itemId?: string, kpiIndex?: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: any) => void;
  onAddPain: (challengeId: string) => void;
  onAddGain: (challengeId: string) => void;
  onAddKpi: (challengeId: string, itemId: string) => void;
  onDeletePain: (challengeId: string, painId: string) => void;
  onDeleteGain: (challengeId: string, gainId: string) => void;
  onDeleteKpi: (challengeId: string, itemId: string, kpiIndex: number) => void;
  onDeleteChallenge?: (challengeId: string) => void;
}) {
  const isEditingChallenge = editingItem?.type === 'challenge' && editingItem?.challengeId === challenge.id;

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          {isEditingChallenge ? (
            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Input
                value={editingValue?.name || ''}
                onChange={(e) => onEditValueChange({ ...editingValue, name: e.target.value })}
                className="text-xl font-bold md:flex-1"
                placeholder="Challenge name"
              />
              <div className="flex flex-wrap items-center gap-2 md:flex-shrink-0">
                <Button size="sm" className="gap-2" onClick={onSaveEdit}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button size="sm" variant="glassDark" className="gap-2" onClick={onCancelEdit}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {challenge.name}
              </CardTitle>
              <div className="flex items-center gap-1">
                {onDeleteChallenge && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive gap-1"
                    onClick={() => onDeleteChallenge(challenge.id)}
                    aria-label={`Delete challenge ${challenge.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onStartEdit('challenge', challenge.id)}
                  aria-label={`Edit challenge ${challenge.name}`}
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Pains Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Pains
            </h4>
            <Button 
              size="sm" 
              className="btn-gradient gap-2"
              onClick={() => onAddPain(challenge.id)}
            >
              <Plus className="h-4 w-4" />
              Add Pain
            </Button>
          </div>
          
          <div className="space-y-4">
            {challenge.pains.map((pain) => (
              <PainGainItem
                key={pain.id}
                item={pain}
                type="pain"
                challengeId={challenge.id}
                editingItem={editingItem}
                editingValue={editingValue}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onEditValueChange={onEditValueChange}
                onAddKpi={onAddKpi}
                onDeleteItem={(id) => onDeletePain(challenge.id, id)}
                onDeleteKpi={onDeleteKpi}
              />
            ))}
            
            {challenge.pains.length === 0 && (
              <p className="text-muted-foreground text-sm italic">No pains identified yet.</p>
            )}
          </div>
        </div>

        {/* Gains Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Gains
            </h4>
            <Button 
              size="sm" 
              className="btn-gradient gap-2"
              onClick={() => onAddGain(challenge.id)}
            >
              <Plus className="h-4 w-4" />
              Add Gain
            </Button>
          </div>
          
          <div className="space-y-4">
            {challenge.gains.map((gain) => (
              <PainGainItem
                key={gain.id}
                item={gain}
                type="gain"
                challengeId={challenge.id}
                editingItem={editingItem}
                editingValue={editingValue}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onEditValueChange={onEditValueChange}
                onAddKpi={onAddKpi}
                onDeleteItem={(id) => onDeleteGain(challenge.id, id)}
                onDeleteKpi={onDeleteKpi}
              />
            ))}
            
            {challenge.gains.length === 0 && (
              <p className="text-muted-foreground text-sm italic">No gains identified yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Pain/Gain item component with KPI management
 */
function PainGainItem({
  item,
  type,
  challengeId,
  editingItem,
  editingValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditValueChange,
  onAddKpi,
  onDeleteItem,
  onDeleteKpi,
}: {
  item: Pain | Gain;
  type: 'pain' | 'gain';
  challengeId: string;
  editingItem: any;
  editingValue: any;
  onStartEdit: (type: any, challengeId: string, itemId?: string, kpiIndex?: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: any) => void;
  onAddKpi: (challengeId: string, itemId: string) => void;
  onDeleteItem: (id: string) => void;
  onDeleteKpi: (challengeId: string, itemId: string, kpiIndex: number) => void;
}) {
  const isEditing = editingItem?.type === type && editingItem?.itemId === item.id;

  return (
    <Card className="bg-muted/50">
      <CardContent className="pt-4">
        {/* Name and Description */}
        <div className="mb-4">
          {isEditing ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <Input
                  value={editingValue?.name || ''}
                  onChange={(e) => onEditValueChange({ ...editingValue, name: e.target.value })}
                  placeholder={`${type} name`}
                  className="font-semibold md:flex-1"
                />
                <div className="flex flex-wrap items-center gap-2 md:flex-shrink-0">
                  <Button size="sm" className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400" onClick={onSaveEdit}>
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={onCancelEdit}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
              <Textarea
                value={editingValue?.description || ''}
                onChange={(e) => onEditValueChange({ ...editingValue, description: e.target.value })}
                placeholder={`Describe this ${type}...`}
                className="min-h-[80px]"
              />
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h5 className="font-semibold text-base mb-2">{item.name}</h5>
                {item.description ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {item.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description provided
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-4">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onStartEdit(type, challengeId, item.id)}
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDeleteItem(item.id)}
                  className="text-destructive gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* KPI Estimations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h6 className="text-sm font-medium text-muted-foreground">KPI Estimations</h6>
            <Button 
              size="sm" 
              variant="outline"
              className="gap-2"
              onClick={() => onAddKpi(challengeId, item.id)}
            >
              <Plus className="h-3 w-3" />
              Add KPI
            </Button>
          </div>
          
          <div className="space-y-2">
            {item.kpiEstimations.map((kpi, index) => (
              <KpiItem
                key={index}
                kpi={kpi}
                index={index}
                itemId={item.id}
                challengeId={challengeId}
                editingItem={editingItem}
                editingValue={editingValue}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onEditValueChange={onEditValueChange}
                onDeleteKpi={onDeleteKpi}
              />
            ))}
            
            {item.kpiEstimations.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No KPI estimations yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Individual KPI estimation component
 */
function KpiItem({
  kpi,
  index,
  itemId,
  challengeId,
  editingItem,
  editingValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditValueChange,
  onDeleteKpi,
}: {
  kpi: KpiEstimation;
  index: number;
  itemId: string;
  challengeId: string;
  editingItem: any;
  editingValue: any;
  onStartEdit: (type: any, challengeId: string, itemId?: string, kpiIndex?: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: any) => void;
  onDeleteKpi: (challengeId: string, itemId: string, kpiIndex: number) => void;
}) {
  const isEditing = editingItem?.type === 'kpi' && 
                   editingItem?.itemId === itemId && 
                   editingItem?.kpiIndex === index;

  return (
    <div className="border rounded-lg p-3 bg-background">
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Input
              value={editingValue?.description || ''}
              onChange={(e) => onEditValueChange({ ...editingValue, description: e.target.value })}
              placeholder="KPI description"
              className="md:flex-1"
            />
            <div className="flex flex-wrap items-center gap-2 md:flex-shrink-0">
              <Button size="sm" className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400" onClick={onSaveEdit}>
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={onCancelEdit}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
          <Textarea
            value={editingValue?.value || ''}
            onChange={(e) => onEditValueChange({ ...editingValue, value: e.target.value })}
            placeholder='{"metric": "value", "unit": "units"}'
            className="min-h-[80px] font-mono text-sm"
          />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium mb-1">{kpi.description}</p>
            <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(kpi.value, null, 2)}
            </pre>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => onStartEdit('kpi', challengeId, itemId, index)}
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeleteKpi(challengeId, itemId, index)}
              className="text-destructive gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
