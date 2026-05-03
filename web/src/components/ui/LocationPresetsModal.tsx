'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LOCATION_PRESETS } from '@/data/locationPresets';
import { LocationPreset } from '@/types/ui';
import { BBox, LayerName } from '@/types';
import { LayerStyle } from '@/types/makerPresets';
import { useCustomPresets } from '@/hooks/useCustomPresets';
import { PresetCard } from './PresetCard';

interface LocationPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: LocationPreset) => void;
  currentBbox?: BBox | null;
  currentColors?: { landColor: string; waterColor: string };
  currentLayerStyles?: Record<LayerName, LayerStyle>;
}

export function LocationPresetsModal({
  isOpen,
  onClose,
  onSelectPreset,
  currentBbox,
  currentColors,
  currentLayerStyles,
}: LocationPresetsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'custom'>('all');

  const { customPresets, addPreset, deletePreset } = useCustomPresets();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setShowAddForm(false);
      setNewName('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddForm) {
          setShowAddForm(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showAddForm]);

  // Combine built-in and custom presets
  const allPresets = [...customPresets, ...LOCATION_PRESETS];

  // Filter presets based on tab and search
  const filteredPresets = (() => {
    let presets = activeTab === 'custom' ? customPresets : allPresets;

    if (searchQuery.trim()) {
      presets = presets.filter(
        (preset) =>
          preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          preset.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          preset.tags.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase())
          )
      );
    }

    return presets;
  })();

  const handleSelect = useCallback(
    (preset: LocationPreset) => {
      onSelectPreset(preset);
      onClose();
    },
    [onSelectPreset, onClose]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, presetId: string) => {
      e.stopPropagation();
      if (confirm('Delete this saved location?')) {
        deletePreset(presetId);
      }
    },
    [deletePreset]
  );

  const handleSaveLocation = useCallback(() => {
    if (!currentBbox || !newName.trim()) return;

    addPreset(newName.trim(), currentBbox, {
      landColor: currentColors?.landColor,
      waterColor: currentColors?.waterColor,
      layerStyles: currentLayerStyles,
    });
    setNewName('');
    setShowAddForm(false);
    setActiveTab('custom');
  }, [currentBbox, newName, addPreset, currentColors, currentLayerStyles]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!mounted || !isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Location presets"
    >
      <div className="w-full max-w-3xl max-h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Location Presets
              </h2>
              <p className="text-sm text-neutral-500">
                Jump to a saved or curated map location
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activeTab === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              All ({allPresets.length})
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activeTab === 'custom'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              My Locations ({customPresets.length})
            </button>

            {/* Save current button */}
            {currentBbox && !showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="ml-auto px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Save Current
              </button>
            )}
          </div>

          {/* Add form */}
          {showAddForm && currentBbox && (
            <div className="flex gap-2 mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLocation();
                  if (e.key === 'Escape') setShowAddForm(false);
                }}
                placeholder="Name this location..."
                className="flex-1 px-3 py-2 border border-green-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
              <button
                onClick={handleSaveLocation}
                disabled={!newName.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2 text-neutral-600 hover:bg-neutral-200 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Presets grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredPresets.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              {activeTab === 'custom' && customPresets.length === 0 ? (
                <div>
                  <p className="mb-2">No saved locations yet</p>
                  <p className="text-sm">Select an area on the map and click &quot;Save Current&quot; to add one</p>
                </div>
              ) : (
                'No locations found'
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPresets.map((preset) => (
                <div key={preset.id} className="relative group">
                  <PresetCard
                    preset={preset}
                    onClick={() => handleSelect(preset)}
                  />
                  {/* Delete button for custom presets */}
                  {preset.isCustom && (
                    <button
                      onClick={(e) => handleDelete(e, preset.id)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all shadow-lg"
                      title="Delete this location"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
          <span>
            {filteredPresets.length} {filteredPresets.length === 1 ? 'location' : 'locations'}
            {customPresets.length > 0 && activeTab === 'all' && (
              <span className="ml-1">({customPresets.length} saved)</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded">esc</kbd>
            <span className="ml-1">to close</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
