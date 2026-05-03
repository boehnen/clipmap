'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Command } from '@/types/ui';
import { COMMAND_CATEGORIES } from '@/data/commands';
import { useCommandPaletteShortcuts } from '@/hooks/useKeyboardShortcuts';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.keywords.some((kw) => kw.includes(lowerQuery))
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Flat list for navigation
  const flatList = useMemo(() => {
    const items: { type: 'header' | 'command'; category?: string; command?: Command }[] = [];
    Object.entries(groupedCommands).forEach(([category, cmds]) => {
      items.push({ type: 'header', category });
      cmds.forEach((cmd) => items.push({ type: 'command', command: cmd }));
    });
    return items;
  }, [groupedCommands]);

  // Command items only (for selection)
  const commandItems = useMemo(
    () => flatList.filter((item) => item.type === 'command'),
    [flatList]
  );

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Keep selected item in view
  useEffect(() => {
    if (!listRef.current || commandItems.length === 0) return;

    const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, commandItems.length]);

  const handleNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedIndex((prev) => {
        if (direction === 'up') {
          return prev <= 0 ? commandItems.length - 1 : prev - 1;
        } else {
          return prev >= commandItems.length - 1 ? 0 : prev + 1;
        }
      });
    },
    [commandItems.length]
  );

  const handleSelect = useCallback(() => {
    const item = commandItems[selectedIndex];
    if (item?.command) {
      item.command.action();
      onClose();
    }
  }, [commandItems, selectedIndex, onClose]);

  useCommandPaletteShortcuts(isOpen, onClose, handleNavigate, handleSelect);

  // Handle click outside
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
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-neutral-400"
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
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search commands..."
              className="flex-1 text-sm outline-none placeholder-neutral-400"
            />
            <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-medium text-neutral-500 bg-neutral-100 rounded">
              esc
            </kbd>
          </div>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-neutral-500 text-sm">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-3 py-2 text-xs font-medium text-neutral-400 uppercase">
                  {COMMAND_CATEGORIES[category] || category}
                </div>
                {cmds.map((cmd) => {
                  const cmdIndex = commandItems.findIndex(
                    (item) => item.command?.id === cmd.id
                  );
                  const isSelected = cmdIndex === selectedIndex;

                  return (
                    <button
                      key={cmd.id}
                      data-index={cmdIndex}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(cmdIndex)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="px-2 py-0.5 text-xs font-medium text-neutral-400 bg-neutral-100 rounded">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">↓</kbd>
            <span className="ml-1">Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">↵</kbd>
            <span className="ml-1">Select</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">esc</kbd>
            <span className="ml-1">Close</span>
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
